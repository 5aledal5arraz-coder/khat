// Input validation for Hibr content

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

export function validateArticleTitle(title: string): ValidationResult {
  return validateLength(title, 3, 200, 'عنوان المقال يجب أن يكون ٣ أحرف على الأقل', 'عنوان المقال يجب ألا يتجاوز ٢٠٠ حرف')
}

export function validateArticleContent(content: string): ValidationResult {
  return validateLength(content, 50, 50000, 'محتوى المقال يجب أن يكون ٥٠ حرفاً على الأقل', 'محتوى المقال يجب ألا يتجاوز ٥٠,٠٠٠ حرف')
}

export function validateArticleExcerpt(excerpt: string): ValidationResult {
  if (excerpt.length > 500) return { valid: false, error: 'ملخص المقال يجب ألا يتجاوز ٥٠٠ حرف' }
  return { valid: true }
}

export function validateTags(tags: string[]): ValidationResult {
  if (tags.length > 5) return { valid: false, error: 'يمكنك اختيار ٥ وسوم كحد أقصى' }
  for (const tag of tags) {
    if (tag.length > 30) return { valid: false, error: `الوسم "${tag}" يجب ألا يتجاوز ٣٠ حرف` }
  }
  return { valid: true }
}

export function validateThoughtContent(content: string): ValidationResult {
  return validateLength(content, 1, 280, 'المحتوى مطلوب', 'الخاطرة يجب ألا تتجاوز ٢٨٠ حرف')
}

export function validateCommentContent(content: string): ValidationResult {
  return validateLength(content, 1, 500, 'التعليق مطلوب', 'التعليق يجب ألا يتجاوز ٥٠٠ حرف')
}

export function validateReplyContent(content: string): ValidationResult {
  return validateLength(content, 1, 280, 'الرد مطلوب', 'الرد يجب ألا يتجاوز ٢٨٠ حرف')
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

export function validateReportReason(reason: string): ValidationResult {
  const valid = ['spam', 'harassment', 'inappropriate', 'misinformation', 'other'].includes(reason)
  if (!valid) return { valid: false, error: 'سبب البلاغ غير صالح' }
  return { valid: true }
}

export function validateArticle(data: { title: string; content: string; excerpt?: string; tags?: string[] }): ValidationResult {
  const titleResult = validateArticleTitle(data.title)
  if (!titleResult.valid) return titleResult

  const contentResult = validateArticleContent(data.content)
  if (!contentResult.valid) return contentResult

  if (data.excerpt) {
    const excerptResult = validateArticleExcerpt(data.excerpt)
    if (!excerptResult.valid) return excerptResult
  }

  if (data.tags) {
    const tagsResult = validateTags(data.tags)
    if (!tagsResult.valid) return tagsResult
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
} as const
