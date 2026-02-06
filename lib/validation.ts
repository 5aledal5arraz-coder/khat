// Input validation for Hibr content

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateArticleTitle(title: string): ValidationResult {
  const trimmed = title.trim()
  if (trimmed.length < 3) return { valid: false, error: 'عنوان المقال يجب أن يكون ٣ أحرف على الأقل' }
  if (trimmed.length > 200) return { valid: false, error: 'عنوان المقال يجب ألا يتجاوز ٢٠٠ حرف' }
  return { valid: true }
}

export function validateArticleContent(content: string): ValidationResult {
  const trimmed = content.trim()
  if (trimmed.length < 50) return { valid: false, error: 'محتوى المقال يجب أن يكون ٥٠ حرفاً على الأقل' }
  if (trimmed.length > 50000) return { valid: false, error: 'محتوى المقال يجب ألا يتجاوز ٥٠,٠٠٠ حرف' }
  return { valid: true }
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
  const trimmed = content.trim()
  if (trimmed.length < 1) return { valid: false, error: 'المحتوى مطلوب' }
  if (trimmed.length > 280) return { valid: false, error: 'الخاطرة يجب ألا تتجاوز ٢٨٠ حرف' }
  return { valid: true }
}

export function validateCommentContent(content: string): ValidationResult {
  const trimmed = content.trim()
  if (trimmed.length < 1) return { valid: false, error: 'التعليق مطلوب' }
  if (trimmed.length > 500) return { valid: false, error: 'التعليق يجب ألا يتجاوز ٥٠٠ حرف' }
  return { valid: true }
}

export function validateReplyContent(content: string): ValidationResult {
  const trimmed = content.trim()
  if (trimmed.length < 1) return { valid: false, error: 'الرد مطلوب' }
  if (trimmed.length > 280) return { valid: false, error: 'الرد يجب ألا يتجاوز ٢٨٠ حرف' }
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
