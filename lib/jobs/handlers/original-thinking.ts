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
 */

import { registerHandler } from "../registry"
import { generateOriginalTopics } from "@/lib/original-thinking/generator"
import { expireOldOriginalTopics } from "@/lib/original-thinking/bank"

interface GeneratePayload extends Record<string, unknown> {
  language?: "ar" | "en"
  count?: number
  seasonId?: string | null
  excludedTitles?: string[]
  allowKuwaitBias?: boolean
  lensKeys?: string[]
}
interface GenerateResult extends Record<string, unknown> {
  asked: number
  accepted: number
  rejected: number
  ai_run_id: string | null
  expired_swept: number
}

registerHandler<GeneratePayload, GenerateResult>(
  "original.generate_topics",
  async (payload) => {
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
      asked: r.asked,
      accepted: r.accepted.length,
      rejected: r.rejected.length,
      ai_run_id: r.ai_run_id,
      expired_swept: expired,
    }
  },
)
