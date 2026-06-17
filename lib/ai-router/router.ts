/**
 * Khat Brain — AI Router.
 *
 * Single chokepoint for every AI call. Responsibilities:
 *   1. Pick provider + model from task_kind (or accept caller override)
 *   2. Open an `ai_runs` row in status="running"
 *   3. Execute via the provider adapter
 *   4. Update `ai_runs` to succeeded/failed/timed_out with metrics
 *   5. Return a uniform `AiTaskResult`
 *
 * Generators must use this — direct `getClient()` calls are legacy.
 * Migrating each generator is a one-line replace once the contract is in
 * place; we migrate one in Phase 1 to prove the pattern.
 */

import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiRuns } from "@/lib/db/schema/ai-runs"
// Phase 1.3 — JSONB validation wrapper (lenient schemas for ai_runs snapshots).
import {
  validateJsonbWrite,
  aiRunsInputSnapshotSchema,
  aiRunsOutputSnapshotSchema,
  AI_RUNS_INPUT_SNAPSHOT_COLUMN,
  AI_RUNS_OUTPUT_SNAPSHOT_COLUMN,
  AI_RUNS_TABLE,
} from "@/lib/db/validators"
import type {
  AiTaskRequest,
  AiTaskResult,
  PromptInput,
  PromptMessage,
  ProviderAdapter,
  ResolvedRequest,
  AdapterResult,
  AiRunStatus,
} from "./types"
import { parseJsonWithRepair, type JsonRepairStage } from "@/lib/ai/json-repair"
import { DEFAULT_MODELS } from "./registry"
import { openaiAdapter } from "./providers/openai"
import { geminiAdapter } from "./providers/gemini"
// Phase 1.6 — rate-limit permit gate. Runs before the ai_runs INSERT.
import {
  acquireRateLimitPermit,
  RateLimitError,
} from "./rate-limit"
import type { Permit } from "./rate-limit"
// Phase 2.3.d — unified event log mirror. Fire-and-forget per emit
// contract. We emit `ai-router.rejected` ONLY when a RateLimitError
// reaches the router; all other errors (DB failures, unexpected
// throws) re-throw unchanged. Config-level router errors (unknown
// task_kind, no adapter) are intentionally NOT emitted — they're
// caller bugs, not observability events.
import { emitSystemEvent } from "@/lib/system-events/emit"
import { buildAiRouterRejectedEvent } from "@/lib/system-events/builders"

const ADAPTERS: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  gemini: geminiAdapter,
}

const DEFAULT_TIMEOUT_MS = 120_000
/** Cap input snapshot size to keep the table reasonable. */
const SNAPSHOT_CHAR_LIMIT = 8_000

/** Default transient-failure retries (total attempts = 1 + this). */
const DEFAULT_MAX_RETRIES = 2
/** Backoff base; doubles per attempt, capped, plus up to +30% jitter. */
const BACKOFF_BASE_MS = 500
const BACKOFF_CAP_MS = 8_000

/**
 * Error classes that are worth retrying: transient by nature. A retry on
 * any of these has a real chance of succeeding. `quota_exceeded` and
 * `auth_failed` are deliberately excluded — retrying won't help and only
 * wastes the rate-limit budget.
 */
const RETRYABLE_ERROR_CLASSES = new Set(["rate_limited", "timeout", "server_error"])

function normalizePrompt(p: PromptInput): PromptMessage[] {
  if (typeof p === "string") {
    return [{ role: "user", content: p }]
  }
  return p
}

function hashPrompt(prompt: PromptMessage[]): string {
  const h = createHash("sha256")
  for (const m of prompt) {
    h.update(m.role)
    h.update("\0")
    h.update(m.content)
    h.update("\n")
  }
  return h.digest("hex").slice(0, 32)
}

function clipSnapshot(value: unknown): Record<string, unknown> {
  try {
    const s = JSON.stringify(value)
    if (s.length <= SNAPSHOT_CHAR_LIMIT) return value as Record<string, unknown>
    return { _truncated: true, _original_size: s.length, preview: s.slice(0, SNAPSHOT_CHAR_LIMIT) }
  } catch {
    return { _unserializable: true }
  }
}

