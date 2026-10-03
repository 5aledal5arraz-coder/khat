/**
 * Name normalization (B7). Pure.
 *
 * The stored display name / alias is never altered — this only builds a
 * separate COMPARISON key. Deliberately NOT the shared folds
 * (`lib/stories/story.ts#fold`, `lib/studio/verbatim.ts#foldVerbatim`): both
 * fold ة → ه, which B7 forbids («فاطمة» and «فاطمه» stay distinct keys; that
 * is a duplicate the reviewer can merge, never a merge the system guessed).
 *
 * Applied, in order:
 *   NFKC · tashkeel removed · tatweel removed · أ/إ/آ/ٱ → ا · ى → ي ·
 *   punctuation stripped · Latin lower-cased · whitespace collapsed ·
 *   leading honorifics stripped (د. / دكتور / المهندس / الشيخ / الكابتن /
 *   الأستاذ / أ. / م.)
 * No phonetic substitutions.
 */

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g

/** Honorific tokens, already in normalized form (dots removed, alef folded). */
const HONORIFIC_TOKENS = new Set([
  "د",
  "دكتور",
  "الدكتور",
  "المهندس",
  "مهندس",
  "الشيخ",
  "الكابتن",
  "كابتن",
  "الاستاذ",
  "استاذ",
  "ا",
  "م",
  "dr",
  "eng",
])

/** Character-level normalization (no honorific stripping). */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return ""
  return input
    .normalize("NFKC")
    .replace(TASHKEEL, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Comparison key for a person's name: normalizeText + leading honorifics removed. */
export function normalizeNameKey(name: string | null | undefined): string {
  const tokens = normalizeText(name).split(" ").filter(Boolean)
  let i = 0
  // Strip only LEADING honorifics, and never the last remaining token
  // (a person called «الشيخ» alone keeps a key).
  while (i < tokens.length - 1 && HONORIFIC_TOKENS.has(tokens[i])) i++
  return tokens.slice(i).join(" ")
}

/** Number of name tokens in the comparison key. */
export function nameTokenCount(key: string): number {
  return key ? key.split(" ").length : 0
}

/**
 * True when `needle` occurs inside `haystack` as whole normalized tokens —
 * the check B6 uses for "display_name appears within evidence_text".
 */
export function containsNormalized(haystack: string, needle: string): boolean {
  const h = ` ${normalizeText(haystack)} `
  const n = normalizeText(needle)
  if (!n) return false
  return h.includes(` ${n} `)
}

/** Normalized tokens of a string (normalizeText split on spaces). */
export function tokensOf(s: string | null | undefined): string[] {
  return normalizeText(s).split(" ").filter(Boolean)
}

/** Start index of `needle` as a contiguous token run inside `hay`, or -1. */
export function findTokenSpan(hay: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > hay.length) return -1
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, k) => hay[i + k] === t)) return i
  }
  return -1
}

/** A letter, digit or combining mark (Arabic tashkeel included) — i.e. "inside a word". */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u

/** The single proclitics Addendum 2 (b) allows attached to the start of a name. */
export const PROCLITICS = new Set(["و", "ب", "ل", "ف"])

/**
 * Comparison form for EXACT matching (Addendum 2 a): tashkeel stripped and
 * every whitespace run collapsed to one space. Nothing else — no letter
 * folding, no fuzzy. Stored text is never altered; this is compare-only.
 */
export function matchForm(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(TASHKEEL, "").replace(/\s+/g, " ").trim()
}

/**
 * `needle` occurs in `hay` VERBATIM (after `matchForm` on both sides) and on
 * word boundaries at both ends — «علي» is never found in «تعليم».
 *
 * `proclitic: true` (Addendum 2 b): the match may be preceded by EXACTLY ONE
 * attached و/ب/ل/ف («ومازن الضراب» contains «مازن الضراب»), which itself
 * must start a word — no stacking («وبمازن» does not match), no fuzzy.
 */
export function containsAsWords(hay: string, needle: string, opts: { proclitic?: boolean } = {}): boolean {
  const h = matchForm(hay)
  const n = matchForm(needle)
  if (!n) return false
  const firstIsWord = WORD_CHAR.test(n[0])
  const lastIsWord = WORD_CHAR.test(n[n.length - 1])
  let i = h.indexOf(n)
  while (i >= 0) {
    const before = i > 0 ? h[i - 1] : ""
    const after = h[i + n.length] ?? ""
    let okBefore = !firstIsWord || !before || !WORD_CHAR.test(before)
    if (!okBefore && opts.proclitic && PROCLITICS.has(before)) {
      const beforeThat = i > 1 ? h[i - 2] : ""
      okBefore = !beforeThat || !WORD_CHAR.test(beforeThat)
    }
    const okAfter = !lastIsWord || !after || !WORD_CHAR.test(after)
    if (okBefore && okAfter) return true
    i = h.indexOf(n, i + 1)
  }
  return false
}

/**
 * `findTokenSpan` for a NAME: the first name token may carry exactly one
 * attached proclitic (و/ب/ل/ف) in `hay` (Addendum 2 b). Tokens come from
 * `tokensOf`, so this stays a whole-token match.
 */
export function findNameSpan(hay: string[], nameTokens: string[]): number {
  if (nameTokens.length === 0 || nameTokens.length > hay.length) return -1
  // These are WORD tokens of a name, never letters of it: the first TOKEN is
  // compared whole, optionally behind one attached proclitic letter.
  const [headToken, ...restTokens] = nameTokens
  for (let i = 0; i + nameTokens.length <= hay.length; i++) {
    if (!tokenWithOptionalProclitic(hay[i], headToken)) continue
    if (restTokens.every((t, k) => hay[i + 1 + k] === t)) return i
  }
  return -1
}

/** `token` is `word`, or exactly one of و/ب/ل/ف glued to `word`. */
function tokenWithOptionalProclitic(token: string, word: string): boolean {
  if (token === word) return true
  const clitic = token.charAt(0)
  return token.length === word.length + 1 && PROCLITICS.has(clitic) && token.endsWith(word)
}
