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
  /**
   * Per-task_kind default abort timeout (ms). The router reads this when
   * the caller passes no explicit `timeoutMs`. Falls back to the router's
   * global DEFAULT_TIMEOUT_MS (120_000). This is the single place a
   * long-running kind (editorial, research) gets a realistic wall instead
   * of the 120s default — so ~35 call sites don't each have to remember.
   * Precedence: per-call `req.timeoutMs` → this → global default.
   */
  defaultTimeoutMs?: number
  /**
   * Per-task_kind default transient-retry cap. The router reads this when
   * the caller passes no explicit `maxRetries`. Falls back to the router's
   * global DEFAULT_MAX_RETRIES (2). Lowered for slow kinds so
   * `timeout × (1 + retries)` stays under the 660s nginx admin wall.
   * Precedence: per-call `req.maxRetries` → this → global default.
   */
  defaultMaxRetries?: number
  /**
   * When true, every call of this kind MUST declare a grounding contract
   * (`req.grounding`) and its output is verified against the cited corpus.
   * Set for kinds whose model is not trustworthy from memory — see
   * `lib/ai-router/grounding.ts` for the evidence and the enforcement.
   */
  requiresGrounding?: boolean
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
    // Core long-running kind: published Arabic text, many rich candidates.
    // Measured ~230s; +22% headroom → 280s. maxRetries 1 keeps the worst
    // case 280×2 ≈ 566s under the 660s nginx admin wall.
    defaultTimeoutMs: 280_000,
    defaultMaxRetries: 1,
  },
  discovery: {
    provider: "openai",
    modelName: "gpt-5.6-sol",
    inputCostPer1M: 5,
    outputCostPer1M: 30,
    reasoningEffort: "high",
    // Worker-only. maxRetries 0 — the job queue's lease-reclaim provides
    // the retry, so a router-level retry would only double the wall time.
    defaultTimeoutMs: 240_000,
    defaultMaxRetries: 0,
  },
  verification: {
    provider: "openai",
    modelName: "gpt-5.6-luna",
    inputCostPer1M: 1,
    outputCostPer1M: 6,
    reasoningEffort: "low",
    // Fast (luna). Same as the global default; set explicitly so the
    // reviewed policy is local and obvious. 120×3 ≈ 367s.
    defaultTimeoutMs: 120_000,
    defaultMaxRetries: 2,
  },
  research: {
    provider: "openai",
    modelName: "gpt-5.6-terra",
    inputCostPer1M: 2.5,
    outputCostPer1M: 15,
    reasoningEffort: "medium",
    // Long-context synthesis (terra). 240×2 ≈ 486s.
    defaultTimeoutMs: 240_000,
    defaultMaxRetries: 1,
    // terra scores −0.22 on AA-Omniscience (read 2026-07-25): answering from
    // memory produces more wrong facts than right ones. Research output must
    // therefore be traceable to retrieved sources — enforced, not requested.
    requiresGrounding: true,
  },
  analysis: {
    provider: "openai",
    modelName: "gpt-5.6-luna",
    inputCostPer1M: 1,
    outputCostPer1M: 6,
    reasoningEffort: "medium",
    // luna-medium. 150×3 ≈ 457s.
    defaultTimeoutMs: 150_000,
    defaultMaxRetries: 2,
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
  // Gemini — rates from ai.google.dev/gemini-api/docs/pricing (page last
  // updated 2026-07-21, read 2026-07-25). gemini-3.1-pro-preview is the
  // ≤200k-context tier; longer prompts bill higher, so its cost here is a
  // floor, not a ceiling.
  { provider: "gemini", modelName: "gemini-3.6-flash", inputCostPer1M: 1.5, outputCostPer1M: 7.5 },
  { provider: "gemini", modelName: "gemini-3.5-flash", inputCostPer1M: 1.5, outputCostPer1M: 9 },
  { provider: "gemini", modelName: "gemini-3.1-pro-preview", inputCostPer1M: 2, outputCostPer1M: 12 },
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
/**
 * Ordering rule (applies to every chain below): **never place a model we
 * have NO quality evidence for ahead of one we do.** A fallback chain is
 * consulted precisely when things are already going wrong, so its order is
 * the one decision nobody is watching — an arbitrary rank here silently
 * downgrades output for as long as the fallback lasts.
 *
 * Evidence on hand — Artificial Analysis, AA-Omniscience (read 2026-07-25).
 * The metric is hallucination-adjusted factual reliability, so it is ON POINT
 * for `research` and only partially informative elsewhere:
 *     gpt-5.6-sol    +21.7
 *     gpt-5.6-terra   −0.22   (answers from memory produce more wrong facts
 *                              than right ones — hence requiresGrounding)
 *     gpt-5.5 / gpt-5.4 / gpt-5.4-mini / gpt-5.4-nano / gpt-4o* — no score.
 *
 * Where no chain member has an on-point score, the order below is the
 * pre-existing newest-generation-first ordering and is left ALONE rather
 * than reshuffled on a metric that doesn't measure the task. Those chains
 * are flagged as un-evidenced in the comments; settling them needs
 * `npm run ai:benchmark` (paid), not a guess.
 */
export const FALLBACK_CHAINS: Record<AiTaskKind, readonly string[]> = {
  // NO on-point evidence for any member — extraction accuracy is not what
  // AA-Omniscience measures. Order = newest generation first, then cheaper
  // tiers. Unverified; needs a benchmark run to become evidence-based.
  structural: ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o-mini"],
  // sol first is evidence-backed (+21.7, best scored model we have). The
  // tail is generation-ordered and un-evidenced for PROSE quality, which is
  // what this kind is judged on — left as-is deliberately.
  editorial: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.6-terra", "gpt-5.4", "gpt-4o"],
  // Same reasoning as editorial: sol's lead is evidenced, the tail is not.
  discovery: ["gpt-5.6-sol", "gpt-5.5", "gpt-5.6-terra", "gpt-5.4", "gpt-4o"],
  // NO on-point evidence for any member — see `structural`.
  verification: ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o-mini"],
  // terra stays FIRST only because it is this kind's default (chain[0] must
  // equal DEFAULT_MODELS — asserted by a unit test) and its −0.22 is bought
  // off by `requiresGrounding`: research answers are verified against a
  // retrieved corpus, so memory reliability is not what carries them.
  //
  // The FALLBACK order, though, was `terra → gpt-5.4 → sol`: an unscored
  // model ahead of the single best-scored model we have. Nothing supported
  // that. When terra is unavailable the next choice is now sol (+21.7) —
  // the same model editorial and discovery already fall back to first.
  // gpt-5.4 keeps its slot ahead of gpt-4o purely on generation.
  research: ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.4", "gpt-4o"],
  // NO on-point evidence for any member — see `structural`.
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
 * Models we were asked to cost but have no rates for. A null `cost_usd` is
 * honest per row, but `sum(cost_usd)` in Postgres skips NULLs silently — so
 * an unpriced model reads as a DISCOUNT in every cost report. Recording the
 * misses here (plus a one-time warn below) makes that ignorance visible.
 */
const UNPRICED_MODELS = new Set<string>()

/** `provider:model` keys seen without pricing, for ops surfaces to display. */
export function getUnpricedModels(): string[] {
  return [...UNPRICED_MODELS].sort()
}

/** Test seam — clears the recorded misses. */
export function resetUnpricedModels(): void {
  UNPRICED_MODELS.clear()
}

/**
 * Cost lookup helper. Returns null when we don't have pricing for the
 * requested model — `cost_usd` then stores null in ai_runs (honest
 * "unknown" rather than a fabricated number) — and flags the model once so
 * the gap surfaces instead of quietly deflating cost totals.
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
  const key = `${provider}:${modelName}`
  if (!UNPRICED_MODELS.has(key)) {
    UNPRICED_MODELS.add(key)
    console.warn(
      `[ai-router] no pricing registered for "${key}" — ai_runs.cost_usd will ` +
        `be NULL for it and cost totals will UNDER-report. Add it to ` +
        `EXTRA_PRICING or register it via registerRuntimePricing().`,
    )
  }
  return null
}
