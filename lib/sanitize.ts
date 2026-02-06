import DOMPurify from 'isomorphic-dompurify'

// Allowed HTML tags for article content
const ARTICLE_ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'a']
const ARTICLE_ALLOWED_ATTRS = ['href', 'target', 'rel']

/**
 * Sanitize article content: allow safe formatting HTML
 */
export function sanitizeArticleContent(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
    ALLOWED_ATTR: ARTICLE_ALLOWED_ATTRS,
    ADD_ATTR: ['target'],
  })
  return normalizeUnicode(clean)
}

/**
 * Strip ALL HTML - for titles, thoughts, comments, replies
 */
export function stripHtml(text: string): string {
  const clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return normalizeUnicode(clean).trim()
}

/**
 * Sanitize article title (plain text only)
 */
export function sanitizeTitle(title: string): string {
  return stripHtml(title)
}

/**
 * Sanitize thought content (plain text only)
 */
export function sanitizeThought(content: string): string {
  return stripHtml(content)
}

/**
 * Sanitize comment/reply content (plain text only)
 */
export function sanitizeComment(content: string): string {
  return stripHtml(content)
}

/**
 * Normalize Unicode to NFC form to prevent homograph attacks
 */
function normalizeUnicode(text: string): string {
  return text.normalize('NFC')
}

/**
 * Generate a safe excerpt from content
 */
export function generateExcerpt(content: string, maxLength: number = 300): string {
  const plainText = stripHtml(content)
  if (plainText.length <= maxLength) return plainText
  return plainText.substring(0, maxLength).trimEnd() + '...'
}
