/**
 * Khat Brain — AI Router model registry.
 *
 * Maps task_kind → preferred provider + model. Single source of truth
 * for model selection so we don't have model strings scattered across
 * 26 generators. Override per-call by passing `preferredModel` /
 * `preferredProvider` to `runAiTask`.
 */

import type { AiTaskKind, AiProvider } from "./types"

export interface ModelChoice {
  provider: AiProvider
  modelName: string
  /** Approximate USD per 1M input tokens (for cost accounting). */
  inputCostPer1M: number
  /** Approximate USD per 1M output tokens. */
  outputCostPer1M: number
}

/**
 * Defaults. These mirror the existing dual-model pattern in lib/ai/client.ts:
 *   STRUCTURE_MODEL = gpt-4o-mini
 *   EDITORIAL_MODEL = gpt-4o
 * Discovery + verification + research lean on stronger context (gpt-4o);
 * structural + analysis lean on the cheap structural model.
 *
 * Costs are best-effort — they're recorded on every run so we can true
 * them up later without re-running anything.
 */
export const DEFAULT_MODELS: Record<AiTaskKind, ModelChoice> = {
  structural: {
    provider: "openai",
    modelName: "gpt-4o-mini",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  editorial: {
    provider: "openai",
    modelName: "gpt-4o",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  discovery: {
    provider: "openai",
    modelName: "gpt-4o",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  verification: {
    provider: "openai",
    modelName: "gpt-4o-mini",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  research: {
    provider: "openai",
    modelName: "gpt-4o",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  analysis: {
    provider: "openai",
    modelName: "gpt-4o-mini",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
}

/**
 * Pricing for models reachable via `preferredProvider`/`preferredModel`
 * overrides but not in the task-kind defaults (currently the Gemini
 * family). Best-effort, same as DEFAULT_MODELS.
 */
const EXTRA_PRICING: Array<{
  provider: AiProvider
  modelName: string
  inputCostPer1M: number
  outputCostPer1M: number
}> = [
  { provider: "gemini", modelName: "gemini-2.5-flash", inputCostPer1M: 0.3, outputCostPer1M: 2.5 },
  { provider: "gemini", modelName: "gemini-2.5-pro", inputCostPer1M: 1.25, outputCostPer1M: 10 },
  { provider: "gemini", modelName: "gemini-2.0-flash", inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
]

/**
 * Cost lookup helper. Returns null when we don't have pricing for the
 * requested model — `cost_usd` then stores null in ai_runs (honest
 * "unknown" rather than a fabricated number).
 */
export function lookupPricing(
  provider: AiProvider,
  modelName: string,
): { inputCostPer1M: number; outputCostPer1M: number } | null {
  for (const choice of [...Object.values(DEFAULT_MODELS), ...EXTRA_PRICING]) {
    if (choice.provider === provider && choice.modelName === modelName) {
      return {
        inputCostPer1M: choice.inputCostPer1M,
        outputCostPer1M: choice.outputCostPer1M,
      }
    }
  }
  return null
}
