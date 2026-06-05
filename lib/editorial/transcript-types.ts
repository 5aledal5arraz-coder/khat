/**
 * UX-7 Phase A — Workspace transcript document shape.
 *
 * Stored in `studio_analysis_records.data` for `kind="transcript"`.
 * The legacy `studio_transcripts` table uses a flat `transcript_clean`
 * string + summary blob; this workspace shape is segment-oriented for
 * speaker-aware editing, search, range marks, and chapter anchoring.
 *
 * Backward compatibility: when only the legacy flat string exists,
 * the workspace loader synthesizes a single-segment document and the
 * editor can split paragraphs to upgrade it to the new shape.
 */

import { randomUUID } from "node:crypto"

export interface TranscriptSegment {
  /** Stable id; survives reorders. */
  id: string
  /** Speaker label or null if unattributed. */
  speaker: string | null
  /** Body text (plain). Newlines preserved. */
  text: string
  /** Start time in seconds. Null for legacy paste-only transcripts. */
  start_seconds: number | null
  /** End time in seconds. Null for legacy. */
  end_seconds: number | null
  /** Optional editorial mark (highlight, quote, cut, etc.). */
  mark: TranscriptMark | null
}

export const TRANSCRIPT_MARKS = [
  "highlight",
  "quote",
  "cut",
  "redo",
  "chapter_start",
] as const
export type TranscriptMark = (typeof TRANSCRIPT_MARKS)[number]

export const TRANSCRIPT_SOURCES = [
  "youtube_captions",
  "upload",
  "whisper",
  "paste",
  "manual",
] as const
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number]

export interface TranscriptDocument {
  /** Schema version of the document shape itself. Bump when the
   *  segment shape changes. Distinct from `version` (edit version). */
  schema_version: 1
  /** Monotonic per-edit version stamp. Used by conflict manager. */
  version: number
  source: TranscriptSource
  language: string
  segments: TranscriptSegment[]
  word_count: number
  char_count: number
  last_edited_by: string | null
  last_edited_at: string | null
}

export function emptyTranscriptDocument(language = "ar"): TranscriptDocument {
  return {
    schema_version: 1,
    version: 0,
    source: "manual",
    language,
    segments: [],
    word_count: 0,
    char_count: 0,
    last_edited_by: null,
    last_edited_at: null,
  }
}

export function newSegment(
  partial: Partial<TranscriptSegment> = {},
): TranscriptSegment {
  return {
    id: partial.id ?? (typeof randomUUID === "function" ? randomUUID() : `seg-${Math.random().toString(36).slice(2, 11)}`),
    speaker: partial.speaker ?? null,
    text: partial.text ?? "",
    start_seconds: partial.start_seconds ?? null,
    end_seconds: partial.end_seconds ?? null,
    mark: partial.mark ?? null,
  }
}

/**
 * Counts words/chars across all segments. Used when persisting so the
 * row reflects the truth of `data.segments` not a stale value.
 */
export function recomputeCounts(
  doc: TranscriptDocument,
): { word_count: number; char_count: number } {
  let words = 0
  let chars = 0
  for (const s of doc.segments) {
    chars += s.text.length
    // Whitespace-tokenizing — adequate for both Arabic and Latin.
    const tokens = s.text.trim().split(/\s+/).filter(Boolean)
    words += tokens.length
  }
  return { word_count: words, char_count: chars }
}

/**
 * Coerce an arbitrary `data` payload into a TranscriptDocument. Used
 * when reading from the consolidated table — the row may have been
 * written by a prior session in any shape, including a flat
 * `{ text: "..." }` blob. We never throw; we return a best-effort
 * document so the editor always opens.
 */
export function coerceTranscriptDocument(
  raw: Record<string, unknown> | null | undefined,
): TranscriptDocument {
  if (!raw || typeof raw !== "object") return emptyTranscriptDocument()
  // Already in the new shape?
  if (Array.isArray((raw as { segments?: unknown }).segments)) {
    const segs = (raw as { segments: unknown[] }).segments
      .map((s, i) => coerceSegment(s, i))
      .filter((s): s is TranscriptSegment => s !== null)
    const lang = typeof raw.language === "string" ? raw.language : "ar"
    const source = TRANSCRIPT_SOURCES.includes(raw.source as TranscriptSource)
      ? (raw.source as TranscriptSource)
      : "manual"
    const version = typeof raw.version === "number" ? raw.version : 0
    const last_edited_at =
      typeof raw.last_edited_at === "string" ? raw.last_edited_at : null
    const last_edited_by =
      typeof raw.last_edited_by === "string" ? raw.last_edited_by : null
    const counts = recomputeCounts({
      schema_version: 1,
      version,
      source,
      language: lang,
      segments: segs,
      word_count: 0,
      char_count: 0,
      last_edited_by,
      last_edited_at,
    })
    return {
      schema_version: 1,
      version,
      source,
      language: lang,
      segments: segs,
      ...counts,
      last_edited_by,
      last_edited_at,
    }
  }
  // Flat-string fallback (legacy transcripts).
  const flat =
    typeof raw.transcript_clean === "string"
      ? raw.transcript_clean
      : typeof raw.text === "string"
        ? raw.text
        : ""
  const lang = typeof raw.language === "string" ? raw.language : "ar"
  const source = TRANSCRIPT_SOURCES.includes(raw.source as TranscriptSource)
    ? (raw.source as TranscriptSource)
    : "paste"
  if (!flat.trim()) return emptyTranscriptDocument(lang)
  // Split on blank lines so very long pastes become navigable.
  const blocks = flat.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const segments = (blocks.length > 0 ? blocks : [flat]).map((b) =>
    newSegment({ text: b }),
  )
  const counts = recomputeCounts({
    schema_version: 1,
    version: 0,
    source,
    language: lang,
    segments,
    word_count: 0,
    char_count: 0,
    last_edited_by: null,
    last_edited_at: null,
  })
  return {
    schema_version: 1,
    version: 0,
    source,
    language: lang,
    segments,
    ...counts,
    last_edited_by: null,
    last_edited_at: null,
  }
}

function coerceSegment(s: unknown, idx: number): TranscriptSegment | null {
  if (!s || typeof s !== "object") return null
  const o = s as Record<string, unknown>
  const text = typeof o.text === "string" ? o.text : null
  if (text === null) return null
  const id = typeof o.id === "string" && o.id ? o.id : `seg-${idx}`
  const speaker = typeof o.speaker === "string" ? o.speaker : null
  const start_seconds = typeof o.start_seconds === "number" ? o.start_seconds : null
  const end_seconds = typeof o.end_seconds === "number" ? o.end_seconds : null
  const mark = TRANSCRIPT_MARKS.includes(o.mark as TranscriptMark)
    ? (o.mark as TranscriptMark)
    : null
  return { id, speaker, text, start_seconds, end_seconds, mark }
}
