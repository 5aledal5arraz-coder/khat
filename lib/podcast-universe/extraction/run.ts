/**
 * Guest extraction run (B6, B13) — one Luna call per job, chained.
 *
 * A run is a `podcast_crawl_runs` row of type `guest_extract` with its own
 * `budget_limit_usd` (default $3.00, B13). Each job:
 *   1. claims up to `batch_size` (40; 20 after a schema failure) eligible
 *      episodes — CORE_INTERVIEW channel × CORE_LONGFORM × pending × public —
 *      marking them `running`;
 *   2. REFUSES the call when spent + estimate > cap: the claimed episodes go
 *      back to `pending`, the run becomes `budget_stopped`, and nothing is
 *      silently skipped;
 *   3. calls Luna through `runAiTask()` (task kind `structural`, prompt
 *      version `podcast-universe-guest-extract-v1`, subject = the run);
 *   4. validates deterministically (validate.ts) and persists each episode in
 *      its own transaction: appearances + status together;
 *   5. enqueues `podcast.person.resolve` for the touched people and the next
 *      batch.
 *
 * Distinct terminal states per episode (D8): succeeded (≥1 guest) · no_guest
 * (the model returned an empty, valid list) · failed + note (AI error after
 * retries, schema failure at the fallback size, or missing twice) · back to
 * pending (budget stop / transient retry).
 */
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { podcastCrawlRuns, podcastEpisodes } from "@/lib/db/schema/podcast-universe"
import { runAiTask, lookupPricing } from "@/lib/ai-router"
import { PODCAST_GUEST_EXTRACT_MODEL } from "@/lib/ai-router/registry"
import type { AiTaskRequest, AiTaskResult } from "@/lib/ai-router"
import {
  EXTRACT_BATCH_DEFAULT,
  EXTRACT_BATCH_FALLBACK,
  EXTRACT_BATCH_MAX,
  M1_EXTRACT_BUDGET_USD,
} from "../constants"
import { attachGuest, recordSameEpisodeAlias, supersedeUnreproduced } from "../people"
import { collapseSameEpisodeAliases } from "./same-episode"
import { hostsForEpisode, type ProgramHosts } from "../hosts"
import { billableCostUsd, checkBudget, estimateBatchCostUsd, maxOutputTokensFor, type Pricing } from "./budget"
import {
  PROMPT_VERSION,
  SYSTEM_RULES,
  buildUserMessage,
  descriptionExcerpt,
  type ExtractionInputEpisode,
} from "./prompt"
import { validateExtraction, type SourceEpisode, type ValidationIssue } from "./validate"

export const EXTRACT_ACTOR = "system:podcast.episode.guest_extract"
const ISSUE_LOG_CAP = 300
const MISSING_ONCE = "missing_from_model_output_once"
/**
 * A batch that produced validation issues is a confused reply; its episodes
 * that came back with NO surviving guest get one more pass before their
 * no_guest / failed is final (yousef 2026-10-03).
 */
const RECHECK_ONCE = "recheck_after_batch_validation_issues_once"
const hadSecondChance = (note: string | null | undefined) => note === MISSING_ONCE || note === RECHECK_ONCE

export interface ExtractCursor {
  batch_size: number
  batches_done: number
  validation_issues: number
  issues_sample: ValidationIssue[]
  schema_failures: number
  [k: string]: unknown
}

export interface ExtractDeps {
  runAi?: <T>(req: AiTaskRequest) => Promise<AiTaskResult<T>>
  resolvePricing?: () => Promise<{ model: string; pricing: Pricing | null }>
  enqueueNext?: (runId: string, batchNo: number) => Promise<void>
  enqueueResolve?: (personIds: string[]) => Promise<void>
  /** Test seam: restrict claiming to these channels (production claims across all). */
  scopeChannelIds?: string[]
}

export type BatchOutcome =
  | { status: "done"; reason: string }
  | { status: "budget_stopped"; reason: string }
  | { status: "processed"; episodes: number; guests: number; failed: number; costUsd: number; recheck?: number }
  | { status: "retry_smaller_batch"; batchSize: number }
  | { status: "failed"; reason: string }

/** Thrown for a transient AI failure so the worker retries the batch (B12). */
export class TransientExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransientExtractionError"
  }
}

