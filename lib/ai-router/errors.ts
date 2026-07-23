/**
 * Shared provider-error helpers.
 *
 * `isQuotaExceededError` is the ONE place the "OpenAI account is out of
 * credit / over its billing cap" signal is recognized. OpenAI returns HTTP 429
 * for BOTH a transient rate-limit (`rate_limit_exceeded`, worth retrying) AND a
 * terminal billing/quota failure (`insufficient_quota`, retrying is futile). The
 * router already excludes `quota_exceeded` from its retry set; this helper lets
 * the JOB layer make the same distinction so a quota failure fails FAST (dead on
 * the first attempt) with a clear operator message instead of burning 3 attempts
 * over ~8 minutes behind a spinner.
 *
 * Kept dependency-light on purpose (no imports) so the jobs layer can use it
 * without pulling in the heavy router module graph; `router.ts` imports THIS so
 * the substring set stays single-sourced.
 */

/** True when an error is an OpenAI quota/billing exhaustion (not a transient rate-limit). */
export function isQuotaExceededError(err: unknown): boolean {
  const lower = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    lower.includes("exceeded your current quota") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota_exceeded") ||
    (lower.includes("429") && lower.includes("quota"))
  )
}

/**
 * Operator-facing message shown when a job dies because the OpenAI account has no
 * quota/credit. Arabic (all user-facing text is Arabic) + actionable: says the
 * cause AND the fix, so the operator tops up and retries instead of waiting blind.
 */
export const QUOTA_EXCEEDED_MESSAGE =
  "حساب OpenAI بلا رصيد أو تجاوز الحدّ المسموح. أضف رصيداً من platform.openai.com ثم أعد المحاولة."
