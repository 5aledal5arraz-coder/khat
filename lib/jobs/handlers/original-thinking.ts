/**
 * Phase X Step 2 — Original Thinking job handlers.
 *
 *   original.generate_topics — generate N topics in {language}, expire
 *                              old unconsumed rows as a maintenance side
 *                              effect.
 *
 * Idempotent in spirit — multiple runs just append more topics. The
 * generator's novelty filter prevents the bank from drifting into
 * duplicates.
 *
 * Also the target of the «إنشاء ١٠ مواضيع جديدة» button now (it used to run
 * the generator inside the Server Action). A generator that returns not-ok
 * completes the job with `ok:false` + an Arabic message instead of a silent
 * "succeeded" with zero counts; a provider out of credit throws inside the
 * router call and is dead-lettered by the worker on attempt 1.
 */

import { registerHandler } from "../registry"
import { generateOriginalTopics } from "@/lib/original-thinking/generator"
import { expireOldOriginalTopics } from "@/lib/original-thinking/bank"
import { generationReasonLabel } from "@/lib/operator-language"
import {
  ORIGINAL_GENERATE_TOPICS_JOB,
  type OriginalTopicsJobResult,
} from "../original-jobs"

interface GeneratePayload extends Record<string, unknown> {
  language?: "ar" | "en"
  count?: number
  seasonId?: string | null
  excludedTitles?: string[]
  allowKuwaitBias?: boolean
  lensKeys?: string[]
}

export async function runOriginalGenerateTopics(
  payload: GeneratePayload,
): Promise<OriginalTopicsJobResult> {
  const { expired } = await expireOldOriginalTopics()
  const r = await generateOriginalTopics({
    language: payload.language ?? "ar",
    count: payload.count ?? 10,
    seasonId: payload.seasonId ?? null,
    excludedTitles: payload.excludedTitles ?? [],
    allowKuwaitBias: payload.allowKuwaitBias ?? false,
    lensKeys: payload.lensKeys,
  })
  return {
    ok: r.ok,
    asked: r.asked,
    accepted: r.accepted.length,
    rejected: r.rejected.length,
    ai_run_id: r.ai_run_id,
    expired_swept: expired,
    messageAr: r.ok
      ? `أُنشئت ${r.accepted.length} موضوعًا (رُفض ${r.rejected.length}).`
      : generationReasonLabel("ai_failure"),
    rejection_reasons: r.rejected.slice(0, 5).map((rj) => ({
      title: rj.candidate.title,
      reasons: rj.reasons,
    })),
  }
}

registerHandler<GeneratePayload, OriginalTopicsJobResult>(
  ORIGINAL_GENERATE_TOPICS_JOB,
  (payload) => runOriginalGenerateTopics(payload),
)
