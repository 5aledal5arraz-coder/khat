/**
 * The verbatim guard — a quote is published only if it is in the transcript.
 *
 * WHY. Studio quotes are attributed on the public page to the guest by name
 * and photo. The website-package generator used to accept whatever the model
 * returned as `quotes`, and the model composes: aphorisms that read like the
 * guest but that he never said (the صلاح الغزالي case — see
 * `scripts/extract-story-quotes.ts`). The model is told to copy exact spans;
 * this module is the proof that it did.
 *
 * `foldVerbatim` is the normalisation `scripts/extract-story-quotes.ts` proved
 * on 545 quotes: tashkeel/tatweel dropped, hamza-alef / taa-marbuta / alef-
 * maqsura folded, hamza-on-waw/yaa folded, Arabic-Indic digits → ASCII, NFC,
 * every run of punctuation/whitespace collapsed to one space — plus one-letter
 * proclitics the recogniser split off («ل فحني») re-attached at match time.
 * That makes "verbatim" survive the speech recogniser's orthography («الاسر»
 * vs «الأسر») without ever letting a different WORD through — the comparison
 * is word-bounded, so «الحرية» does not match inside «الحريات».
 *
 * The haystack must be the FULL transcript text, never the chunk summary the
 * editorial prompt may have been given for a long episode — a sentence that is
 * only in the summary is the summariser's sentence, not the guest's.
 */

/** Fewer folded words than this matches by accident and proves nothing. */
export const MIN_VERBATIM_WORDS = 3

export function foldVerbatim(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    // Arabic-Indic (٠-٩) and Extended/Persian (۰-۹) digits → ASCII, so «١٩٩٠»
    // meets the recogniser's «1990».
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/**
 * The speech recogniser sometimes detaches a one-letter proclitic from its
 * word («ل فحني», «ف صارت») while the model — or the recogniser elsewhere —
 * writes it attached («لفحني»). Re-attach every standalone ل/ف/و/ب/ك token
 * to the word after it. Only whitespace moves: the letter sequence is
 * unchanged, so this can never let a different word through.
 */
const PROCLITIC_SPLIT = / (?:ل|ف|و|ب|ك) (?=\S)/g
function joinProclitics(folded: string): string {
  return ` ${folded} `.replace(PROCLITIC_SPLIT, (m) => ` ${m.trim()}`).trim()
}

/**
 * Fold once, padded, so every lookup is a word-bounded `includes`. The
 * haystack carries the text twice — as folded, and with split proclitics
 * re-attached — separated by a newline no folded needle can contain, so a
 * match never spans the two copies. Keeping the plain copy matters: a quote
 * that starts right after a detached «و» («و الحريه ما…») must still match
 * «الحريه ما…».
 */
export function buildVerbatimHaystack(transcript: string): string {
  const folded = foldVerbatim(transcript)
  return ` ${folded} \n ${joinProclitics(folded)} `
}

export function isVerbatimIn(text: string, haystack: string): boolean {
  const needle = foldVerbatim(text)
  if (!needle) return false
  if (needle.split(" ").length < MIN_VERBATIM_WORDS) return false
  if (haystack.includes(` ${needle} `)) return true
  const joined = joinProclitics(needle)
  return joined !== needle && haystack.includes(` ${joined} `)
}

export interface VerbatimFilterResult<T> {
  kept: T[]
  dropped: T[]
}

/**
 * Keep only the quotes whose text is a word-bounded span of the transcript.
 * Never silent: the caller gets the dropped list back to log and record.
 */
export function filterVerbatimQuotes<T extends { text?: unknown }>(
  quotes: T[],
  transcript: string,
): VerbatimFilterResult<T> {
  const haystack = buildVerbatimHaystack(transcript)
  const kept: T[] = []
  const dropped: T[] = []
  for (const q of quotes) {
    const text = typeof q?.text === "string" ? q.text : ""
    if (isVerbatimIn(text, haystack)) kept.push(q)
    else dropped.push(q)
  }
  return { kept, dropped }
}
