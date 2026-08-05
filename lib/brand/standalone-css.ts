/**
 * Brand CSS for documents that are NOT the app: the media kit, the print view,
 * the proposal PDF. They ship as their own `<html>` strings, so they cannot
 * read `app/globals.css` — they each carried a private copy of the identity,
 * and each copy drifted.
 *
 * WHAT WAS WRONG. All three fetched IBM Plex Sans Arabic from Google with an
 * `@import`. When the site moved to Manifa V2 their `font-family` was updated
 * and the `@import` was not, so they declared one typeface and downloaded
 * another — the declaration failed to resolve and they fell back. The
 * type-scale guard caught it; a visual check would not have, because the
 * fallback is a reasonable-looking Arabic face.
 *
 * The proposal PDF additionally hardcoded `hsl(252 48% 40%)` and
 * `hsl(22 90% 53%)` — the pre-2026-08-04 indigo and orange, neither of which is
 * in «ملف عرض الشعار».
 *
 * ABSOLUTE URLs. A PDF renderer resolves relative paths against nothing, so
 * the font `src` has to name the origin. `APP_URL` is the same value the email
 * templates use for their logo.
 */

import { APP_URL } from "@/lib/email/resend"

/** KHAT DEEP INDIGO — «ملف عرض الشعار». */
export const STANDALONE_INDIGO = "#362e6d"
/** KHAT ORANGE. */
export const STANDALONE_ORANGE = "#fd4f04"
/** KHAT Warm Ivory. */
export const STANDALONE_IVORY = "#f8f3ef"
/** KHAT Burnt Orange — the identity's readable orange, 4.66:1 on the ivory. */
export const STANDALONE_ORANGE_TEXT = "#c83b0d"

/**
 * The rest of «ملف عرض الشعار», for documents that cannot read `globals.css`.
 *
 * These are the identity's own secondary colours. They are here because the
 * three files CLAUDE.md lists as outside the token swap point — the email
 * templates, the proposal PDF, the media kit — were each keeping a private set
 * of invented neutrals (`#1b1630`, `#403a55`, `#ddd7dd`, `#ece7e7`…). Hand-kept
 * copies are exactly how off-palette colours survive a cleanup, so there is now
 * one list and the documents import from it.
 *
 * Contrast on the ivory, measured: Signature Purple 11.09, Deep Indigo 10.78,
 * Burnt Orange 4.66, Dusty Violet 4.14.
 */
/** KHAT Signature Purple — the identity's ink, and the site's `--foreground`. */
export const STANDALONE_INK = "#342c6b"
/** KHAT Dusty Violet. Secondary/meta text; 4.14:1, so never for running copy. */
export const STANDALONE_MUTED = "#7570a3"
/** KHAT Warm Stone — rules, borders, dividers. */
export const STANDALONE_STONE = "#d9d0c8"
/** KHAT Soft Blush — the raised surface, the same one the site uses for cards. */
export const STANDALONE_BLUSH = "#fff7f5"
/** KHAT Lavender Mist — chips and callout edges. */
export const STANDALONE_MIST = "#d9d5e8"

/**
 * `@font-face` for Manifa V2, for a standalone document.
 *
 * @param origin absolute origin to resolve /fonts against. Defaults to
 *   `APP_URL`; pass "" for a same-origin document (a print window), where a
 *   root-relative path is correct and an absolute one is a needless hop.
 */
export function manifaFontFace(origin: string = APP_URL): string {
  const at = (weight: string, file: string) =>
    `@font-face{font-family:'Manifa V2';src:url('${origin}/fonts/${file}') format('woff2');` +
    `font-weight:${weight};font-style:normal;font-display:swap;}`
  return [
    at("300", "manifa-v2-300.woff2"),
    at("400 500", "manifa-v2-400.woff2"),
    at("600", "manifa-v2-600.woff2"),
    at("700 900", "manifa-v2-700.woff2"),
  ].join("\n  ")
}

/** The family stack these documents set. Matches `--font-brand-sans`. */
export const STANDALONE_FONT_STACK = `'Manifa V2','Noto Naskh Arabic',sans-serif`
