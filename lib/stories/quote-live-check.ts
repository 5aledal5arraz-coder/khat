/**
 * Which SPELLING of a story quote is the live page showing?
 *
 * `scripts/verify-content-live.ts --quotes` could not answer that. Its check is
 * "is the first 45 characters of each local quote somewhere on the page" — and
 * the page also carries the full transcript, in the speech recogniser's own
 * spelling. A quote file still holding the pre-proofread «القصه» is therefore
 * always "found" (in the transcript), so 124 corrected quotes could never be
 * told apart from their stale versions. On top of that, the Arabic fold that
 * proves a quote is VERBATIM (`fold` in lib/stories/story.ts: ة→ه, ى→ي, أ→ا…)
 * erases exactly the letters the proofread changed, by design.
 *
 * So this reads only the rendered quote block (`#sec-story-quotes`, what a
 * reader sees) and judges each displayed quote twice:
 *   • FOLDED — is it the local quote, word for word, under the Arabic fold?
 *     (the verbatim check — blind to spelling on purpose)
 *   • RAW    — for a quote with a correction record (quotes-preproofread/),
 *     is it the corrected text byte-for-byte after NFC? If it is the folded
 *     twin but not the raw one, the server holds a stale spelling.
 *
 * Pure; the script does the I/O.
 */
import { fold } from "@/lib/stories/story"

export interface LocalQuote {
  text: string
  start?: number
}

/** A quote whose proofread changed its spelling: current vs pre-proofread. */
export interface CorrectionPair {
  current: string
  pre: string
}

const nfc = (s: string) => s.normalize("NFC")
/** The verbatim key: Arabic fold, then letters/digits only (punctuation-blind). */
const lettersKey = (s: string) => fold(nfc(s)).replace(/[^ء-ي0-9a-z]/g, "")

/**
 * Pair each current quote with its pre-proofread record. The proofread never
 * reordered or removed quotes, so index + `start` identify the same quote; a
 * pair whose `start` disagrees is skipped rather than guessed. Only pairs whose
 * text actually changed are corrections.
 */
export function correctionPairs(
  current: LocalQuote[],
  pre: LocalQuote[] | null | undefined,
): CorrectionPair[] {
  if (!pre) return []
  const out: CorrectionPair[] = []
  for (let i = 0; i < current.length; i++) {
    const c = current[i]
    const p = pre[i]
    if (!p) continue
    if (c.start !== undefined && p.start !== undefined && c.start !== p.start) continue
    if (nfc(c.text) !== nfc(p.text)) out.push({ current: c.text, pre: p.text })
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

/** The `<section id="sec-story-quotes">…</section>` slice, or null. */
function quoteSection(html: string): string | null {
  const at = html.indexOf('id="sec-story-quotes"')
  if (at < 0) return null
  const start = html.lastIndexOf("<section", at)
  const re = /<\/?section\b/g
  re.lastIndex = start
  let depth = 0
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0][1] === "/" ? -1 : 1
    if (depth === 0) return html.slice(start, m.index)
  }
  return html.slice(start)
}

/**
 * The quotes the page DISPLAYS, as a reader sees them (entities decoded, tags
 * and React comment markers stripped, NFC, «» removed). Null when the page has
 * no quote block at all — the caller must treat that as "cannot see", never as
 * "zero stale".
 */
export function renderedQuotes(html: string): string[] | null {
  const section = quoteSection(html)
  if (section === null) return null
  return [...section.matchAll(/<p class="text-pretty[^"]*">([\s\S]*?)<\/p>/g)].map((m) =>
    nfc(
      decodeEntities(m[1].replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^«/, "")
        .replace(/»$/, ""),
    ),
  )
}

export interface QuoteSpellingReport {
  /** Quotes displayed on the page. */
  shown: number
  /** Displayed quotes that are NOT any local quote even under the fold. */
  notVerbatim: string[]
  /** Displayed quotes that have a correction record. */
  correctedShown: number
  /** …of which the page shows the corrected spelling byte-for-byte. */
  correctedLive: number
  /** Folded-equal to a corrected quote but not raw-equal: stale spelling. */
  stale: { shown: string; expected: string; matchesPreproofread: boolean }[]
  /** Corrections the page does not display — unverifiable from this page. */
  correctedNotShown: number
}

export function checkQuoteSpelling(
  shown: string[],
  current: LocalQuote[],
  pairs: CorrectionPair[],
): QuoteSpellingReport {
  const currentKeys = new Set(current.map((q) => lettersKey(q.text)))
  const pairByKey = new Map(pairs.map((p) => [lettersKey(p.current), p]))

  const notVerbatim: string[] = []
  const stale: QuoteSpellingReport["stale"] = []
  let correctedShown = 0
  let correctedLive = 0
  const seenPairs = new Set<CorrectionPair>()

  for (const q of shown) {
    const key = lettersKey(q)
    if (!currentKeys.has(key)) notVerbatim.push(q)
    const pair = pairByKey.get(key)
    if (!pair) continue
    seenPairs.add(pair)
    correctedShown++
    if (nfc(q) === nfc(pair.current)) correctedLive++
    else stale.push({ shown: q, expected: pair.current, matchesPreproofread: nfc(q) === nfc(pair.pre) })
  }

  return {
    shown: shown.length,
    notVerbatim,
    correctedShown,
    correctedLive,
    stale,
    correctedNotShown: pairs.length - seenPairs.size,
  }
}
