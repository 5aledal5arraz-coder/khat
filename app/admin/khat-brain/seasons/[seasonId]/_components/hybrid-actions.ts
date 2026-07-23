"use server"

/**
 * Phase 6 — Hybrid Topic admin server action.
 *
 * Decision flow:
 *   1. Read readiness diagnostic.
 *   2. Auto-trigger any missing pipeline stage (extract / score / cluster).
 *   3. If signals exist but clusters don't → return analysis_pending
 *      WITHOUT calling the AI. Operator sees "جاري تحليل…".
 *   4. If truly nothing exists → return no_inputs.
 *   5. Otherwise generate. Surface clusters vs foundational path in the
 *      response so the UI can label the run accurately.
 *
 * Counts in the result NEVER mean operator decisions — only
 * AI-generation outputs. Human accept/reject lives in the wizard.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole, getAdminAuthUser } from "@/lib/api-utils"
import {
  generateHybridTopics,
  type GenerateHybridResult,
} from "@/lib/hybrid-topics/generate"
import { getHybridReadiness } from "@/lib/hybrid-topics/diagnostics"
import { enqueueJob } from "@/lib/jobs/queue"
import { generationReasonLabel } from "@/lib/operator-language"

/**
 * Rate-limit copy. Deliberately distinct from the generic `ai_failure`
 * label: the operator hit the AI budget/concurrency ceiling, nothing is
 * broken, and waiting genuinely fixes it.
 *
 * TODO: belongs in GENERATION_REASON_LABEL (lib/operator-language.ts)
 * next to the other generation-failure copy. Kept local for now because
 * that file has unrelated in-flight changes.
 */
const AI_RATE_LIMITED_MESSAGE =
  "تم بلوغ حدّ استخدام الذكاء الاصطناعي مؤقّتاً. انتظر بضع دقائق ثم أعد التوليد."

export interface HybridActionResult {
  ok: boolean
  generation_id: string | null
  /** Candidates persisted into the review queue. OPERATOR HAS NOT
   *  REVIEWED THEM YET. Equal to r.persisted.length when seasonId set. */
  generated_for_review: number
  /** Candidates the AI judge dropped before persistence. Operator
   *  never sees these — never label as رفض. */
  auto_filtered: number
  /** Candidates persisted WITHOUT the editorial layer (no success score,
   *  no محاور, no عدسات). Subset of `generated_for_review`. Must be shown:
   *  a run that enriched 1 of 6 is not a clean success. */
  unenriched: number
  /** True when scoring/clustering is in flight or just enqueued.
   *  When true with ok=false → operator should see "جاري تحليل…". */
  analysis_pending: boolean
  reason?: GenerateHybridResult["reason"]
  fallback_path?: GenerateHybridResult["fallback_path"]
  /** Operator-facing message — set on failure or for the analysis-
   *  pending early-return. Success path renders structured copy from
   *  the count fields. */
  message: string | null
  /** Titles of just-generated cards (inline preview — full review in
   *  the wizard below). */
  preview_titles: string[]
}

