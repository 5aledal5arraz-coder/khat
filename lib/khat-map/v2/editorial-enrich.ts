/**
 * Editorial enrichment — run the editorial intelligence over already-generated
 * topics (the Guided/hybrid path) and produce the persisted editorial fields.
 *
 * The enrich prompt (prompts-enrich.ts) classifies + lenses + headlines + judges
 * a topic. We reuse `assembleEditorial` so the persisted shape is identical to
 * the editorial engine's: `editorial_intel` + `success_score` + the flat
 * `topic_category` / `topic_subcategory` / `main_axes` / `suggested_questions` /
 * `regional_note` columns. Never throws — a failed enrichment leaves the topic
 * as a plain candidate (the upgrade degrades gracefully).
 *
 * WHY PER-TOPIC (not one batch call). COVERAGE IS VERIFIED, NEVER ASSUMED.
 * On 2026-07-22/23 the OLD design asked ONE editorial call to enrich all N
 * topics at once. Two failure modes came out of that single large call:
 *   1. Output-length truncation / laziness: the model answered a six-topic batch
 *      with ONE object and five topics persisted NULL across every editorial
 *      column (ai_runs 2dfb5bd2-…, tokens_out 1475).
 *   2. It carried NO timeoutMs/maxRetries, so it inherited the router default
 *      120s × 3 = 361s and hung the synchronous «توليد» request (ai_runs, run 2:
 *      status=timed_out, latency 361.9s — the exact 120×3 signature).
 * The fix runs ONE call PER TOPIC instead:
 *   - A single topic's output can't overflow → truncation is impossible, which
 *     kills failure mode 1 at the root.
 *   - Each call is tightly cappable → an explicit per-call timeout kills mode 2.
 *   - Failure is granular: one topic that fails to enrich degrades ONE card, not
 *     the batch. `missingIndexes` still carries that fact to the operator so a
 *     5-of-6 run reads as «١ من ٦ بدون إثراء», never a clean success.
 *
 * The calls run with BOUNDED CONCURRENCY (ENRICH_CONCURRENCY) and under an
 * absolute WALL-CLOCK DEADLINE, so the phase can never exceed its time budget no
 * matter how many topics or how slow the provider is — see the callers and the
 * constants below.
 */

import { runAiTask } from "@/lib/ai-router"
import { buildEnrichSystemPrompt, buildEnrichUserPrompt, type EnrichTopicInput } from "./prompts-enrich"
import { assembleEditorial } from "./editorial-assemble"
import { clampCategory } from "./categories"
import { clampSuccessDimensions } from "./success-score"
import type { RawCandidate, CourtVerdict } from "./types"
import type { KhatMapEditorialIntel } from "@/types/khat-map"

/**
 * Per-topic call timeout. A single-topic enrichment is dominated by the model
 * reasoning over the large editorial system prompt (Knowledge Universe + Lenses
 * + headline + podcast principles), NOT by output size — so it is not "cheap".
 * Measured single-output editorial latency: khat-map-enrich lone-object 38.3s
 * (ai_runs 07-23 00:39), original-thinking-v1.1 33–74s. 90s ≈ 1.2–2.4× that
 * range: room for the reasoning tail, short enough that a genuinely hung call
 * fails inside one request instead of the 361s router default.
 */
const ENRICH_PER_TOPIC_TIMEOUT_MS = 90_000

/**
 * Max concurrent enrichment calls. Editorial is the "expensive" rate-limit tier
 * whose default `maxConcurrent` is 3 (lib/ai-router/rate-limit.ts). Firing all N
 * topics with `Promise.all` would, under ENFORCE mode, let the 4th+ call trip
 * `blocked_concurrency` and fail those topics. A pool of 3 never launches a 4th
 * concurrent call, so it never self-trips the tier cap, while still parallelising
 * the wall-clock. (The per-topic calls also pass `subjectId: null` so they do NOT
 * share the season subject-lock — otherwise they would serialise to one-at-a-time
 * against each other. The tier concurrency cap, which counts by task_kind, still
 * applies and still protects the provider/cost budget.)
 */
const ENRICH_CONCURRENCY = 3

/** Small backoff before the single per-topic retry. Negligible in the budget. */
const ENRICH_RETRY_BACKOFF_MS = 300

/**
 * Default enrichment deadline when a caller does not supply one. Generous —
 * non-hybrid callers effectively run without a practical wall while still being
 * bounded. The hybrid path passes an absolute `deadlineAt` derived from the
 * request wall so the whole synchronous action stays under the nginx ceiling.
 */
const DEFAULT_ENRICH_WALL_MS = 300_000

export interface EnrichedTopic {
  topic_category: string | null
  topic_subcategory: string | null
  main_axes: string[]
  suggested_questions: string[]
  regional_note: string | null
  success_score: number
  editorial_intel: KhatMapEditorialIntel
}

/**
 * Outcome of an enrichment attempt. `enriched + missingIndexes.length` always
 * equals `requested`, so a caller can report coverage without recounting.
 */
