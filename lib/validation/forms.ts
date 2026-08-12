export interface ValidationResult {
  valid: boolean
  error?: string
}

/** Reusable string-length validator. min=0 means optional (empty allowed). */
function validateLength(text: string, min: number, max: number, tooShortMsg: string, tooLongMsg: string): ValidationResult {
  const trimmed = text.trim()
  if (trimmed.length < min) return { valid: false, error: tooShortMsg }
  if (trimmed.length > max) return { valid: false, error: tooLongMsg }
  return { valid: true }
}

/**
 * Submission limits for the public «اسأل الضيف» question form.
 *
 * Single source on purpose: `POST /api/teaser/[id]/questions` ENFORCES these
 * numbers and `TeaserQuestionForm` STATES them to the visitor. Holding them in
 * one place is what keeps «وصلت الحد: 3 أسئلة في الساعة» from drifting away
 * from the limit the route actually applies.
 *
 * Digits in every message below are Latin — the same system `formatArabicCount`
 * emits, so a form never shows «١٠ أحرف» next to a «3/280» counter.
 */
export const QUESTION_LIMITS = {
  MIN_CHARS: 10,
  MAX_CHARS: 280,
  /** Submissions allowed per IP per window (enforced by `checkIpRateLimit`). */
  PER_HOUR: 3,
  WINDOW_MS: 3_600_000,
} as const

export const NAME_LIMITS = { MIN_CHARS: 2, MAX_CHARS: 50 } as const

export function validateQuestionContent(text: string): ValidationResult {
  return validateLength(
    text,
    QUESTION_LIMITS.MIN_CHARS,
    QUESTION_LIMITS.MAX_CHARS,
    `السؤال يجب أن يكون ${QUESTION_LIMITS.MIN_CHARS} أحرف على الأقل`,
    `السؤال يجب ألا يتجاوز ${QUESTION_LIMITS.MAX_CHARS} حرف`,
  )
}

export function validateDisplayName(name: string): ValidationResult {
  const trimmed = name.trim()
  if (trimmed.length > 0 && trimmed.length < NAME_LIMITS.MIN_CHARS) {
    return { valid: false, error: 'الاسم يجب أن يكون حرفين على الأقل' }
  }
  if (trimmed.length > NAME_LIMITS.MAX_CHARS) {
    return { valid: false, error: `الاسم يجب ألا يتجاوز ${NAME_LIMITS.MAX_CHARS} حرف` }
  }
  return { valid: true }
}

/**
 * Stricter email validation: requires >=2 char local, domain with dot, >=2 char TLD.
 * Not RFC-complete but rejects obvious junk like a@b.c, user@.com, etc.
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/

export function validateEmail(email: string): ValidationResult {
  if (!email || typeof email !== 'string') return { valid: false, error: 'البريد الإلكتروني مطلوب' }
  if (!EMAIL_REGEX.test(email.trim())) return { valid: false, error: 'البريد الإلكتروني غير صالح' }
  return { valid: true }
}

export const ADMIN_LIMITS = {
  TITLE_LENGTH: 300,
  DESCRIPTION_LENGTH: 5000,
  LABEL_LENGTH: 100,
  /**
   * The guest's word about the recording, printed under their name on the
   * episode page. Short on purpose — it renders as a pull quote beside the
   * portrait, and a paragraph there stops reading as a quote.
   */
  TESTIMONIAL_LENGTH: 400,
} as const
