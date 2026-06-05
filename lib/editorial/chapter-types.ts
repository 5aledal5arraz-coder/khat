/**
 * UX-7 Phase C — Chapter document foundation.
 *
 * Types + reducer + diff helpers. NO UI. The chapter editor in UX-8
 * will mount a React reducer over `chapterReducer` and use this
 * module as its single source of truth.
 *
 * Stored in `studio_analysis_records.data` for `kind="chapters"`.
 *
 * Anchoring: a chapter's `transcript_segment_id` (optional) ties it
 * to a transcript segment so chapter starts can follow split/merge
 * operations in the transcript editor without going stale. The
 * timeline-only `start_seconds` field is the canonical timestamp;
 * the segment id is a soft link.
 */

export const CHAPTER_STATUSES = ["draft", "reviewed", "approved"] as const
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

export const CHAPTER_SOURCES = [
  "manual",
  "ai_generated",
  "imported",
  "transcript_anchor",
] as const
export type ChapterSource = (typeof CHAPTER_SOURCES)[number]

export interface Chapter {
  /** Stable id; survives reorders. */
  id: string
  title: string
  /** UX-8 — long-form summary shown in published views. Distinct from
   *  the legacy `subtitle` (single-line). */
  summary: string | null
  /** Optional sub-title shown under the title in published views. */
  subtitle: string | null
  /** Start time in seconds; required for any chapter that ships. */
  start_seconds: number
  /** End time in seconds; null until the next chapter starts (open). */
  end_seconds: number | null
  /** Optional anchor to a transcript segment id — tells the editor to
   *  follow split/merge operations in the transcript document. */
  transcript_segment_id: string | null
  /** Editorial mark for filtering: `featured`, `chapter_of_focus`. */
  mark: "default" | "featured" | "skip" | "promo"
  /** UX-8 — chapter status (workflow gate). Editor blocks publishing
   *  until every approved chapter passes validation. */
  status: ChapterStatus
  /** UX-8 — provenance. Used in the operator UI to flag AI-generated
   *  chapters as "needs review" by default. */
  source: ChapterSource
  /** Confidence score 0..1, from AI source. Null otherwise. */
  confidence: number | null
  /** Free-text editor notes. Not shown to viewers. */
  notes: string | null
}

export interface ChapterDocument {
  schema_version: 2
  version: number
  chapters: Chapter[]
  language: string
  /** UX-8 — total episode duration if known (from transcript end-time
   *  or studio session metadata). Used for timeline scaling and gap
   *  validation. */
  total_duration_seconds: number | null
  /** UX-8 — id of the transcript record this chapter set anchored
   *  against. Operators can detect when chapters were authored against
   *  an older transcript version. */
  source_transcript_record_id: string | null
  source_transcript_version: number | null
  last_edited_by: string | null
  last_edited_at: string | null
}

export function emptyChapterDocument(language = "ar"): ChapterDocument {
  return {
    schema_version: 2,
    version: 0,
    chapters: [],
    language,
    total_duration_seconds: null,
    source_transcript_record_id: null,
    source_transcript_version: null,
    last_edited_by: null,
    last_edited_at: null,
  }
}

