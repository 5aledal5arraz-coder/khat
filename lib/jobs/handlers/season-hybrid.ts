/**
 * `season.hybrid_generate` — the Hybrid topic generator, in the worker.
 *
 * The action keeps the cheap pre-flight (readiness, kicking missing market
 * stages, the analysis-pending short-circuit) and enqueues this; the handler
 * only runs the generator and maps its outcome to what the operator reads.
 * Candidates are persisted by the generator itself; the result carries counts,
 * preview titles and the message. A run that produced nothing completes with
 * `{ ok:false, messageAr }` (shown, not retried); our own AI rate ceiling says
 * "wait a few minutes"; a provider out of credit is rethrown so the worker
 * dead-letters it with the billing message on attempt 1.
 */

import { registerHandler } from "../registry"
import {
  AI_RATE_LIMITED_MESSAGE,
  SEASON_HYBRID_GENERATE_JOB,
  type HybridJobPayload,
  type HybridJobResult,
} from "../season-jobs"
import { generateHybridTopics } from "@/lib/hybrid-topics/generate"
import { getHybridReadiness } from "@/lib/hybrid-topics/diagnostics"
import { generationReasonLabel } from "@/lib/operator-language"
import { isQuotaExceededError } from "@/lib/ai-router/errors"

const EMPTY = {
  generation_id: null,
  generated_for_review: 0,
  auto_filtered: 0,
  unenriched: 0,
  preview_titles: [] as string[],
}

export async function runSeasonHybridGenerate(
  payload: HybridJobPayload,
  reportProgress: (p: Record<string, unknown>) => Promise<void>,
): Promise<HybridJobResult> {
  await reportProgress({ pass: 1, of: 2, label: "توليد المرشحات" })
  let r: Awaited<ReturnType<typeof generateHybridTopics>>
  try {
    r = await generateHybridTopics({
      seasonId: payload.seasonId,
      language: payload.language ?? "ar",
      count: payload.count ?? 10,
      allowKuwaitBias: payload.allowKuwaitBias ?? false,
      createdBy: payload.createdBy ?? null,
    })
  } catch (err) {
    if (isQuotaExceededError(err)) throw err
    if (err instanceof Error && err.name === "RateLimitError") {
      return { ok: false, ...EMPTY, analysis_pending: false, reason: "rate_limited", messageAr: AI_RATE_LIMITED_MESSAGE }
    }
    throw err
  }
  await reportProgress({ pass: 2, of: 2, label: "حفظ النتائج" })

  // Is market analysis still catching up? (banner only — never blocks cards)
  let inflight = false
  try {
    const readiness = await getHybridReadiness()
    inflight = readiness.inflight.extract || readiness.inflight.score || readiness.inflight.cluster
  } catch {
    /* a diagnostic read — its failure must not fail a paid generation */
  }
  const analysis_pending = payload.analysisKicked || inflight

  if (!r.ok) {
    return {
      ok: false,
      ...EMPTY,
      generation_id: r.generation_id,
      analysis_pending: r.reason === "analysis_pending" || analysis_pending,
      reason: r.reason,
      fallback_path: r.fallback_path,
      messageAr: generationReasonLabel(r.reason ?? "ai_failure"),
    }
  }

  const generated_for_review =
    payload.seasonId === null ? r.accepted.length : r.persisted.length
  const unenriched = r.enrichment.unenriched
  return {
    ok: true,
    generation_id: r.generation_id,
    generated_for_review,
    auto_filtered: r.rejected.length,
    // Honest coverage: never folded into the success count.
    unenriched,
    analysis_pending,
    fallback_path: r.fallback_path,
    preview_titles: r.accepted.slice(0, 3).map((t) => t.title),
    messageAr: `تم توليد ${generated_for_review} مرشّحاً جديداً للمراجعة.`,
    ...(unenriched > 0
      ? {
          warningAr: `${unenriched} من ${generated_for_review} مرشّحات وصلت بدون إثراء تحريري — بلا درجة ترتيب ولا محاور ولا عدسات.`,
        }
      : {}),
  }
}

registerHandler<HybridJobPayload, HybridJobResult>(
  SEASON_HYBRID_GENERATE_JOB,
  (payload, ctx) => runSeasonHybridGenerate(payload, ctx.reportProgress),
)
