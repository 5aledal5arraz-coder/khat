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

/**
 * `error_class` written when `classifyError` recognized NOTHING.
 *
 * It used to write `err.name`, which for a plain `new Error(...)` is the
 * string `"Error"` — a label that carries no information AND is
 * indistinguishable from a genuine class name, so an unclassified failure
 * read like a classified one. Anything built on `error_class` (alerts,
 * dashboards, retry policy) was therefore silently blind to it: the exact
 * failure mode this constant exists to make visible.
 *
 * Named errors keep their own name (`GroundingContractError`, the OpenAI
 * SDK's `BadRequestError`/`NotFoundError`, …) — those ARE informative.
 * Only the empty ones collapse here.
 *
 * Rows carrying this class are surfaced as their own ops alert rather than
 * guessed at: a class we cannot name is a gap in THIS function, and the
 * honest response is to show the gap, not to invent a bucket for it.
 */
export const UNCLASSIFIED_ERROR_CLASS = "unclassified"

/**
 * The error classes that mean "the provider stopped serving us entirely" —
 * no credit, or a key the provider refuses. Both are account-level and
 * terminal: every AI feature is down until a human fixes billing or the key,
 * and no retry anywhere in the system can help.
 *
 * Single-sourced HERE so the router's retry policy and the ops alert can
 * never drift on what "everything stopped" means.
 */
export const PROVIDER_BLOCKED_ERROR_CLASSES: ReadonlySet<string> = new Set([
  "quota_exceeded",
  "auth_failed",
])