export function newChapter(partial: Partial<Chapter> = {}): Chapter {
  return {
    id:
      partial.id ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ch-${Math.random().toString(36).slice(2, 11)}`),
    title: partial.title ?? "",
    summary: partial.summary ?? null,
    subtitle: partial.subtitle ?? null,
    start_seconds: partial.start_seconds ?? 0,
    end_seconds: partial.end_seconds ?? null,
    transcript_segment_id: partial.transcript_segment_id ?? null,
    mark: partial.mark ?? "default",
    status: partial.status ?? "draft",
    source: partial.source ?? "manual",
    confidence: partial.confidence ?? null,
    notes: partial.notes ?? null,
  }
}

/**
 * UX-8 — coerce arbitrary `data` payload into a ChapterDocument.
 * Read-side defensive normalization: `studio_analysis_records.data`
 * may have been written by an older schema version or by the legacy
 * Studio writer with a different shape. We never throw — fall back
 * to an empty doc so the editor always opens.
 */
export function coerceChapterDocument(
  raw: Record<string, unknown> | null | undefined,
): ChapterDocument {
  if (!raw || typeof raw !== "object") return emptyChapterDocument()
  const arr = Array.isArray((raw as { chapters?: unknown }).chapters)
    ? ((raw as { chapters: unknown[] }).chapters as unknown[])
    : []
  const lang = typeof raw.language === "string" ? raw.language : "ar"
  const version = typeof raw.version === "number" ? raw.version : 0
  const total =
    typeof raw.total_duration_seconds === "number"
      ? raw.total_duration_seconds
      : null
  const stRecord =
    typeof raw.source_transcript_record_id === "string"
      ? raw.source_transcript_record_id
      : null
  const stVer =
    typeof raw.source_transcript_version === "number"
      ? raw.source_transcript_version
      : null
  const last_edited_at =
    typeof raw.last_edited_at === "string" ? raw.last_edited_at : null
  const last_edited_by =
    typeof raw.last_edited_by === "string" ? raw.last_edited_by : null
  const chapters = arr
    .map((c, i) => coerceChapter(c, i))
    .filter((c): c is Chapter => c !== null)
    .sort((a, b) => a.start_seconds - b.start_seconds)
  return {
    schema_version: 2,
    version,
    chapters,
    language: lang,
    total_duration_seconds: total,
    source_transcript_record_id: stRecord,
    source_transcript_version: stVer,
    last_edited_by,
    last_edited_at,
  }
}

function coerceChapter(c: unknown, idx: number): Chapter | null {
  if (!c || typeof c !== "object") return null
  const o = c as Record<string, unknown>
  const start =
    typeof o.start_seconds === "number" && Number.isFinite(o.start_seconds)
      ? Math.max(0, o.start_seconds)
      : null
  if (start === null) return null
  const id = typeof o.id === "string" && o.id ? o.id : `ch-${idx}`
  const title = typeof o.title === "string" ? o.title : ""
  const summary = typeof o.summary === "string" ? o.summary : null
  const subtitle = typeof o.subtitle === "string" ? o.subtitle : null
  const end =
    typeof o.end_seconds === "number" && Number.isFinite(o.end_seconds)
      ? o.end_seconds
      : null
  const status: ChapterStatus = CHAPTER_STATUSES.includes(o.status as ChapterStatus)
    ? (o.status as ChapterStatus)
    : "draft"
  const source: ChapterSource = CHAPTER_SOURCES.includes(o.source as ChapterSource)
    ? (o.source as ChapterSource)
    : "manual"
  const confidence =
    typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
      ? o.confidence
      : null
  const transcript_segment_id =
    typeof o.transcript_segment_id === "string" ? o.transcript_segment_id : null
  const mark: Chapter["mark"] = (
    ["default", "featured", "skip", "promo"] as const
  ).includes(o.mark as Chapter["mark"])
    ? (o.mark as Chapter["mark"])
    : "default"
  const notes = typeof o.notes === "string" ? o.notes : null
  return {
    id,
    title,
    summary,
    subtitle,
    start_seconds: start,
    end_seconds: end,
    transcript_segment_id,
    mark,
    status,
    source,
    confidence,
    notes,
  }
}

// ─── Reducer actions ─────────────────────────────────────────────────

export type ChapterAction =
  | { type: "create"; chapter: Chapter }
  | { type: "update"; id: string; patch: Partial<Chapter> }
  | { type: "delete"; id: string }
  | { type: "reorder"; ids: string[] }
  | { type: "bulk_replace"; chapters: Chapter[] }

export function chapterReducer(
  state: ChapterDocument,
  action: ChapterAction,
): ChapterDocument {
  switch (action.type) {
    case "create": {
      const list = [...state.chapters, action.chapter].sort(
        (a, b) => a.start_seconds - b.start_seconds,
      )
      return { ...state, chapters: recomputeEnds(list) }
    }
    case "update": {
      const list = state.chapters
        .map((c) => (c.id === action.id ? { ...c, ...action.patch } : c))
        .sort((a, b) => a.start_seconds - b.start_seconds)
      return { ...state, chapters: recomputeEnds(list) }
    }
    case "delete": {
      const list = state.chapters.filter((c) => c.id !== action.id)
      return { ...state, chapters: recomputeEnds(list) }
    }
    case "reorder": {
      const map = new Map(state.chapters.map((c) => [c.id, c]))
      const list = action.ids
        .map((id) => map.get(id))
        .filter((c): c is Chapter => c !== undefined)
      return { ...state, chapters: recomputeEnds(list) }
    }
    case "bulk_replace": {
      const list = [...action.chapters].sort(
        (a, b) => a.start_seconds - b.start_seconds,
      )
      return { ...state, chapters: recomputeEnds(list) }
    }
  }
}

/**
 * Recompute `end_seconds` for chapters based on the next chapter's
 * `start_seconds`. The last chapter's end stays whatever the editor
 * supplied (null = open / runs to end of transcript).
 */
function recomputeEnds(list: Chapter[]): Chapter[] {
  return list.map((c, i) => {
    if (i === list.length - 1) return c // open end
    const nextStart = list[i + 1].start_seconds
    if (c.end_seconds === null || c.end_seconds > nextStart) {
      return { ...c, end_seconds: nextStart }
    }
    return c
  })
}

// ─── Diff helpers ────────────────────────────────────────────────────

export interface ChapterChange {
  kind: "added" | "removed" | "modified"
  chapter_id: string
  before: Chapter | null
  after: Chapter | null
  fields: string[]
}

export function diffChapters(
  prev: ChapterDocument,
  next: ChapterDocument,
): ChapterChange[] {
  const out: ChapterChange[] = []
  const prevById = new Map(prev.chapters.map((c) => [c.id, c]))
  const nextById = new Map(next.chapters.map((c) => [c.id, c]))
  for (const c of prev.chapters) {
    if (!nextById.has(c.id)) {
      out.push({ kind: "removed", chapter_id: c.id, before: c, after: null, fields: [] })
    }
  }
  for (const c of next.chapters) {
    const before = prevById.get(c.id)
    if (!before) {
      out.push({ kind: "added", chapter_id: c.id, before: null, after: c, fields: [] })
      continue
    }
    const fields: string[] = []
    if (before.title !== c.title) fields.push("title")
    if (before.summary !== c.summary) fields.push("summary")
    if (before.subtitle !== c.subtitle) fields.push("subtitle")
    if (before.start_seconds !== c.start_seconds) fields.push("start_seconds")
    if (before.end_seconds !== c.end_seconds) fields.push("end_seconds")
    if (before.mark !== c.mark) fields.push("mark")
    if (before.status !== c.status) fields.push("status")
    if (before.source !== c.source) fields.push("source")
    if (before.confidence !== c.confidence) fields.push("confidence")
    if (before.notes !== c.notes) fields.push("notes")
    if (before.transcript_segment_id !== c.transcript_segment_id)
      fields.push("transcript_segment_id")
    if (fields.length > 0) {
      out.push({ kind: "modified", chapter_id: c.id, before, after: c, fields })
    }
  }
  return out
}

// ─── Anchor sync (used by transcript editor → chapter editor bridge) ─

export interface TranscriptAnchorEvent {
  /** Original segment id before the operation. */
  segment_id: string
  /** "split" produces two ids; "merged" leaves the surviving id. */
  kind: "split" | "merged" | "deleted"
  /** For split: the new sibling segment id. */
  new_segment_id?: string
}

/**
 * Apply a transcript-side anchor change to a chapter document. The
 * chapter editor subscribes to the transcript editor's mutations
 * (UX-8 will wire this up); this helper keeps the chapter list
 * consistent without needing transcript ↔ chapter editor coupling.
 */
export function applyAnchorEvent(
  doc: ChapterDocument,
  ev: TranscriptAnchorEvent,
): ChapterDocument {
  const next = doc.chapters.map((c) => {
    if (c.transcript_segment_id !== ev.segment_id) return c
    if (ev.kind === "deleted") {
      return { ...c, transcript_segment_id: null }
    }
    if (ev.kind === "split" && ev.new_segment_id) {
      // Anchor stays on the first half (the original id is preserved
      // by the transcript reducer's split semantics).
      return c
    }
    if (ev.kind === "merged") {
      return c
    }
    return c
  })
  return { ...doc, chapters: next }
}

// ─── Selection model ─────────────────────────────────────────────────

export interface ChapterSelection {
  /** Chapter id currently focused (single-selection model). */
  focusedId: string | null
  /** Multi-select set for bulk operations. */
  selectedIds: Set<string>
}

export const EMPTY_CHAPTER_SELECTION: ChapterSelection = {
  focusedId: null,
  selectedIds: new Set(),
}