export interface EnrichmentOutcome {
  /** Successfully enriched topics, keyed by the input `index`. */
  byIndex: Map<number, EnrichedTopic>
  /** How many topics we were asked to enrich. */
  requested: number
  /** How many actually came back enriched. */
  enriched: number
  /** Input indexes with NO enrichment, ascending. Surface these — never hide them. */
  missingIndexes: number[]
}

export interface EnrichOptions {
  /**
   * Absolute wall-clock deadline (ms epoch, `Date.now()`-comparable). No new
   * enrichment call — nor a retry — is launched once the deadline (minus one
   * per-call timeout of reserve) has passed, so the phase can never run a call
   * past `deadlineAt`. Topics not reached by then are reported un-enriched,
   * which the honesty layer surfaces exactly like any other per-topic miss.
   */
  deadlineAt?: number
}

/**
 * Enrich a list of topics. Never throws.
 *
 * Runs one call PER TOPIC across a bounded-concurrency pool, each call capped by
 * `ENRICH_PER_TOPIC_TIMEOUT_MS`, with a single bounded retry per topic (gated by
 * the deadline). Whatever is still missing when the pool drains — or when the
 * wall-clock deadline is reached — is reported honestly in `missingIndexes`.
 */
export async function enrichTopicsEditorially(
  seasonId: string | null,
  topics: EnrichTopicInput[],
  opts: EnrichOptions = {},
): Promise<EnrichmentOutcome> {
  const byIndex = new Map<number, EnrichedTopic>()
  if (topics.length === 0) {
    return { byIndex, requested: 0, enriched: 0, missingIndexes: [] }
  }

  const deadlineAt = opts.deadlineAt ?? Date.now() + DEFAULT_ENRICH_WALL_MS

  await runPool(topics, ENRICH_CONCURRENCY, async (topic) => {
    const enriched = await enrichOneTopic(seasonId, topic, deadlineAt)
    if (enriched) byIndex.set(topic.index, enriched)
  })

  // Coverage check — the module's honesty contract. Per-topic, a "miss" is a
  // single topic whose own call(s) failed or was skipped past the deadline; the
  // count is therefore exact, not an all-or-nothing guess.
  const missingIndexes = topics
    .filter((t) => !byIndex.has(t.index))
    .map((t) => t.index)
    .sort((a, b) => a - b)
  if (missingIndexes.length > 0) {
    console.warn(
      `[khat-map] editorial enrichment covered ${byIndex.size}/${topics.length} ` +
        `topics; ${missingIndexes.length} stay plain (indexes ${missingIndexes.join(", ")})`,
    )
  }
  return {
    byIndex,
    requested: topics.length,
    enriched: byIndex.size,
    missingIndexes,
  }
}

/**
 * Enrich ONE topic: a single capped call, plus one bounded retry when it did not
 * come back enriched — but only while the wall-clock deadline still leaves room
 * for a full call. Returns null (topic stays plain) on any failure. Never throws.
 */
async function enrichOneTopic(
  seasonId: string | null,
  topic: EnrichTopicInput,
  deadlineAt: number,
): Promise<EnrichedTopic | null> {
  // Deadline gate: never START a call that could run past the wall. The reserve
  // is one full per-call timeout so an in-flight call always finishes by
  // `deadlineAt`.
  if (Date.now() + ENRICH_PER_TOPIC_TIMEOUT_MS > deadlineAt) return null

  const first = await runSingleEnrichCall(seasonId, topic)
  if (first) return first

  // One bounded retry — replaces the old batch "repair pass". Per-topic there is
  // no coverage shortfall to repair; a lone failure is just flaky/transient, so a
  // single re-ask is the honest bound. Skip it if the wall no longer allows it.
  if (Date.now() + ENRICH_PER_TOPIC_TIMEOUT_MS > deadlineAt) return null
  await sleep(ENRICH_RETRY_BACKOFF_MS)
  return await runSingleEnrichCall(seasonId, topic)
}

/**
 * One enrichment call over a SINGLE topic. Returns the assembled editorial on
 * success, or null on any failure (bad status, no parse, no usable object,
 * thrown error). Swallows its own errors — the caller's coverage check turns a
 * miss into an honest report.
 */