/** Router error classes worth retrying (lib/ai-router/router.ts#classifyError). */
const TRANSIENT_AI = new Set(["rate_limited", "timeout", "server_error"])
/** Retrying cannot help, and failing the episodes would be a lie (D8): stop the run. */
const RUN_STOPPING_AI = new Set(["quota_exceeded", "auth_failed"])

/** Pricing of the PINNED extraction model (never the global structural choice). */
export async function defaultPricing(): Promise<{ model: string; pricing: Pricing | null }> {
  const model = PODCAST_GUEST_EXTRACT_MODEL
  return { model, pricing: lookupPricing("openai", model) }
}

/** Every guest_extract run's recorded cost + open reservations. */
export async function committedExtractionUsd(): Promise<{ spent: number; reserved: number }> {
  const r = await db!.execute(sql`
    SELECT COALESCE(SUM(ai_cost_usd), 0)::float8 AS spent, COALESCE(SUM(reserved_usd), 0)::float8 AS reserved
    FROM podcast_crawl_runs WHERE run_type = 'guest_extract'
  `)
  const row = r.rows[0] as { spent: number; reserved: number }
  return { spent: Number(row.spent), reserved: Number(row.reserved) }
}

/**
 * Reserve `estimate` for one call, atomically (advisory lock): refused when
 * spent + reserved + estimate > limit. Returns the gate decision.
 */