/**
 * Production-readiness fix sprint — explicit error classification so
 * downstream code (UI banners, retry logic, health probes) can branch
 * on a stable string instead of grepping the message.
 *
 * Recognized classes:
 *   "quota_exceeded"   — provider 429 / "exceeded your current quota"
 *   "rate_limited"     — provider 429 without quota signal (transient)
 *   "auth_failed"      — 401 / 403 (bad API key)
 *   "timeout"          — caller-side timeout (transient)
 *   "server_error"     — provider 5xx / network blip (transient)
 *   "JsonParseError"   — set elsewhere on parse failures
 *   "<Error.name>"     — fallback for unrecognized errors
 */
function classifyError(err: unknown): { name: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  // Provider SDKs (OpenAI) attach a numeric HTTP status — prefer it over
  // brittle substring matching when present.
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? (err as { status: number }).status
      : undefined

  // Timeout first — our own Promise.race throws "Provider timeout after Xms".
  if (status === 408 || /\btimeout\b/i.test(msg)) {
    return { name: "timeout", message: msg }
  }
  // Order matters — quota check must run before generic 429.
  if (
    lower.includes("exceeded your current quota") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota_exceeded") ||
    (lower.includes("429") && lower.includes("quota"))
  ) {
    return { name: "quota_exceeded", message: msg }
  }
  if (status === 429 || lower.includes("429") || lower.includes("rate limit") || lower.includes("ratelimit")) {
    return { name: "rate_limited", message: msg }
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key")
  ) {
    return { name: "auth_failed", message: msg }
  }
  if (
    (typeof status === "number" && status >= 500 && status <= 599) ||
    lower.includes("overloaded") ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway") ||
    lower.includes("internal server error") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("fetch failed") ||
    lower.includes("eai_again")
  ) {
    return { name: "server_error", message: msg }
  }
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message }
  }
  return { name: "UnknownError", message: msg }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Exponential backoff with jitter for retry attempt `attempt` (0-based). */
function computeBackoffMs(attempt: number): number {
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS)
  const jitter = Math.random() * 0.3 * capped
  return Math.round(capped + jitter)
}

/**
 * Execute the adapter, retrying transient failures with exponential
 * backoff. Stays inside the caller's ai_runs row / rate-limit permit —
 * a retry is the same logical call, not a new one. Returns the adapter
 * result plus how many retries were spent; re-throws the last error when
 * retries are exhausted or the failure is non-transient.
 */
async function executeWithRetry(
  adapter: ProviderAdapter,
  resolved: ResolvedRequest,
  maxRetries: number,
  onRetry: (attemptNo: number, errorClass: string, delayMs: number) => void,
): Promise<{ result: AdapterResult; retryCount: number }> {
  let attempt = 0
  for (;;) {
    try {
      const result = await adapter.execute(resolved)
      return { result, retryCount: attempt }
    } catch (err) {
      const { name } = classifyError(err)
      if (attempt >= maxRetries || !RETRYABLE_ERROR_CLASSES.has(name)) {
        throw err
      }
      const delayMs = computeBackoffMs(attempt)
      onRetry(attempt + 1, name, delayMs)
      await sleep(delayMs)
      attempt += 1
    }
  }
}

/**
 * The single entry point every AI feature should call.
 */
