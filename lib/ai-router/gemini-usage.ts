/**
 * Khat Brain — Gemini usage → telemetry.
 *
 * One honest place to turn a Gemini `usageMetadata` block into the
 * tokens/cost triple every Gemini call records. Shared by the AI Router
 * adapter (`providers/gemini.ts`) and the non-routed preparation research
 * calls (`lib/ai/preparation/{research/gemini,identify}.ts`) so the token
 * accounting — and especially the Gemini-2.5 thinking-token rule — stays
 * identical everywhere and can't drift between call sites.
 */

import type { GenerateContentResponseUsageMetadata } from "@google/genai"
import { lookupPricing } from "./registry"

export interface GeminiTelemetry {
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
}

/**
 * Derive tokens + cost from a Gemini response's `usageMetadata`.
 *
 * tokensOut = candidatesTokenCount + thoughtsTokenCount. On Gemini 2.5 the
 * model's "thinking" tokens bill as OUTPUT but land in `thoughtsTokenCount`,
 * NOT `candidatesTokenCount` — summing them is the honest output count;
 * `candidatesTokenCount` alone silently under-counts (and under-charges)
 * every reasoning call. We deliberately avoid `totalTokenCount -
 * promptTokenCount`: `totalTokenCount` also folds in `toolUsePromptTokenCount`
 * (grounding-result INPUT fed back to the model), which would inflate output.
 *
 * Cost is null when we have no pricing for the model or either token count is
 * missing — honest "unknown" over a fabricated number (same contract as the
 * router adapters).
 */
export function deriveGeminiTelemetry(
  usage: GenerateContentResponseUsageMetadata | undefined,
  modelName: string,
): GeminiTelemetry {
  const tokensIn = usage?.promptTokenCount ?? null
  const tokensOut =
    usage?.candidatesTokenCount != null
      ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)
      : null

  const pricing = lookupPricing("gemini", modelName)
  const costUsd =
    pricing && tokensIn !== null && tokensOut !== null
      ? (tokensIn / 1_000_000) * pricing.inputCostPer1M +
        (tokensOut / 1_000_000) * pricing.outputCostPer1M
      : null

  return { tokensIn, tokensOut, costUsd }
}
