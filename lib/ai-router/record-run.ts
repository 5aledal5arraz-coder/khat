/**
 * Khat Brain — AI telemetry for NON-routed provider calls.
 *
 * `runAiTask()` (router.ts) is chat-oriented — it speaks in prompt
 * messages and token-based cost, and owns the `ai_runs` row for every
 * call that flows through the registry. A couple of AI calls don't fit
 * that shape:
 *   - audio transcription (`lib/whisper.ts`): per-minute pricing, not the
 *     chat Responses API;
 *   - embeddings (`lib/khat-map/learning/embeddings.ts`): input-only, no
 *     output tokens.
 * They still MUST land in `ai_runs` — otherwise the two most expensive
 * non-chat operations are invisible to cost/observability.
 *
 * `recordAiRun` is the lean telemetry primitive for exactly those. It
 * opens one `ai_runs` row around a single provider call, records the
 * ACTUAL model invoked, and on failure classifies + re-throws so the
 * caller decides whether to fall back. Unlike the router it does NO model
 * selection, NO json-repair, and — deliberately — NO rate-limit permit
 * (embedding batches are high-volume during season planning; a permit
 * here would throttle generation). Cost is honest: null when it can't be
 * computed, never a fabricated number.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import type {
  AiProvider,
  AiRunStatus,
  AiRunTaskKind,
} from "@/lib/db/schema/ai-runs"
import { classifyError } from "./router"

/** Immutable identity of the run — everything known BEFORE the call. */
export interface RecordAiRunMeta {
  /** Telemetry-only or routed kind; written verbatim to `task_kind`. */
  taskKind: AiRunTaskKind
  provider: AiProvider
  /**
   * The ACTUAL model invoked (e.g. "gpt-4o-transcribe"), never a static
   * label. On fallback the caller opens a SEPARATE `recordAiRun` with the
   * fallback model so each row's `model_name` stays truthful.
   */
  modelName: string
  eirId?: string | null
  seasonId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
  actorId?: string | null
  promptVersion?: string | null
  /**
   * Small, pre-shaped request snapshot — metadata, NOT the raw transcript
   * or embedded text (see the `ai_runs` payload contract). Clipped
   * defensively before the write.
   */
  inputSnapshot?: Record<string, unknown> | null
}

/** Post-call telemetry derived from the successful result. */
export interface RecordAiRunTelemetry {
  tokensIn?: number | null
  tokensOut?: number | null
  /**
   * Honest cost: null when a real dollar figure can't be computed (e.g.
   * transcription with unknown audio duration). Never fabricate.
   */
  costUsd?: number | null
  outputSnapshot?: Record<string, unknown> | null
}

/** Keep JSONB snapshots bounded — mirrors the router's SNAPSHOT_CHAR_LIMIT. */
const SNAPSHOT_CHAR_LIMIT = 8_000

function clip(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (value == null) return null
  try {
    const s = JSON.stringify(value)
    if (s.length <= SNAPSHOT_CHAR_LIMIT) return value
    return {
      _truncated: true,
      _original_size: s.length,
      preview: s.slice(0, SNAPSHOT_CHAR_LIMIT),
    }
  } catch {
    return { _unserializable: true }
  }
}

/**
 * Run `exec` inside one `ai_runs` row. Returns whatever `exec` resolves to
 * (the raw provider result) so callers keep their existing return shape.
 *
 * Failure contract: the ORIGINAL error from `exec` is always re-thrown —
 * never a telemetry-write error — because callers (the whisper fallback)
 * re-classify the thrown error to decide whether to retry on a cheaper
 * model. The terminal UPDATE is therefore best-effort; a rare DB hiccup
 * there leaves the row in "running", which the ai-runs sweeper reconciles.
 */
export async function recordAiRun<R>(
  meta: RecordAiRunMeta,
  exec: () => Promise<R>,
  derive?: (result: R) => RecordAiRunTelemetry,
): Promise<R> {
  const startedAt = Date.now()

  const [run] = await db!
    .insert(aiRuns)
    .values({
      eir_id: meta.eirId ?? null,
      season_id: meta.seasonId ?? null,
      subject_table: meta.subjectTable ?? null,
      subject_id: meta.subjectId ?? null,
      task_kind: meta.taskKind,
      provider: meta.provider,
      model_name: meta.modelName,
      prompt_version: meta.promptVersion ?? null,
      actor_id: meta.actorId ?? null,
      input_snapshot: clip(meta.inputSnapshot),
      status: "running",
    })
    .returning({ id: aiRuns.id })
  const runId = run.id

  try {
    const result = await exec()
    const tel = derive?.(result) ?? {}
    const completedAt = Date.now()
    await db!
      .update(aiRuns)
      .set({
        status: "succeeded",
        completed_at: new Date(completedAt),
        latency_ms: completedAt - startedAt,
        tokens_in: tel.tokensIn ?? null,
        tokens_out: tel.tokensOut ?? null,
        cost_usd: tel.costUsd ?? null,
        output_snapshot: clip(tel.outputSnapshot),
      })
      .where(eq(aiRuns.id, runId))
    return result
  } catch (err) {
    const c = classifyError(err)
    const status: AiRunStatus = c.name === "timeout" ? "timed_out" : "failed"
    const completedAt = Date.now()
    // Best-effort: never let a telemetry-write failure mask the provider
    // error the caller needs to classify for its fallback decision.
    await db!
      .update(aiRuns)
      .set({
        status,
        completed_at: new Date(completedAt),
        latency_ms: completedAt - startedAt,
        error_class: c.name,
        error_message: c.message,
      })
      .where(eq(aiRuns.id, runId))
      .catch(() => {})
    throw err
  }
}
