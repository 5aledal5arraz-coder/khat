import DOMPurify from 'isomorphic-dompurify'

/**
 * Strip ALL HTML tags — returns plain text only.
 * Normalizes Unicode to NFC form to prevent homograph attacks.
 */
export function stripHtml(text: string): string {
  const clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return clean.normalize('NFC').trim()
}
