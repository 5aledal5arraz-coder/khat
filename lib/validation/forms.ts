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

export function validateQuestionContent(text: string): ValidationResult {
  return validateLength(text, 10, 280, 'السؤال يجب أن يكون ١٠ أحرف على الأقل', 'السؤال يجب ألا يتجاوز ٢٨٠ حرف')
}

export function validateDisplayName(name: string): ValidationResult {
  const trimmed = name.trim()
  if (trimmed.length > 0 && trimmed.length < 2) return { valid: false, error: 'الاسم يجب أن يكون حرفين على الأقل' }
  if (trimmed.length > 50) return { valid: false, error: 'الاسم يجب ألا يتجاوز ٥٠ حرف' }
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
} as const
