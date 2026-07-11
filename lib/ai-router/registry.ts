/**
 * Khat Brain — AI Router model registry.
 *
 * Maps task_kind → preferred provider + model. Single source of truth
 * for model selection so we don't have model strings scattered across
 * 26 generators. Override per-call by passing `preferredModel` /
 * `preferredProvider` to `runAiTask`.
 */

import type { AiTaskKind, AiProvider, ReasoningEffort } from "./types"

export interface ModelChoice {
  provider: AiProvider
  modelName: string
  /** Approximate USD per 1M input tokens (for cost accounting). */
  inputCostPer1M: number
  /** Approximate USD per 1M output tokens. */
  outputCostPer1M: number
  /**
   * Default reasoning effort for this task kind (GPT-5-family models).
   * Reasoning tokens bill as output tokens — raise only where the
   * quality gain is measured. Per-call override:
   * `providerOptions.reasoningEffort`.
   */
  reasoningEffort?: ReasoningEffort
}

/**
 * Defaults — GPT-5.6 family (July 2026), all 1M-token context:
 *   sol   $5.00/$30.00 — flagship; editorial + discovery, where output
 *                         quality IS the product (published Arabic text,
 *                         guest-candidate ranking).
 *   terra $2.50/$15.00 — research briefs: long-form synthesis at half
 *                         sol's price, same family.
 *   luna  $1.00/$6.00  — structural extraction, verification, analysis.
 *
 * The old gpt-4o / gpt-4o-mini defaults are two generations behind and
 * their May-2024 snapshot is already on OpenAI's shutdown calendar.
 *
 * Costs are best-effort — they're recorded on every run so we can true
 * them up later without re-running anything.
 */
export const DEFAULT_MODELS: Record<AiTaskKind, ModelChoice> = {
  structural: {
    provider: "openai",
    modelName: "gpt-5.6-luna",
    inputCostPer1M: 1,
    outputCostPer1M: 6,
    reasoningEffort: "low",
  },
  editorial: {
    provider: "openai",
    modelName: "gpt-5.6-sol",
    inputCostPer1M: 5,
    outputCostPer1M: 30,
    reasoningEffort: "medium",
  },
  discovery: {
    provider: "openai",
    modelName: "gpt-5.6-sol",
    inputCostPer1M: 5,
    outputCostPer1M: 30,
    reasoningEffort: "high",
  },
  verification: {
    provider: "openai",
    modelName: "gpt-5.6-luna",
    inputCostPer1M: 1,
    outputCostPer1M: 6,
    reasoningEffort: "low",
  },
  research: {
    provider: "openai",
    modelName: "gpt-5.6-terra",
    inputCostPer1M: 2.5,
    outputCostPer1M: 15,
    reasoningEffort: "medium",
  },
  analysis: {
    provider: "openai",
    modelName: "gpt-5.6-luna",
    inputCostPer1M: 1,
    outputCostPer1M: 6,
    reasoningEffort: "medium",
  },
}

/**
 * Pricing for models reachable via `preferredProvider`/`preferredModel`
 * overrides but not in the task-kind defaults: cheaper GPT-5.4 tiers,
 * the previous-generation models still hit by in-flight overrides, and
 * the Gemini family. Best-effort, same as DEFAULT_MODELS.
 */
const EXTRA_PRICING: Array<{
  provider: AiProvider
  modelName: string
  inputCostPer1M: number
  outputCostPer1M: number
}> = [
  // Current OpenAI alternates (quality ↓, cost ↓ — for high-volume overrides)
  { provider: "openai", modelName: "gpt-5.5", inputCostPer1M: 5, outputCostPer1M: 30 },
  { provider: "openai", modelName: "gpt-5.4", inputCostPer1M: 2.5, outputCostPer1M: 15 },
  { provider: "openai", modelName: "gpt-5.4-mini", inputCostPer1M: 0.75, outputCostPer1M: 4.5 },
  { provider: "openai", modelName: "gpt-5.4-nano", inputCostPer1M: 0.2, outputCostPer1M: 1.25 },
  // Legacy OpenAI (pre-upgrade defaults — keeps old overrides costed)
  { provider: "openai", modelName: "gpt-4o", inputCostPer1M: 2.5, outputCostPer1M: 10 },
  { provider: "openai", modelName: "gpt-4o-mini", inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  // Gemini
  { provider: "gemini", modelName: "gemini-2.5-flash", inputCostPer1M: 0.3, outputCostPer1M: 2.5 },
  { provider: "gemini", modelName: "gemini-2.5-pro", inputCostPer1M: 1.25, outputCostPer1M: 10 },
  { provider: "gemini", modelName: "gemini-2.0-flash", inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
]

/**
 * Availability fallback chains, best-first. `FALLBACK_CHAINS[kind][0]` IS
 * the task-kind default (kept equal to DEFAULT_MODELS — asserted by a
 * unit test). When the configured/default model isn't in the live model
 * catalog for this API key, model-selection.ts walks the chain to the
 * first available entry. New-generation adoption does NOT edit these:
 * operators point a task at a new model via the Settings override or
 * `KHAT_AI_MODEL_<KIND>`; chains only guard availability.
 */
export const FALLBACK_CHAINS: Record<AiTaskKind, readonly string[]> = {
  structural: ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o-mini"],
  editorial: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.6-terra", "gpt-5.4", "gpt-4o"],
  discovery: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.6-terra", "gpt-5.4", "gpt-4o"],
  verification: ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o-mini"],
  research: ["gpt-5.6-terra", "gpt-5.4", "gpt-5.6-sol", "gpt-4o"],
  analysis: ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o-mini"],
}

/**
 * Pricing registered at runtime for models the static tables don't know —
 * a Settings model override can carry its own USD/1M rates so cost
 * telemetry stays accurate without a code change.
 */
const RUNTIME_PRICING = new Map<
  string,
  { inputCostPer1M: number; outputCostPer1M: number }
>()

export function registerRuntimePricing(
  provider: AiProvider,
  modelName: string,
  pricing: { inputCostPer1M: number; outputCostPer1M: number },
): void {
  RUNTIME_PRICING.set(`${provider}:${modelName}`, pricing)
}

/**
 * Cost lookup helper. Returns null when we don't have pricing for the
 * requested model — `cost_usd` then stores null in ai_runs (honest
 * "unknown" rather than a fabricated number).
 */
export function lookupPricing(
  provider: AiProvider,
  modelName: string,
): { inputCostPer1M: number; outputCostPer1M: number } | null {
  const runtime = RUNTIME_PRICING.get(`${provider}:${modelName}`)
  if (runtime) return runtime
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