export async function generateHybridTopicsAction(input: {
  seasonId: string | null
  language?: "ar" | "en"
  count?: number
  allowKuwaitBias?: boolean
}): Promise<HybridActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) {
    return {
      ok: false,
      generation_id: null,
      generated_for_review: 0,
      auto_filtered: 0,
      unenriched: 0,
      analysis_pending: false,
      message: gate.error,
      preview_titles: [],
    }
  }
  const user = await getAdminAuthUser()

  // Everything below runs inside the try. The readiness read, the three
  // enqueueJob calls and the generator all talk to Postgres and/or the AI
  // router, and every one of them can throw — the router raises
  // RateLimitError by design (lib/ai-router/router.ts) and expects the
  // calling generator to catch it. Unprotected, those throws escaped the
  // HybridActionResult contract entirely and surfaced as the admin error
  // boundary instead of an in-place failure card.
  try {
    // ─── Pre-flight: kick any missing pipeline stage ────────────────
    const readiness = await getHybridReadiness()
    let kicked = false
    if (readiness.should_trigger_extraction) {
      await enqueueJob(
        "market.extract",
        { scheduled: false },
        { priority: 5, maxAttempts: 2 },
      )
      kicked = true
    }
    if (readiness.should_trigger_scoring) {
      await enqueueJob(
        "market.score_signals",
        { scheduled: false },
        { priority: 5, maxAttempts: 1 },
      )
      kicked = true
    }
    if (readiness.should_trigger_clustering) {
      await enqueueJob(
        "market.cluster_signals",
        { scheduled: false },
        { priority: 5, maxAttempts: 1 },
      )
      kicked = true
    }

    // ─── Phase 6 short-circuit: analysis pending ────────────────────
    // If signals exist but clusters don't yet (or are still warming up),
    // do NOT call the AI — that path would either burn tokens producing
    // unreviewed-signal-derived candidates (the unsafe Phase ≤5 path) or
    // skip market influence entirely. Tell the operator to wait.
    if (readiness.blocking_reason === "analysis_pending") {
      if (input.seasonId) {
        revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
      }
      return {
        ok: false,
        generation_id: null,
        generated_for_review: 0,
        auto_filtered: 0,
        unenriched: 0,
        analysis_pending: true,
        reason: "analysis_pending",
        message: generationReasonLabel("analysis_pending"),
        preview_titles: [],
      }
    }

    // ─── Generate ───────────────────────────────────────────────────
    const r = await generateHybridTopics({
      seasonId: input.seasonId,
      language: input.language ?? "ar",
      count: input.count ?? 10,
      allowKuwaitBias: input.allowKuwaitBias ?? false,
      createdBy: user?.id ?? null,
    })

    if (input.seasonId) {
      revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    }
    revalidatePath("/admin/khat-brain/command")

    // Failure path: operator-language message.
    if (!r.ok) {
      return {
        ok: false,
        generation_id: r.generation_id,
        generated_for_review: 0,
        auto_filtered: 0,
        unenriched: 0,
        analysis_pending:
          r.reason === "analysis_pending" ||
          kicked ||
          readiness.inflight.extract ||
          readiness.inflight.score ||
          readiness.inflight.cluster,
        reason: r.reason,
        fallback_path: r.fallback_path,
        message: generationReasonLabel(r.reason ?? "ai_failure"),
        preview_titles: [],
      }
    }

    // Success — counts mirror AI-judge + persistence only.
    const generated_for_review =
      input.seasonId === null ? r.accepted.length : r.persisted.length
    const auto_filtered = r.rejected.length
    const analysis_pending =
      kicked ||
      readiness.inflight.extract ||
      readiness.inflight.score ||
      readiness.inflight.cluster

    return {
      ok: true,
      generation_id: r.generation_id,
      generated_for_review,
      auto_filtered,
      // Honest coverage: candidates that reached the review queue without the
      // editorial layer. Never folded into the success count.
      unenriched: r.enrichment.unenriched,
      analysis_pending,
      fallback_path: r.fallback_path,
      message: null,
      preview_titles: r.accepted.slice(0, 3).map((t) => t.title),
    }
  } catch (err) {
    console.error("[generateHybridTopicsAction]", err)
    // Rate limit is its own operator story: nothing is broken, the AI
    // budget/concurrency ceiling was hit and retrying later works. The
    // router sets `name = "RateLimitError"` precisely so call sites can
    // recognise it without importing the rate-limit module.
    const rateLimited = err instanceof Error && err.name === "RateLimitError"
    return {
      ok: false,
      generation_id: null,
      generated_for_review: 0,
      auto_filtered: 0,
      unenriched: 0,
      analysis_pending: false,
      reason: "ai_failed",
      message: rateLimited
        ? AI_RATE_LIMITED_MESSAGE
        : generationReasonLabel("ai_failure"),
      preview_titles: [],
    }
  }
}
