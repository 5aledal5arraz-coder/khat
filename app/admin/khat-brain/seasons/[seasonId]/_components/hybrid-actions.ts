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
 *   5. Otherwise ENQUEUE `season.hybrid_generate` and return its jobId in
 *      milliseconds. The generation itself (2.5–9 min) runs in the worker
 *      (lib/jobs/handlers/season-hybrid.ts); the button's status card watches
 *      the job and renders its result (counts, path, preview titles). It used
 *      to run here, behind nginx's 120s cut.
 *
 * Counts in the result NEVER mean operator decisions — only
 * AI-generation outputs. Human accept/reject lives in the wizard.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole, getAdminAuthUser } from "@/lib/api-utils"
import type { GenerateHybridResult } from "@/lib/hybrid-topics/generate"
import { getHybridReadiness } from "@/lib/hybrid-topics/diagnostics"
import { enqueueJob, enqueueJobOnce } from "@/lib/jobs/queue"
import { generationReasonLabel } from "@/lib/operator-language"
import {
  AI_RATE_LIMITED_MESSAGE,
  SEASON_HYBRID_GENERATE_JOB,
  hybridDedupeKey,
  type HybridJobPayload,
} from "@/lib/jobs/season-jobs"

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
  /** The queued `season.hybrid_generate` job (ok=true). Its result carries the counts. */
  jobId?: string
  /** A generation for this season was already running — we attached to it. */
  alreadyRunning?: boolean
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

    // ─── Enqueue ────────────────────────────────────────────────────
    const payload: HybridJobPayload = {
      seasonId: input.seasonId,
      language: input.language ?? "ar",
      count: input.count ?? 10,
      allowKuwaitBias: input.allowKuwaitBias ?? false,
      createdBy: user?.id ?? null,
      analysisKicked: kicked,
    }
    const q = await enqueueJobOnce(SEASON_HYBRID_GENERATE_JOB, payload, {
      dedupeKey: hybridDedupeKey(input.seasonId),
      // One paid run per click. The router already retries each AI call.
      maxAttempts: 1,
      priority: 10,
    })
    if (input.seasonId) {
      revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    }

    return {
      ok: true,
      generation_id: null,
      generated_for_review: 0,
      auto_filtered: 0,
      unenriched: 0,
      analysis_pending:
        kicked ||
        readiness.inflight.extract ||
        readiness.inflight.score ||
        readiness.inflight.cluster,
      message: q.alreadyRunning
        ? "التوليد الهجين جارٍ بالفعل لهذا الموسم — نعرض لك حالته."
        : null,
      preview_titles: [],
      jobId: q.job.id,
      alreadyRunning: q.alreadyRunning,
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
