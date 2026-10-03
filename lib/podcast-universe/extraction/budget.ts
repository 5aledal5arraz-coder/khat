/**
 * Per-run hard AI budget (Decision 14 / B13). Pure.
 *
 * The shared AI rate limiter is NOT relied on: the run carries its own
 * `budget_limit_usd`, and the next paid call is REFUSED when
 *   spent + estimated_next_call > limit.
 * The estimate is deliberately pessimistic (Arabic tokenizes heavily; luna's
 * reasoning tokens bill as output), so the cap is hit early rather than late.
 */

export interface Pricing {
  inputCostPer1M: number
  outputCostPer1M: number
}

/** ~2.5 chars per token for mixed Arabic/Latin metadata — pessimistic. */
const CHARS_PER_TOKEN = 2.5
/** Fixed system-prompt + JSON overhead. */
const PROMPT_OVERHEAD_TOKENS = 1200
/** Output + reasoning tokens allowed per episode in a batch (rashid 2026-10-03). */
const OUTPUT_TOKENS_PER_EPISODE = 600
const OUTPUT_TOKENS_OVERHEAD = 2000

/**
 * The explicit `max_tokens` sent with every extraction call. A 40-episode
 * batch may produce at most 26,000 output+reasoning tokens; a reply that hits
 * it comes back truncated (the router's truncation repair) and is treated as a
 * SIZE failure, never as data.
 */
export function maxOutputTokensFor(episodeCount: number): number {
  return episodeCount * OUTPUT_TOKENS_PER_EPISODE + OUTPUT_TOKENS_OVERHEAD
}

/**
 * Worst-case cost of one batch: the prompt (pessimistic chars→tokens) plus the
 * FULL `max_tokens` of output. Because the call is capped at exactly that, the
 * budget gate below is a true upper bound, not a guess.
 */
export function estimateBatchCostUsd(promptChars: number, episodeCount: number, pricing: Pricing): number {
  const inTokens = Math.ceil(promptChars / CHARS_PER_TOKEN) + PROMPT_OVERHEAD_TOKENS
  const outTokens = maxOutputTokensFor(episodeCount)
  return (inTokens * pricing.inputCostPer1M + outTokens * pricing.outputCostPer1M) / 1_000_000
}

export type BudgetDecision =
  | { allowed: true; estimate: number }
  | { allowed: false; estimate: number; reason: string }

export function checkBudget(spentUsd: number, estimateUsd: number, limitUsd: number): BudgetDecision {
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) {
    return { allowed: false, estimate: estimateUsd, reason: "run has no positive budget_limit_usd" }
  }
  if (spentUsd + estimateUsd > limitUsd) {
    return {
      allowed: false,
      estimate: estimateUsd,
      reason: `budget: spent $${spentUsd.toFixed(4)} + next ≈$${estimateUsd.toFixed(4)} > cap $${limitUsd.toFixed(2)}`,
    }
  }
  return { allowed: true, estimate: estimateUsd }
}
