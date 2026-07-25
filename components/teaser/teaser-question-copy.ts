/**
 * Copy + feedback rules for the public «اسأل الضيف» form.
 *
 * Extracted from `teaser-question-form.tsx` for the same reason
 * `submission-messages.ts` was extracted from `submissions-tabs.tsx`: these are
 * pure decisions (which message, whose field, what tone) and the test suite is
 * node-environment — a `.tsx` component cannot be rendered, but this can be
 * asserted directly.
 *
 * The numbers all come from `QUESTION_LIMITS`, which is also what the route
 * enforces, so the visitor is never quoted a limit the server does not apply.
 */

import { formatArabicCount } from "@/lib/shared/formatters"
import { QUESTION_LIMITS } from "@/lib/validation/forms"

/**
 * Which field a message belongs to. Drives BOTH where the message renders and
 * the `aria-invalid` / `aria-describedby` wiring — a screen-reader user is told
 * which field to fix, not just that something failed. `null` = form-level.
 */
export type FeedbackField = "question" | "name" | null

/**
 * `error` = the visitor must change something (destructive red).
 * `notice` = an expected throttle; nothing is wrong with what they wrote, so it
 * must not be dressed in the same red as a validation failure.
 */
export type FeedbackTone = "error" | "notice"

export interface Feedback {
  message: string
  field: FeedbackField
  tone: FeedbackTone
}

/**
 * The 429 copy. `rateLimitResponse()` in lib/api-utils.ts answers the generic
 * «لقد تجاوزت الحد المسموح. حاول لاحقاً» — true for every caller and useful to
 * none: it names neither the limit nor the wait. That helper is shared by the
 * whole API, so this form states the real numbers itself rather than changing
 * an error string every other endpoint depends on.
 */
export const RATE_LIMIT_MESSAGE =
  `وصلت الحد الأعلى: ${formatArabicCount(QUESTION_LIMITS.PER_HOUR, "سؤال")} في الساعة. ` +
  `جرّب بعد شوي — أسئلتك السابقة وصلتنا.`

export const GENERIC_FAILURE_MESSAGE = "تعذّر إرسال السؤال، حاول مرة ثانية"
export const OFFLINE_MESSAGE = "تعذّر الاتصال — تأكد من الإنترنت وحاول مرة ثانية"

/**
 * Map a failed submission to the message the visitor sees.
 *
 * 422 is attributed to the question field: every 422 the route can return
 * (length, profanity, missing text) is about the question itself — the one
 * name-length 422 is already caught client-side before the request is sent.
 */
export function describeSubmitFailure(status: number, apiError?: unknown): Feedback {
  if (status === 429) {
    return { message: RATE_LIMIT_MESSAGE, field: null, tone: "notice" }
  }

  const message = typeof apiError === "string" && apiError.trim() ? apiError : GENERIC_FAILURE_MESSAGE
  return { message, field: status === 422 ? "question" : null, tone: "error" }
}

/**
 * The hint beside the character counter.
 *
 * The counter alone («3/280») advertises the ceiling and hides the floor, so a
 * short question looked perfectly valid until the send failed. The minimum is
 * stated until it is met, then the counter carries on alone.
 */
export function questionCounterHint(trimmedLength: number): string {
  if (trimmedLength >= QUESTION_LIMITS.MIN_CHARS) return ""
  return `الحد الأدنى ${QUESTION_LIMITS.MIN_CHARS} أحرف`
}
