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

/**
 * What a returned call ACTUALLY costs the budget (2026-10-03).
 *   • the router booked a provider cost → that, exactly;
 *   • no booked cost but token counts → priced from the tokens;
 *   • failed before any work — 429 / no credits / auth (the router exposes
 *     no usage on errors, and the provider billed nothing) → 0;
 *   • failed with unknown usage (timeout, 5xx: generation may have been
 *     billed) or succeeded without any usage figure → the reservation,
 *     pessimistically — never silently zero.
 */
const NO_USAGE_ERRORS = new Set(["rate_limited", "quota_exceeded", "auth_failed"])

export function billableCostUsd(
  result: { status: string; costUsd: number | null; tokensIn: number | null; tokensOut: number | null; errorClass: string | null },
  pricing: Pricing,
  reservedUsd: number,
): number {
  if (result.costUsd != null && Number.isFinite(result.costUsd)) return Math.max(0, result.costUsd)
  if (result.tokensIn != null || result.tokensOut != null) {
    return ((result.tokensIn ?? 0) * pricing.inputCostPer1M + (result.tokensOut ?? 0) * pricing.outputCostPer1M) / 1_000_000
  }
  if (result.status !== "succeeded" && NO_USAGE_ERRORS.has(String(result.errorClass ?? ""))) return 0
  return reservedUsd
}
