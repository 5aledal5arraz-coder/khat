/**
 * Khat Map v2 — title near-duplicate detection (token-Jaccard).
 *
 * One implementation, shared by:
 *   - the batch engine's post-LLM filter (drop AI candidates that duplicate
 *     an already-chosen/seeded topic), and
 *   - the wizard's pending-list dedup (collapse near-identical AI titles).
 *
 * Pure string math — no I/O — so it's trivial to unit-test.
 */

/**
 * The operator-tuned similarity threshold. High enough to catch
 * "نجاح في عالم متسارع" vs "الخوف من الفشل في مجتمع النجاح" style clusters,
 * low enough not to collapse genuinely distinct titles that share a word.
 */
export const TITLE_DEDUP_JACCARD_THRESHOLD = 0.55

/**
 * Tokenize a title for comparison: NFKC-normalize, strip Arabic diacritics
 * (tashkeel) + tatweel and unify alef-hamza variants so undiacritized /
 * differently-hamza'd spellings of the same word match, lowercase, strip
 * Arabic+Latin punctuation, and drop single-char tokens.
 */
export function normalizeTitleTokens(s: string): Set<string> {
  const cleaned = s
    .normalize("NFKC")
    // tashkeel (U+064B–U+0652), superscript alef (U+0670), tatweel (U+0640)
    .replace(/[ً-ْٰـ]/g, "")
    // أ إ آ ٱ → bare alef ا
    .replace(/[آأإٱ]/g, "ا")
    .toLowerCase()
    .replace(/[.,;:!؟،؛"'«»“”‘’()\[\]{}\-—–_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return new Set(cleaned.split(" ").filter((t) => t.length >= 2))
}

/** Token-set Jaccard similarity in [0, 1]. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * True when `title` is a near-duplicate of any string in `existing`
 * (≥ threshold token-Jaccard). Empty/whitespace titles never match.
 */
export function isNearDuplicateTitle(
  title: string,
  existing: Iterable<string>,
  threshold: number = TITLE_DEDUP_JACCARD_THRESHOLD,
): boolean {
  const tokens = normalizeTitleTokens(title)
  if (tokens.size === 0) return false
  for (const other of existing) {
    if (jaccardSimilarity(tokens, normalizeTitleTokens(other)) >= threshold) {
      return true
    }
  }
  return false
}