async function reserveBudget(runId: string, estimate: number, limit: number) {
  return db!.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('podcast-universe:extract-budget'))`)
    const r = await tx.execute(sql`
      SELECT COALESCE(SUM(ai_cost_usd), 0)::float8 AS spent, COALESCE(SUM(reserved_usd), 0)::float8 AS reserved
      FROM podcast_crawl_runs WHERE run_type = 'guest_extract'`)
    const row = r.rows[0] as { spent: number; reserved: number }
    const gate = checkBudget(Number(row.spent) + Number(row.reserved), estimate, limit)
    if (gate.allowed) {
      await tx
        .update(podcastCrawlRuns)
        .set({ reserved_usd: sql`${podcastCrawlRuns.reserved_usd} + ${estimate.toFixed(6)}` })
        .where(eq(podcastCrawlRuns.id, runId))
    }
    return gate
  })
}

/** Release the reservation and book what the call actually cost. */
async function settleBudget(runId: string, reserved: number, billable: number) {
  await db!
    .update(podcastCrawlRuns)
    .set({
      reserved_usd: sql`GREATEST(${podcastCrawlRuns.reserved_usd} - ${reserved.toFixed(6)}, 0)`,
      ai_cost_usd: sql`${podcastCrawlRuns.ai_cost_usd} + ${billable.toFixed(6)}`,
    })
    .where(eq(podcastCrawlRuns.id, runId))
}

/**
 * TOTAL AI spend of every guest_extract run ever (noura 2026-10-03): the B13
 * $3 cap is for the whole M1 extraction, not per run — a new run after a
 * budget stop inherits everything already spent.
 */
export async function totalExtractionSpendUsd(): Promise<number> {
  const r = await db!.execute(sql`
    SELECT COALESCE(SUM(ai_cost_usd), 0)::float8 AS spent FROM podcast_crawl_runs WHERE run_type = 'guest_extract'
  `)
  return Number((r.rows[0] as { spent: number }).spent)
}

async function activeExtractionRunId(): Promise<string | null> {
  const active = await db!
    .select({ id: podcastCrawlRuns.id })
    .from(podcastCrawlRuns)
    .where(and(eq(podcastCrawlRuns.run_type, "guest_extract"), inArray(podcastCrawlRuns.status, ["queued", "running"])))
    .limit(1)
  return active[0]?.id ?? null
}

/**
 * Create a guest_extract run, or return the active one. Race-safe: the partial
 * unique index `uq_podcast_crawl_runs_active_extract` (migration 0039) lets at
 * most one queued/running run exist, so two concurrent starts produce ONE row.
 */
export async function createExtractionRun(budgetUsd = M1_EXTRACT_BUDGET_USD): Promise<{ runId: string; reused: boolean }> {
  const active = await activeExtractionRunId()
  if (active) return { runId: active, reused: true }
  const cursor: ExtractCursor = {
    batch_size: EXTRACT_BATCH_DEFAULT,
    batches_done: 0,
    validation_issues: 0,
    issues_sample: [],
    schema_failures: 0,
  }
  const [row] = await db!
    .insert(podcastCrawlRuns)
    .values({
      run_type: "guest_extract",
      status: "queued",
      budget_limit_usd: Math.min(budgetUsd, M1_EXTRACT_BUDGET_USD).toFixed(6),
      cursor_state: cursor,
    })
    .onConflictDoNothing()
    .returning({ id: podcastCrawlRuns.id })
  if (row) return { runId: row.id, reused: false }
  const winner = await activeExtractionRunId()
  if (!winner) throw new Error("createExtractionRun: lost a race and found no active run")
  return { runId: winner, reused: true }
}

async function revertToPending(runId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db!
    .update(podcastEpisodes)
    .set({ guest_extraction_status: "pending", updated_at: new Date() })
    .where(and(inArray(podcastEpisodes.id, ids), eq(podcastEpisodes.guest_extraction_status, "running")))
}

async function failEpisodes(runId: string, ids: string[], note: string): Promise<void> {
  if (ids.length === 0) return
  await db!
    .update(podcastEpisodes)
    .set({ guest_extraction_status: "failed", guest_extraction_note: note.slice(0, 500), guest_extraction_run_id: runId, updated_at: new Date() })
    .where(inArray(podcastEpisodes.id, ids))
}

async function setRun(runId: string, patch: Partial<typeof podcastCrawlRuns.$inferInsert>): Promise<void> {
  await db!.update(podcastCrawlRuns).set(patch).where(eq(podcastCrawlRuns.id, runId))
}

/** Claim the next batch of eligible pending episodes (B6 filter). */
async function claimBatch(runId: string, size: number, scope?: string[]) {
  const scopeSql =
    scope && scope.length > 0 ? sql`AND c.id IN (${sql.join(scope.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``
  return db!.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT e.id, e.title, e.description, e.duration_seconds, e.published_at, e.guest_extraction_note, c.name AS channel_name, c.id AS channel_id, c.host_names, c.program_hosts
      FROM podcast_episodes e
      JOIN podcast_channels c ON c.id = e.channel_id
      WHERE c.registry_type = 'core_interview'
        AND e.duration_class = 'core_longform'
        AND e.guest_extraction_status = 'pending'
        AND e.availability_status = 'public'
        ${scopeSql}
      ORDER BY e.published_at DESC, e.id
      LIMIT ${size}
      FOR UPDATE OF e SKIP LOCKED
    `)
    const eps = rows.rows as Array<{
      id: string
      title: string
      description: string | null
      duration_seconds: number
      published_at: Date | string
      guest_extraction_note: string | null
      channel_name: string
      channel_id: string
      host_names: string[] | null
      program_hosts: ProgramHosts[] | null
    }>
    if (eps.length > 0) {
      await tx
        .update(podcastEpisodes)
        .set({ guest_extraction_status: "running", guest_extraction_run_id: runId, updated_at: new Date() })
        .where(inArray(podcastEpisodes.id, eps.map((e) => e.id)))
    }
    return eps
  })
}

export async function runExtractionBatch(runId: string, batchNo: number, ctx: { attempt: number; maxAttempts: number }, deps: ExtractDeps = {}): Promise<BatchOutcome> {
  const runAi = deps.runAi ?? (runAiTask as NonNullable<ExtractDeps["runAi"]>)
  const [run] = await db!.select().from(podcastCrawlRuns).where(eq(podcastCrawlRuns.id, runId)).limit(1)
  if (!run || run.run_type !== "guest_extract") return { status: "failed", reason: `run ${runId} not found` }
  if (run.status === "succeeded" || run.status === "budget_stopped" || run.status === "failed") {
    return { status: "done", reason: `run already ${run.status}` }
  }
  const cursor = { ...(run.cursor_state ?? {}) } as ExtractCursor
  cursor.batch_size = Math.min(EXTRACT_BATCH_MAX, cursor.batch_size || EXTRACT_BATCH_DEFAULT)
  cursor.issues_sample = cursor.issues_sample ?? []

  // Crash recovery: anything this run left `running` goes back to pending.
  await db!
    .update(podcastEpisodes)
    .set({ guest_extraction_status: "pending", updated_at: new Date() })
    .where(and(eq(podcastEpisodes.guest_extraction_run_id, runId), eq(podcastEpisodes.guest_extraction_status, "running")))

  // Crash recovery: a reservation this run left open (worker died mid-call)
  // is released — only one batch of a run is ever in flight.
  await setRun(runId, { status: "running", started_at: run.started_at ?? new Date(), reserved_usd: "0" })

  const eps = await claimBatch(runId, cursor.batch_size, deps.scopeChannelIds)
  if (eps.length === 0) {
    await setRun(runId, { status: "succeeded", completed_at: new Date(), cursor_state: cursor })
    return { status: "done", reason: "no eligible pending episodes" }
  }
  const ids = eps.map((e) => e.id)

  const input: ExtractionInputEpisode[] = eps.map((e) => ({
    episode_id: e.id,
    channel_name: e.channel_name,
    title: e.title,
    description_excerpt: descriptionExcerpt(e.description),
    duration_seconds: Number(e.duration_seconds),
    published_at: new Date(e.published_at).toISOString(),
    channel_hosts: hostsForEpisode(e.host_names, e.program_hosts, e.title),
  }))
  const user = buildUserMessage(input)

  // ── Hard budget gate (B13) ───────────────────────────────────────────
  const { model, pricing } = await (deps.resolvePricing ?? defaultPricing)()
  if (!pricing) {
    await revertToPending(runId, ids)
    const reason = `no pricing registered for "${model}" — the budget cannot be enforced, refusing to call`
    await setRun(runId, { status: "failed", completed_at: new Date(), error_summary: reason, cursor_state: cursor })
    return { status: "failed", reason }
  }
  // TOTAL across every guest_extract run, against the smaller of this run's
  // cap and the M1 cap — never a fresh budget per run.
  const limit = Math.min(Number(run.budget_limit_usd ?? 0), M1_EXTRACT_BUDGET_USD)
  const maxTokens = maxOutputTokensFor(eps.length)
  const estimate = estimateBatchCostUsd(SYSTEM_RULES.length + user.length, eps.length, pricing)
  // Reserve the worst case for the duration of the call (spent + reserved + estimate ≤ cap).
  const gate = await reserveBudget(runId, estimate, limit)
  if (!gate.allowed) {
    await revertToPending(runId, ids)
    await setRun(runId, { status: "budget_stopped", completed_at: new Date(), error_summary: gate.reason, cursor_state: cursor })
    return { status: "budget_stopped", reason: gate.reason }
  }

  // ── The one paid call ────────────────────────────────────────────────
  let result: AiTaskResult<unknown>
  try {
    result = await runAi<unknown>({
      // Dedicated, PINNED kind — KHAT_AI_MODEL_STRUCTURAL never reaches it.
      taskKind: "podcast_guest_extract",
      preferredModel: PODCAST_GUEST_EXTRACT_MODEL,
      promptVersion: PROMPT_VERSION,
      subjectTable: "podcast_crawl_runs",
      subjectId: runId,
      actorId: EXTRACT_ACTOR,
      input: { batch_no: batchNo, batch_size: eps.length, episode_ids: ids, prompt_version: PROMPT_VERSION },
      prompt: [
        { role: "system", content: SYSTEM_RULES },
        { role: "user", content: user },
      ],
      expectJson: true,
      // Explicit output ceiling sized to the batch (rashid): a reply that
      // hits it is truncated and handled as a size failure below.
      providerOptions: { max_tokens: maxTokens },
    })
  } catch (err) {
    // The router threw before/around the provider (e.g. our own rate limiter):
    // no provider usage was booked, so the reservation is released at 0.
    await settleBudget(runId, estimate, 0)
    await revertToPending(runId, ids)
    throw new TransientExtractionError(err instanceof Error ? err.message : String(err))
  }
  // Release the reservation; book the ACTUAL billable cost (0 for a call the
  // provider never billed — e.g. 429 / no credits).
  const cost = billableCostUsd(result, pricing, estimate)
  await settleBudget(runId, estimate, cost)

  /**
   * B6 size failure: fall back to EXTRACT_BATCH_FALLBACK and re-offer the same
   * episodes; at the fallback size the failure is final and explicit.
   */
  const sizeFailure = async (reason: string): Promise<BatchOutcome> => {
    cursor.schema_failures += 1
    if (cursor.batch_size > EXTRACT_BATCH_FALLBACK) {
      cursor.batch_size = EXTRACT_BATCH_FALLBACK
      await revertToPending(runId, ids)
      await setRun(runId, { cursor_state: cursor })
      await (deps.enqueueNext ?? defaultEnqueueNext)(runId, batchNo + 1)
      return { status: "retry_smaller_batch", batchSize: cursor.batch_size }
    }
    await failEpisodes(runId, ids, `${reason} at batch size ${cursor.batch_size} (ai_run ${result.runId})`)
    cursor.batches_done += 1
    await setRun(runId, { cursor_state: cursor })
    await (deps.enqueueNext ?? defaultEnqueueNext)(runId, batchNo + 1)
    return { status: "processed", episodes: eps.length, guests: 0, failed: eps.length, costUsd: cost }
  }

  if (result.status !== "succeeded") {
    const why = `${result.errorClass ?? result.status}: ${result.errorMessage ?? ""}`.slice(0, 400)
    // A timeout on a big batch is a size problem first (rashid): shrink to 20.
    if (result.errorClass === "timeout" && cursor.batch_size > EXTRACT_BATCH_FALLBACK) {
      return sizeFailure("timeout")
    }
    if (RUN_STOPPING_AI.has(String(result.errorClass ?? ""))) {
      await revertToPending(runId, ids)
      await setRun(runId, { status: "failed", completed_at: new Date(), error_summary: `AI provider: ${why}`, cursor_state: cursor })
      return { status: "failed", reason: why }
    }
    const transient = TRANSIENT_AI.has(String(result.errorClass ?? ""))
    if (transient && ctx.attempt < ctx.maxAttempts) {
      await revertToPending(runId, ids)
      throw new TransientExtractionError(`AI call failed (${why}) — batch will retry`)
    }
    await failEpisodes(runId, ids, `ai_error ${why} (run ${result.runId})`)
    cursor.batches_done += 1
    await setRun(runId, { cursor_state: cursor })
    await (deps.enqueueNext ?? defaultEnqueueNext)(runId, batchNo + 1)
    return { status: "processed", episodes: eps.length, guests: 0, failed: eps.length, costUsd: cost }
  }

  // A reply the router had to truncation-repair is cut off: whatever episodes
  // it "returned" are a prefix, and an empty guests list in it means nothing.
  // Never write no_guest from it — it is a size failure (rashid).
  if (result.jsonRepairStage === "truncation_repair") {
    return sizeFailure("truncated_output")
  }

  const sources: SourceEpisode[] = eps.map((e) => ({ id: e.id, title: e.title, description: e.description, hostNames: hostsForEpisode(e.host_names, e.program_hosts, e.title) }))
  const report = validateExtraction(result.parsed, sources)

  if (report.schemaFailure) {
    return sizeFailure("schema_failure")
  }

  // Log every validation failure (B6) — count + a capped sample on the run.
  for (const issue of report.issues) {
    cursor.validation_issues += 1
    if (cursor.issues_sample.length < ISSUE_LOG_CAP) cursor.issues_sample.push(issue)
  }
  if (report.issues.length > 0) {
    console.warn(`[podcast-universe] batch ${batchNo}: ${report.issues.length} validation issue(s) — see run ${runId} cursor_state.issues_sample`)
  }

  const touched = new Set<string>()
  let guests = 0
  let failed = 0
  const channelOf = new Map(eps.map((e) => [e.id, e.channel_id]))
  const priorNote = new Map(eps.map((e) => [e.id, e.guest_extraction_note]))
  // A listed host being skipped is the system working, not a confused reply.
  const batchHadIssues = report.issues.some((i) => i.severity !== "host_excluded")
  const recheck: string[] = []
  for (const [episodeId, res] of report.results) {
    const issues = report.issues.filter((i) => i.episode_id === episodeId)
    if (res.guests.length === 0 && batchHadIssues && !hadSecondChance(priorNote.get(episodeId))) {
      recheck.push(episodeId)
      continue
    }
    const finalStatus =
      res.guests.length > 0 ? "succeeded" : issues.some((i) => i.severity === "guest_rejected") ? "failed" : "no_guest"
    // Same-episode alias: «دينا» folded into «الكوتش دينا عبد المقصود» —
    // one person, one active appearance (deterministic, audited below).
    const collapsed = collapseSameEpisodeAliases(res.guests)
    await db!.transaction(async (tx) => {
      const keep: string[] = []
      const personOf = new Map<string, string>()
      for (const g of collapsed.guests) {
        const a = await attachGuest(tx, {
          episodeId,
          channelId: channelOf.get(episodeId)!,
          guest: g,
          topicHint: res.topic_hint,
          aiRunId: result.runId,
          actor: EXTRACT_ACTOR,
        })
        touched.add(a.personId)
        keep.push(a.appearanceId)
        personOf.set(g.display_name, a.personId)
      }
      for (const al of collapsed.aliases) {
        const personId = personOf.get(al.of)
        if (personId) await recordSameEpisodeAlias(tx, personId, al.alias, al.of, episodeId, EXTRACT_ACTOR)
      }
      // Re-extraction REPLACES: a successful result (guests or a clean
      // no_guest) supersedes what it did not reproduce. A failed result is
      // not a result — it supersedes nothing.
      if (finalStatus !== "failed") {
        const gone = await supersedeUnreproduced(tx, episodeId, keep, EXTRACT_ACTOR, `re-extraction run ${runId} (ai_run ${result.runId})`)
        for (const g of gone) touched.add(g.person_id)
      }
      await tx
        .update(podcastEpisodes)
        .set({
          // A guest the model named but could not evidence is NOT "no guest"
          // (D8): with no surviving guest the episode fails with the reason.
          guest_extraction_status: finalStatus,
          content_kind: res.content_kind,
          guest_extraction_note: issues.length > 0 ? issues.map((i) => `${i.severity}: ${i.reason}`).join(" | ").slice(0, 500) : null,
          guest_extraction_run_id: runId,
          updated_at: new Date(),
        })
        .where(eq(podcastEpisodes.id, episodeId))
    })
    guests += collapsed.guests.length
    if (res.guests.length === 0 && issues.some((i) => i.severity === "guest_rejected")) failed += 1
  }

  if (recheck.length > 0) {
    await db!
      .update(podcastEpisodes)
      .set({ guest_extraction_status: "pending", guest_extraction_note: RECHECK_ONCE, updated_at: new Date() })
      .where(inArray(podcastEpisodes.id, recheck))
  }

  // Episodes the model skipped: one more chance, then an explicit failure.
  const retryMissing: string[] = []
  const failMissing: string[] = []
  for (const id of report.missing) (hadSecondChance(priorNote.get(id)) ? failMissing : retryMissing).push(id)
  if (retryMissing.length > 0) {
    await db!
      .update(podcastEpisodes)
      .set({ guest_extraction_status: "pending", guest_extraction_note: MISSING_ONCE, updated_at: new Date() })
      .where(inArray(podcastEpisodes.id, retryMissing))
  }
  await failEpisodes(runId, failMissing, "model returned no valid result for this episode twice")
  failed += failMissing.length

  cursor.batches_done += 1
  await setRun(runId, { cursor_state: cursor })
  if (touched.size > 0) await (deps.enqueueResolve ?? defaultEnqueueResolve)([...touched])
  await (deps.enqueueNext ?? defaultEnqueueNext)(runId, batchNo + 1)
  return { status: "processed", episodes: eps.length, guests, failed, costUsd: cost, recheck: recheck.length + retryMissing.length }
}

// Lazily imported so this module stays loadable without the queue (tests).
async function defaultEnqueueNext(runId: string, batchNo: number): Promise<void> {
  const { enqueueGuestExtractBatch } = await import("../jobs")
  await enqueueGuestExtractBatch(runId, batchNo)
}

async function defaultEnqueueResolve(personIds: string[]): Promise<void> {
  const { enqueuePersonResolve } = await import("../jobs")
  await enqueuePersonResolve(personIds)
}

/** Extraction coverage for the admin screen and the B18 "no silent pending" check. */
export async function extractionCoverage(): Promise<Record<string, number>> {
  const res = await db!.execute(sql`
    SELECT e.guest_extraction_status AS status, count(*)::int AS n
    FROM podcast_episodes e JOIN podcast_channels c ON c.id = e.channel_id
    WHERE c.registry_type = 'core_interview' AND e.duration_class = 'core_longform'
    GROUP BY 1
  `)
  const out: Record<string, number> = {}
  for (const r of res.rows as Array<{ status: string; n: number }>) out[r.status] = Number(r.n)
  return out
}

