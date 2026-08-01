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

/**
 * Phrases that mean the ACCOUNT is out of money / over its billing cap.
 * Terminal: no retry anywhere in the system can help until a human pays.
 *
 * Gemini's spend-cap 429 never says "quota" — it says "exceeded its monthly
 * spending cap" with `status: RESOURCE_EXHAUSTED`. Because the old predicate
 * only looked for the word `quota`, every one of those was classified
 * `rate_limited` (retryable), so each candidate burned 3 doomed attempts and
 * the `quota_exceeded` ops alert never fired. Verified against `ai_runs`:
 * 180 rows, provider=gemini, error_class=rate_limited, all this one message.
 *
 * `RESOURCE_EXHAUSTED` alone is deliberately NOT here — Google returns that
 * status for genuine per-minute rate limits too, which ARE worth retrying.
 */
const TERMINAL_BILLING_SIGNALS = [
  "exceeded your current quota", // OpenAI: out of credit
  "insufficient_quota", // OpenAI: error code
  "quota_exceeded", // our own class name, echoed back through a wrapper
  "spending cap", // Gemini: project monthly spend cap
  "spend cap", // Gemini: same cap, docs/URL phrasing
]

/**
 * Phrases that mean "you are going too fast" — transient; retrying WILL help.
 *
 * These guard the legacy `429 + "quota"` catch-all below, because Google
 * phrases an ordinary per-minute throttle as "Quota exceeded for quota metric
 * '… requests per minute'". Without this guard that message would be called
 * terminal — and now that `quota_exceeded` also raises the "provider stopped
 * serving us" ops alert, a 60-second throttle would page as an outage.
 */
const TRANSIENT_RATE_SIGNALS = [
  "per minute",
  "per min",
  "per day",
  "requests per",
  "tokens per",
  "rate limit",
  "ratelimit",
  "retry after",
]

/** True when an error is a quota/billing exhaustion (not a transient rate-limit). */
export function isQuotaExceededError(err: unknown): boolean {
  const lower = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (TERMINAL_BILLING_SIGNALS.some((s) => lower.includes(s))) return true
  // Legacy catch-all for a 429 that only hints at "quota" — kept, but no
  // longer allowed to swallow a message that names a per-minute/per-day rate.
  return (
    lower.includes("429") &&
    lower.includes("quota") &&
    !TRANSIENT_RATE_SIGNALS.some((s) => lower.includes(s))
  )
}

/**
 * HTTP/status hints that a provider call failed for a TRANSIENT reason.
 *
 * Note `429` is in here: most 429s really are "slow down". The danger is that
 * a spend-cap failure is ALSO a 429, which is why nothing may test this
 * pattern directly — use `isRetriableProviderError`, which subtracts the
 * terminal billing case first.
 */
const TRANSIENT_HTTP_SIGNALS = /\b(503|429|504|UNAVAILABLE|overloaded)\b/i

/**
 * Should a bespoke retry loop try this provider error again?
 *
 * Exists because two hand-rolled `callWithRetry` loops
 * (`lib/ai/preparation/research/gemini.ts`, `lib/ai/grounded-evidence.ts`)
 * each carried their OWN copy of the regex above and never consulted
 * `isQuotaExceededError`. A Gemini spend-cap error contains "429", so both
 * loops classified a terminal billing failure as transient and burned three
 * doomed attempts per candidate — the precise behaviour the `errors.ts` fix
 * was written to end, reaching only the router and the jobs layer while these
 * two paths kept doing it.
 *
 * Terminal billing is checked FIRST: it always wins over the status hint.
 */
export function isRetriableProviderError(err: unknown): boolean {
  if (isQuotaExceededError(err)) return false
  const message = err instanceof Error ? err.message : String(err)
  return TRANSIENT_HTTP_SIGNALS.test(message)
}

/**
 * Operator-facing message shown when a job dies because the provider account has
 * no quota/credit. Arabic (all user-facing text is Arabic) + actionable: says the
 * cause AND the fix, so the operator tops up and retries instead of waiting blind.
 *
 * Names BOTH providers because the predicate above now recognizes Gemini's
 * spend-cap failure as well; a single message beats plumbing the provider
 * through every call site, and pointing at the wrong billing page is worse
 * than pointing at two.
 */
export const QUOTA_EXCEEDED_MESSAGE =
  "مزوّد الذكاء الاصطناعي أوقف الخدمة: الحساب بلا رصيد أو تجاوز حدّ الإنفاق. راجع الفوترة في OpenAI (platform.openai.com) أو Google AI Studio (ai.studio/spend) ثم أعد المحاولة."

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