async function runSingleEnrichCall(
  seasonId: string | null,
  topic: EnrichTopicInput,
): Promise<EnrichedTopic | null> {
  try {
    const r = await runAiTask<{ topics?: unknown } | unknown[]>({
      taskKind: "editorial",
      // Roll the run up to the season directly (ai_runs.season_id). The OLD
      // batch call set neither seasonId nor eirId, so its telemetry had a NULL
      // season — this is also a small correctness improvement.
      seasonId,
      subjectTable: "khat_map_seasons",
      // subjectId NULL on purpose: no per-season subject lock, so the pooled
      // per-topic calls don't serialise against each other. The tier concurrency
      // cap (counted by task_kind) still governs the real budget.
      subjectId: null,
      promptVersion: "khat-map-enrich-v1",
      input: { season_id: seasonId, index: topic.index },
      prompt: [
        { role: "system", content: buildEnrichSystemPrompt() },
        { role: "user", content: buildEnrichUserPrompt([topic]) },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
      // Explicit cap — the whole point of this change. Without it the call
      // inherits the router's 120s × 3 = 361s default (see file header).
      timeoutMs: ENRICH_PER_TOPIC_TIMEOUT_MS,
      // The single retry is orchestrated per-topic above (covers content AND
      // transient misses); the router's own retry ladder is disabled so total
      // attempts per topic stay bounded at exactly two.
      maxRetries: 0,
    })
    if (r.status !== "succeeded" || r.parsed == null) return null

    const list = coerceList(r.parsed, 1)
    if (!list) return null
    // One topic per call → take the first well-formed object. We already KNOW
    // which topic we asked for, so the model's echoed index is irrelevant here.
    const o = list.find((x) => x && typeof x === "object") as
      | Record<string, unknown>
      | undefined
    if (!o) return null

    return buildEnrichedTopic(topic, o)
  } catch (err) {
    console.error("[khat-map] per-topic enrichment failed; topic stays plain", err)
    return null
  }
}

/**
 * Assemble one enrichment object (`o`) over its source topic (`src`) into the
 * persisted `EnrichedTopic` shape, reusing the editorial engine's assembler so
 * the columns are byte-identical to the batch engine's output.
 */
function buildEnrichedTopic(
  src: EnrichTopicInput,
  o: Record<string, unknown>,
): EnrichedTopic {
  const category = clampCategory(str(o.category))
  const main_axes = strArr(o.main_axes)
  const suggested_questions = strArr(o.suggested_questions)
  const regional_note = optStr(o.regional_note)

  // Build a synthetic RawCandidate from the enrichment's generation fields…
  const raw: RawCandidate = {
    topic: {
      working_title: src.title,
      hook: src.hook,
      why_matters: src.why_it_matters,
      why_now: src.why_now,
      goal: "",
      description: src.conflict_angle,
      episode_type: "signature_khat",
      topic_domain: "none",
      topic_angle_code: null,
      main_axes,
      suggested_questions,
      risk_level: null,
      effort_level: null,
      sponsor_appeal: null,
      category,
      regional_note,
      viral_angle: optStr(o.viral_angle),
      debate_axis: optStr(o.debate_axis),
      subcategory: optStr(o.subcategory),
      lenses: strArr(o.lenses),
      global_note: optStr(o.global_note),
      why_this_topic: optStr(o.why_this_topic),
      titles: o.titles ?? null,
      success: o.success ?? null,
      guest_idea: null,
    },
    guest: null,
    editorial_score: 7,
    why_now: src.why_now,
    domain_reasoning: null,
  }
  // …and a CourtVerdict from the enrichment's judgment fields.
  const verdict: CourtVerdict = {
    index: src.index,
    verdict: "accept",
    success: clampSuccessDimensions(o.success),
    why_succeed: optStr(o.why_succeed),
    why_fail: optStr(o.why_fail),
    is_overdone: o.is_overdone === true,
    reference_potential: o.reference_potential === true,
    clip_potential: o.clip_potential === true,
    recommended_title: null,
    recommended_reason: null,
  }

  const assembled = assembleEditorial(raw, verdict)
  return {
    topic_category: category,
    topic_subcategory: assembled.subcategory,
    main_axes,
    suggested_questions,
    regional_note,
    success_score: assembled.success_score,
    editorial_intel: assembled.editorial_intel,
  }
}

// ─── concurrency ─────────────────────────────────────────────────────────────

/**
 * Run `worker` over `items` with at most `concurrency` in flight at once. A
 * simple work-stealing pool: each runner pulls the next index until the list is
 * exhausted. Order of completion is irrelevant — the worker writes into a
 * shared map keyed by topic index.
 */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        await worker(items[i])
      }
    },
  )
  await Promise.all(runners)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── tiny coercers ───────────────────────────────────────────────────────────

function isEnrichedObject(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  // An enriched topic carries at least one of these keys.
  return "index" in o || "category" in o || "titles" in o || "success" in o
}

function coerceList(parsed: unknown, expectedCount: number): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  // Preferred wrapper.
  if (Array.isArray(o.topics)) return o.topics
  // A lone enriched object. For a per-topic call this IS the whole (correct)
  // answer — json_object mode routinely returns a bare object rather than a
  // one-element `{ topics: [...] }`.
  if (isEnrichedObject(o)) {
    if (expectedCount > 1) {
      console.warn(
        `[khat-map] editorial enrichment: model returned ONE object for a ` +
          `${expectedCount}-topic request — treating it as a partial answer`,
      )
    }
    return [o]
  }
  // Otherwise: the first array of OBJECTS (never a string array like `lenses`).
  for (const v of Object.values(o)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) return v
  }
  return null
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function optStr(v: unknown): string | null {
  return str(v)
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
}
