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
const CHUNK_SCAFFOLD_RE = /\[?\s*الجزء\s*\d+\s*[/\\]\s*\d+[^\]\n]*\]?/g

export function stripChunkScaffold(text: string): string
export function stripChunkScaffold(text: null | undefined): null
export function stripChunkScaffold(text: string | null | undefined): string | null
export function stripChunkScaffold(text: string | null | undefined): string | null {
  if (text == null) return null
  return text
    .replace(CHUNK_SCAFFOLD_RE, " ")
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
