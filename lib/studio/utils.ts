/**
 * Transcript cleaning pipeline and utility functions.
 */

/**
 * Named HTML entities we decode. Kept small — YouTube/VTT captions use this
 * handful; numeric entities (&#NN; / &#xHH;) are handled generically below.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

/**
 * Decode HTML entities (named + numeric), resolving DOUBLE-encoding
 * (e.g. "&amp;gt;" → "&gt;" → ">"). YouTube captions frequently arrive
 * single- OR double-encoded, so we iterate until the string stops changing
 * (capped at 3 passes to avoid pathological loops). Restores parity with the
 * pre-refactor cleaner, which decoded entities before tag-stripping.
 */
function decodeHtmlEntities(input: string): string {
  let text = input
  for (let pass = 0; pass < 3; pass++) {
    const before = text
    text = text.replace(
      /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
      (match, body: string) => {
        if (body[0] === "#") {
          const code =
            body[1] === "x" || body[1] === "X"
              ? parseInt(body.slice(2), 16)
              : parseInt(body.slice(1), 10)
          if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
          try {
            return String.fromCodePoint(code)
          } catch {
            return match
          }
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? match
      },
    )
    if (text === before) break
  }
  return text
}

/**
 * Clean a raw transcript string: strip SRT/VTT formatting, normalize whitespace,
 * remove duplicate lines, but preserve Arabic text intact. HTML entities are
 * decoded first (including double-encoded ones), so "&amp;gt;" resolves to ">"
 * instead of leaking through as literal text.
 */
export function cleanTranscriptText(raw: string): string {
  // Decode entities before any stripping so entity-encoded VTT tags
  // (e.g. "&lt;c&gt;") normalize to real tags and get removed below.
  let text = decodeHtmlEntities(raw)

  // Strip VTT header + metadata
  text = text.replace(/^WEBVTT[\s\S]*?\n\n/i, "")
  text = text.replace(/^Kind:.*\n/gm, "")
  text = text.replace(/^Language:.*\n/gm, "")
  text = text.replace(/^NOTE[\s\S]*?\n\n/gm, "")

  // Strip SRT sequence numbers (standalone digits on their own line)
  text = text.replace(/^\d+\s*$/gm, "")

  // Strip SRT/VTT timestamps (e.g., 00:01:23,456 --> 00:01:26,789)
  text = text.replace(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}.*/g, "")
  // Also short-form timestamps (01:23.456 --> 01:26.789)
  text = text.replace(/\d{1,2}:\d{2}\.\d{3}\s*-->\s*\d{1,2}:\d{2}\.\d{3}.*/g, "")

  // Strip VTT inline tags like <c>, </c>, <00:01:23.456>, etc.
  text = text.replace(/<[^>]+>/g, "")

  // Strip noise markers like [music], [applause], (موسيقى), etc.
  text = text.replace(/\[.*?\]/g, "")
  text = text.replace(/\(.*?\)/g, "")

  // Normalize line breaks into spaces
  text = text.replace(/\r\n/g, "\n")
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

  // Deduplicate consecutive identical lines
  const deduped: string[] = []
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line)
    }
  }

  // Join and normalize whitespace
  return deduped.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * ص-١٠ — strip the summarizer's internal scaffold out of generated prose.
 *
 * `prepareTranscriptWithPositions` labels each chunk
 * `[الجزء 3/6 — تقريباً من الدقيقة 22 إلى الدقيقة 33]` so the model can
 * estimate positions. Those labels are plumbing, but the model echoed them
 * into its own prose — they turned up verbatim inside a website package
 * that then went out to the public page, alongside an apology about a part
 * it never received.
 *
 * Nothing user-facing should ever contain them. Applied on OUTPUT only:
 * the labels stay in the input, where they do a job.
 */
/** `N/M`, `N\M`, or the flat summarizer's `N من M`. */
const PART_NUMBERING = String.raw`الجزء\s*\d+\s*(?:[/\\]|من)\s*\d+`

/**
 * The minute range that PROVES a part reference is summarizer scaffold
 * rather than prose. Accepts `الى` without the hamza and a plain hyphen,
 * both of which the model emits.
 */
const MINUTE_CLAUSE =
  String.raw`\s*[—–-]\s*(?:تقريباً\s*)?من\s*الدقيقة\s*\d+` +
  String.raw`(?:\s*(?:إلى|الى)\s*(?:الدقيقة\s*)?\d+)?`

/**
 * All three patterns match the numbering and (at most) its minute clause
 * — never arbitrary text sitting inside the delimiters.
 *
 * This is the third time the same mistake had to be undone, so it is
 * worth naming: every earlier version let the pattern span whatever
 * happened to be between two delimiters, and each time that meant
 * DELETING REAL SENTENCES while claiming to clean markup.
 *   v1  `[^\]\n]*` ran to end-of-line on the bare form.
 *   v2  the same class excluded `]` but not `[`, so an unclosed bracket
 *       plus a later `]` swallowed everything between them.
 *   v3  the bare form was hardened to require the minute clause, but the
 *       parenthesised form was left wide open:
 *         `(الجزء 2 من 4 من السلسلة)` — ordinary Arabic prose — vanished.
 *
 * The rule now is positive, not exclusionary: the delimiters must contain
 * the scaffold and NOTHING else. Anything richer is somebody's sentence.
 */
const CHUNK_SCAFFOLD_BRACKETED = new RegExp(
  String.raw`\[\s*${PART_NUMBERING}(?:${MINUTE_CLAUSE})?\s*\]`,
  "g",
)

/** `لخّص هذا الجزء (الجزء 1 من 6) …` — the FLAT summarizer's form. */
const CHUNK_SCAFFOLD_PARENS = new RegExp(
  String.raw`\(\s*${PART_NUMBERING}(?:${MINUTE_CLAUSE})?\s*\)`,
  "g",
)

/**
 * Bare form: `الجزء 3/6 — من الدقيقة 72 إلى 108:`
 *
 * Here the minute clause is REQUIRED. A naked `الجزء 3/6` is ambiguous —
 * `الجزء 3/6 من الكتاب` is ordinary prose — and stripping it leaves a
 * mutilated sentence. Leaving a marker beats deleting words.
 */
const CHUNK_SCAFFOLD_BARE = new RegExp(
  String.raw`${PART_NUMBERING}${MINUTE_CLAUSE}\s*:?`,
  "g",
)

export function stripChunkScaffold(text: string): string
export function stripChunkScaffold(text: null | undefined): null
export function stripChunkScaffold(text: string | null | undefined): string | null
export function stripChunkScaffold(text: string | null | undefined): string | null {
  if (text == null) return null
  return text
    .replace(CHUNK_SCAFFOLD_BRACKETED, " ")
    .replace(CHUNK_SCAFFOLD_PARENS, " ")
    .replace(CHUNK_SCAFFOLD_BARE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,،؛!؟])/g, "$1")
    .trim()
}

export function countWords(text: string): number {
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Parse uploaded file content (SRT, VTT, or plain TXT) into raw text.
 */
export function parseUploadedTranscript(content: string, filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || ""

  if (ext === "srt" || ext === "vtt") {
    // For SRT/VTT, return as-is — cleaning pipeline handles the stripping
    return content
  }

  // For .txt or unknown, return as-is
  return content
}
