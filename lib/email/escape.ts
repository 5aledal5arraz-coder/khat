/**
 * HTML-escape plain-text values before interpolating them into email HTML.
 *
 * Use for any user/admin-supplied *text* field (names, subjects, free-text
 * bodies) injected into a template string. Do NOT use on intentional HTML
 * (e.g. the newsletter campaign body, which is authored markup).
 */
export function escapeHtml(value: unknown): string {
  const str = value == null ? "" : String(value)
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