export async function runAiTask<TParsed = unknown>(
  req: AiTaskRequest,
): Promise<AiTaskResult<TParsed>> {
  const choice = DEFAULT_MODELS[req.taskKind]
  if (!choice) {
    throw new Error(`AI Router: unknown task_kind "${req.taskKind}"`)
  }

  const provider = req.preferredProvider ?? choice.provider
  const modelName = req.preferredModel ?? choice.modelName
  const adapter = ADAPTERS[provider]
  if (!adapter) {
    throw new Error(`AI Router: no adapter for provider "${provider}"`)
  }
  if (!adapter.isAvailable()) {
    throw new Error(
      `AI Router: provider "${provider}" is not available — ` +
        `check API key environment variables`,
    )
  }

  const messages = normalizePrompt(req.prompt)
  const promptHash = hashPrompt(messages)

  // ─── Open ai_runs row ──────────────────────────────────────────────
  // Production-readiness fix sprint — when seasonId isn't passed but
  // eirId is, derive season_id from the EIR so telemetry rolls up
  // correctly without forcing every call site to re-thread the season.
  let resolvedSeasonId: string | null = req.seasonId ?? null
  if (!resolvedSeasonId && req.eirId) {
    try {
      const { episodeIntelligenceRecords } = await import(
        "@/lib/db/schema/eir"
      )
      const [eirRow] = await db!
        .select({ season_id: episodeIntelligenceRecords.season_id })
        .from(episodeIntelligenceRecords)
        .where(eq(episodeIntelligenceRecords.id, req.eirId))
        .limit(1)
      resolvedSeasonId = eirRow?.season_id ?? null
    } catch {
      // Non-fatal — telemetry is best-effort.
    }
  }
  // Phase 1.3 — validate the input snapshot before the INSERT lands.
  // Schema is lenient (record of any unknown values); the wrapper exists
  // here so a future tightening doesn't require touching this site.
  const inputSnapshotValue = clipSnapshot(req.input)
  validateJsonbWrite(
    { table: AI_RUNS_TABLE, column: AI_RUNS_INPUT_SNAPSHOT_COLUMN, rowId: null },
    inputSnapshotValue,
    aiRunsInputSnapshotSchema,
  )

  // Phase 1.6 — rate-limit permit. Evaluated BEFORE we open the ai_runs
  // row so the running-row count used by the concurrency check reflects
  // truly in-flight calls. In REPORT mode the call always proceeds; in
  // ENFORCE mode a blocked decision throws RateLimitError up to the
  // caller. The permit's release() runs in finally so subject locks are
  // freed even on adapter failure.
  //
  // Phase 2.3.d — narrow try/catch around the permit call. Only
  // `RateLimitError` triggers an `ai-router.rejected` emit; all other
  // errors re-throw unchanged. The original throw semantics (REPORT
  // never throws, ENFORCE throws on blocked_*) are preserved exactly.
  let permit: Permit
  try {
    permit = (
      await acquireRateLimitPermit({
        taskKind: req.taskKind,
        actorId: req.actorId ?? null,
        subjectTable: req.subjectTable ?? null,
        subjectId: req.subjectId ?? null,
        bypassRateLimit: req.bypassRateLimit === true,
      })
    ).permit
  } catch (err) {
    if (err instanceof RateLimitError) {
      void emitSystemEvent(
        buildAiRouterRejectedEvent({
          task_kind: req.taskKind,
          reason: err.message,
          actor_id: req.actorId ?? undefined,
        }),
      )
    }
    throw err
  }

  const [run] = await db!
    .insert(aiRuns)
    .values({
      eir_id: req.eirId ?? null,
      season_id: resolvedSeasonId,
      subject_table: req.subjectTable ?? null,
      subject_id: req.subjectId ?? null,
      task_kind: req.taskKind,
      provider,
      model_name: modelName,
      // Phase 0 — versioned-prompt tracking. Null when the caller hasn't
      // migrated to a versioned prompt builder yet; the column is the
      // single source of truth for which prompt produced which output.
      prompt_version: req.promptVersion ?? null,
      // Phase 1.6 — actor attribution. Free-form id of who triggered
      // this call; used by the rate-limit policy and audit log.
      actor_id: req.actorId ?? null,
      prompt_hash: promptHash,
      input_snapshot: inputSnapshotValue,
      status: "running",
    })
    .returning({ id: aiRuns.id })
  const runId = run.id

  const resolved: ResolvedRequest = {
    modelName,
    prompt: messages,
    expectJson: req.expectJson === true,
    providerOptions: req.providerOptions ?? {},
    timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }

  const maxRetries = Math.max(0, req.maxRetries ?? DEFAULT_MAX_RETRIES)

  const startedAt = Date.now()
  let status: AiRunStatus = "running"
  let rawText: string | null = null
  let parsed: TParsed | null = null
  let tokensIn: number | null = null
  let tokensOut: number | null = null
  let costUsd: number | null = null
  let errorClass: string | null = null
  let errorMessage: string | null = null
  let retryCount = 0
  let jsonRepairStage: JsonRepairStage | null = null

  try {
    try {
      const exec = await executeWithRetry(
        adapter,
        resolved,
        maxRetries,
        (attemptNo, cls, delayMs) => {
          console.warn(
            `[ai-router] ${req.taskKind} (${provider}/${modelName}): ` +
              `transient ${cls} — retry ${attemptNo}/${maxRetries} in ${delayMs}ms`,
          )
        },
      )
      retryCount = exec.retryCount
      rawText = exec.result.rawText
      tokensIn = exec.result.tokensIn
      tokensOut = exec.result.tokensOut
      costUsd = exec.result.costUsd

      if (resolved.expectJson && rawText) {
        // Full string-level recovery ladder — strict → sanitize →
        // largest-block → truncation-repair. The provider-level call
        // succeeded; salvaging dirty/truncated JSON is the router's job so
        // every generator inherits it instead of re-parsing rawText itself.
        const outcome = parseJsonWithRepair(rawText)
        if (outcome) {
          parsed = outcome.value as TParsed
          if (outcome.stage !== "strict") {
            jsonRepairStage = outcome.stage
            console.warn(
              `[ai-router] ${req.taskKind} (${provider}/${modelName}): ` +
                `recovered JSON via "${outcome.stage}" — provider returned malformed/truncated output`,
            )
          }
        } else {
          // Exhausted every free recovery stage. Provider-level status is
          // still a success; surface the parse failure so generators decide.
          errorClass = "JsonParseError"
          errorMessage =
            "Response was not valid JSON after strict/sanitize/extract/truncation-repair recovery"
        }
      }
      status = "succeeded"
    } catch (err) {
      const c = classifyError(err)
      status = c.name === "timeout" ? "timed_out" : "failed"
      errorClass = c.name
      errorMessage = c.message
    }

    const completedAt = Date.now()
    const latencyMs = completedAt - startedAt

    // Phase 1.3 — validate the output snapshot before UPDATE. Lenient
    // (passthrough) schema; null is allowed when the provider returned
    // nothing.
    const outputSnapshotValue =
      rawText !== null
        ? clipSnapshot({
            text: rawText,
            parsed,
            ...(jsonRepairStage ? { repair_stage: jsonRepairStage } : {}),
            ...(retryCount > 0 ? { retry_count: retryCount } : {}),
          })
        : null
    if (outputSnapshotValue !== null) {
      validateJsonbWrite(
        { table: AI_RUNS_TABLE, column: AI_RUNS_OUTPUT_SNAPSHOT_COLUMN, rowId: runId },
        outputSnapshotValue,
        aiRunsOutputSnapshotSchema,
      )
    }

    await db!
      .update(aiRuns)
      .set({
        status,
        completed_at: new Date(completedAt),
        latency_ms: latencyMs,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        output_snapshot: outputSnapshotValue,
        error_class: errorClass,
        error_message: errorMessage,
      })
      .where(eq(aiRuns.id, runId))

    return {
      runId,
      status,
      rawText,
      parsed,
      provider,
      modelName,
      latencyMs,
      tokensIn,
      tokensOut,
      costUsd,
      errorClass,
      errorMessage,
      retryCount,
      jsonRepairStage,
    }
  } finally {
    // Phase 1.6 — always release the rate-limit permit (subject lock),
    // even if validation or the UPDATE threw. Best-effort: a release
    // failure must never propagate.
    await permit.release().catch(() => {})
  }
}

/**
 * Phase 1.6 — re-export so generators can `instanceof`-check the error
 * when they want a graceful UI fallback rather than a 500.
 */
export { RateLimitError }
