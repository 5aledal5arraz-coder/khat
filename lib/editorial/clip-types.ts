/**
 * UX-9 — Clip Intelligence document model.
 *
 * Stored in `studio_analysis_records.data` for `kind="clips"`.
 *
 * A `Clip` is not a "trimmed timestamp" — it is an editorial object
 * carrying the operator's intent (hook, scores, platform targets,
 * thumbnail copy) alongside the raw range. The reducer + validation
 * mirror the chapter editor pattern from UX-8 so both surfaces feel
 * identical to the operator.
 *
 * No DB schema migration required: the row is a free-form JSONB blob.
 */

export const CLIP_STATUSES = [
  "draft",
  "reviewed",
  "approved",
  "exported",
] as const
export type ClipStatus = (typeof CLIP_STATUSES)[number]

export const CLIP_SOURCES = [
  "manual",
  "ai_generated",
  "chapter_based",
  "viral_detection",
  "transcript_anchor",
] as const
export type ClipSource = (typeof CLIP_SOURCES)[number]

export const CLIP_MARKS = [
  "normal",
  "priority",
  "must_publish",
  "archive",
] as const
export type ClipMark = (typeof CLIP_MARKS)[number]

export const CLIP_PLATFORMS = [
  "youtube_shorts",
  "tiktok",
  "instagram_reels",
  "twitter",
  "linkedin",
  "newsletter",
] as const
export type ClipPlatform = (typeof CLIP_PLATFORMS)[number]

export const CLIP_RATIOS = ["9:16", "1:1", "16:9"] as const
export type ClipRatio = (typeof CLIP_RATIOS)[number]

export const CLIP_AUDIENCES = [
  "general",
  "intellectuals",
  "youth",
  "professionals",
  "discoverers",
] as const
export type ClipAudience = (typeof CLIP_AUDIENCES)[number]

/**
 * Clip — editorial intelligence object. Every score is 0..100, where
 * higher = stronger editorial signal (the visual layer surfaces clips
 * with score >= 70 as priority).
 */
export interface Clip {
  id: string
  /** Headline — what this clip is about, in 5–10 words. */
  title: string
  /** The line that hooks a viewer in the first 2 seconds. */
  hook: string
  /** Optional 1–2 sentence summary of the clip's content. */
  summary: string | null
  /** Range in transcript / audio. */
  start_seconds: number
  end_seconds: number
  /** Soft anchors — survives transcript split/merge via reducer. */
  transcript_segment_ids: string[]
  /** Soft anchors — chapters this clip overlaps with. */
  chapter_ids: string[]
  status: ClipStatus
  source: ClipSource
  mark: ClipMark
  platform_targets: ClipPlatform[]
  /** All scores are 0..100. Operator can override AI estimates. */
  emotional_score: number
  viral_score: number
  hook_score: number
  controversy_score: number
  depth_score: number
  audience_type: ClipAudience
  recommended_ratio: ClipRatio
  caption_suggestion: string | null
  thumbnail_text: string | null
  hashtags: string[]
  editor_notes: string | null
  /** Free-form notes for the export operator (cuts, color, etc.). */
  export_notes: string | null
  /** AI confidence 0..1 for AI-sourced clips; null otherwise. */
  confidence: number | null
}

export interface ClipDocument {
  schema_version: 1
  version: number
  language: string
  source_transcript_record_id: string | null
  source_transcript_version: number | null
  total_duration_seconds: number | null
  clips: Clip[]
  last_edited_by: string | null
  last_edited_at: string | null
}

export function emptyClipDocument(language = "ar"): ClipDocument {
  return {
    schema_version: 1,
    version: 0,
    language,
    source_transcript_record_id: null,
    source_transcript_version: null,
    total_duration_seconds: null,
    clips: [],
    last_edited_by: null,
    last_edited_at: null,
  }
}

export function newClip(partial: Partial<Clip> = {}): Clip {
  return {
    id:
      partial.id ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `cl-${Math.random().toString(36).slice(2, 11)}`),
    title: partial.title ?? "",
    hook: partial.hook ?? "",
    summary: partial.summary ?? null,
    start_seconds: partial.start_seconds ?? 0,
    end_seconds: partial.end_seconds ?? (partial.start_seconds ?? 0) + 30,
    transcript_segment_ids: partial.transcript_segment_ids ?? [],
    chapter_ids: partial.chapter_ids ?? [],
    status: partial.status ?? "draft",
    source: partial.source ?? "manual",
    mark: partial.mark ?? "normal",
    platform_targets: partial.platform_targets ?? [],
    emotional_score: clamp01x100(partial.emotional_score ?? 50),
    viral_score: clamp01x100(partial.viral_score ?? 50),
    hook_score: clamp01x100(partial.hook_score ?? 50),
    controversy_score: clamp01x100(partial.controversy_score ?? 30),
    depth_score: clamp01x100(partial.depth_score ?? 50),
    audience_type: partial.audience_type ?? "general",
    recommended_ratio: partial.recommended_ratio ?? "9:16",
    caption_suggestion: partial.caption_suggestion ?? null,
    thumbnail_text: partial.thumbnail_text ?? null,
    hashtags: partial.hashtags ?? [],
    editor_notes: partial.editor_notes ?? null,
    export_notes: partial.export_notes ?? null,
    confidence: partial.confidence ?? null,
  }
}

function clamp01x100(n: number): number {
  if (!Number.isFinite(n)) return 50
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Composite "editorial weight" used by the UI to surface priority
 * clips. Weighting is intentional: hook + emotional carry the most
 * weight, depth/viral less, controversy least (we want intelligent
 * controversy, not bait). Operators can still mark clips as
 * `priority` / `must_publish` to override the score.
 */
export function clipEditorialWeight(c: Clip): number {
  return Math.round(
    c.hook_score * 0.32 +
      c.emotional_score * 0.28 +
      c.depth_score * 0.18 +
      c.viral_score * 0.14 +
      c.controversy_score * 0.08,
  )
}

// ─── Reducer ─────────────────────────────────────────────────────────

export type ClipAction =
  | { type: "create"; clip: Clip }
  | { type: "update"; id: string; patch: Partial<Clip> }
  | { type: "delete"; id: string }
  | { type: "bulk_replace"; clips: Clip[] }

export function clipReducer(
  state: ClipDocument,
  action: ClipAction,
): ClipDocument {
  switch (action.type) {
    case "create": {
      const list = [...state.clips, action.clip].sort(
        (a, b) => a.start_seconds - b.start_seconds,
      )
      return { ...state, clips: list }
    }
    case "update": {
      const list = state.clips
        .map((c) => (c.id === action.id ? { ...c, ...action.patch } : c))
        .sort((a, b) => a.start_seconds - b.start_seconds)
      return { ...state, clips: list }
    }
    case "delete": {
      return { ...state, clips: state.clips.filter((c) => c.id !== action.id) }
    }
    case "bulk_replace": {
      return {
        ...state,
        clips: [...action.clips].sort(
          (a, b) => a.start_seconds - b.start_seconds,
        ),
      }
    }
  }
}

// ─── Diff ─────────────────────────────────────────────────────────────

export interface ClipChange {
  kind: "added" | "removed" | "modified"
  clip_id: string
  before: Clip | null
  after: Clip | null
  fields: string[]
}

export function diffClips(
  prev: ClipDocument,
  next: ClipDocument,
): ClipChange[] {
  const out: ClipChange[] = []
  const prevById = new Map(prev.clips.map((c) => [c.id, c]))
  const nextById = new Map(next.clips.map((c) => [c.id, c]))
  for (const c of prev.clips) {
    if (!nextById.has(c.id)) {
      out.push({
        kind: "removed",
        clip_id: c.id,
        before: c,
        after: null,
        fields: [],
      })
    }
  }
  for (const c of next.clips) {
    const before = prevById.get(c.id)
    if (!before) {
      out.push({
        kind: "added",
        clip_id: c.id,
        before: null,
        after: c,
        fields: [],
      })
      continue
    }
    const fields: string[] = []
    if (before.title !== c.title) fields.push("title")
    if (before.hook !== c.hook) fields.push("hook")
    if (before.summary !== c.summary) fields.push("summary")
    if (before.start_seconds !== c.start_seconds) fields.push("start_seconds")
    if (before.end_seconds !== c.end_seconds) fields.push("end_seconds")
    if (before.status !== c.status) fields.push("status")
    if (before.source !== c.source) fields.push("source")
    if (before.mark !== c.mark) fields.push("mark")
    if (before.recommended_ratio !== c.recommended_ratio)
      fields.push("recommended_ratio")
    if (before.audience_type !== c.audience_type) fields.push("audience_type")
    if (before.emotional_score !== c.emotional_score)
      fields.push("emotional_score")
    if (before.viral_score !== c.viral_score) fields.push("viral_score")
    if (before.hook_score !== c.hook_score) fields.push("hook_score")
    if (before.controversy_score !== c.controversy_score)
      fields.push("controversy_score")
    if (before.depth_score !== c.depth_score) fields.push("depth_score")
    if (before.caption_suggestion !== c.caption_suggestion)
      fields.push("caption_suggestion")
    if (before.thumbnail_text !== c.thumbnail_text) fields.push("thumbnail_text")
    if (before.editor_notes !== c.editor_notes) fields.push("editor_notes")
    if (before.export_notes !== c.export_notes) fields.push("export_notes")
    if (
      before.platform_targets.length !== c.platform_targets.length ||
      before.platform_targets.some((p, i) => p !== c.platform_targets[i])
    )
      fields.push("platform_targets")
    if (
      before.hashtags.length !== c.hashtags.length ||
      before.hashtags.some((h, i) => h !== c.hashtags[i])
    )
      fields.push("hashtags")
    if (
      before.transcript_segment_ids.length !== c.transcript_segment_ids.length ||
      before.transcript_segment_ids.some(
        (s, i) => s !== c.transcript_segment_ids[i],
      )
    )
      fields.push("transcript_segment_ids")
    if (
      before.chapter_ids.length !== c.chapter_ids.length ||
      before.chapter_ids.some((s, i) => s !== c.chapter_ids[i])
    )
      fields.push("chapter_ids")
    if (fields.length > 0) {
      out.push({ kind: "modified", clip_id: c.id, before, after: c, fields })
    }
  }
  return out
}

// ─── Coercion ────────────────────────────────────────────────────────

export function coerceClipDocument(
  raw: Record<string, unknown> | null | undefined,
): ClipDocument {
  if (!raw || typeof raw !== "object") return emptyClipDocument()
  const arr = Array.isArray((raw as { clips?: unknown }).clips)
    ? ((raw as { clips: unknown[] }).clips as unknown[])
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
  const clips = arr
    .map((c, i) => coerceClip(c, i))
    .filter((c): c is Clip => c !== null)
    .sort((a, b) => a.start_seconds - b.start_seconds)
  return {
    schema_version: 1,
    version,
    language: lang,
    source_transcript_record_id: stRecord,
    source_transcript_version: stVer,
    total_duration_seconds: total,
    clips,
    last_edited_by,
    last_edited_at,
  }
}

function coerceClip(c: unknown, idx: number): Clip | null {
  if (!c || typeof c !== "object") return null
  const o = c as Record<string, unknown>
  const start =
    typeof o.start_seconds === "number" && Number.isFinite(o.start_seconds)
      ? Math.max(0, o.start_seconds)
      : null
  if (start === null) return null
  const end =
    typeof o.end_seconds === "number" && Number.isFinite(o.end_seconds)
      ? Math.max(start + 1, o.end_seconds)
      : start + 30
  const status: ClipStatus = (CLIP_STATUSES as readonly string[]).includes(
    o.status as string,
  )
    ? (o.status as ClipStatus)
    : "draft"
  const source: ClipSource = (CLIP_SOURCES as readonly string[]).includes(
    o.source as string,
  )
    ? (o.source as ClipSource)
    : "manual"
  const mark: ClipMark = (CLIP_MARKS as readonly string[]).includes(
    o.mark as string,
  )
    ? (o.mark as ClipMark)
    : "normal"
  const ratio: ClipRatio = (CLIP_RATIOS as readonly string[]).includes(
    o.recommended_ratio as string,
  )
    ? (o.recommended_ratio as ClipRatio)
    : "9:16"
  const audience: ClipAudience = (CLIP_AUDIENCES as readonly string[]).includes(
    o.audience_type as string,
  )
    ? (o.audience_type as ClipAudience)
    : "general"
  const platforms = Array.isArray(o.platform_targets)
    ? (o.platform_targets as unknown[])
        .filter((p): p is ClipPlatform =>
          (CLIP_PLATFORMS as readonly string[]).includes(p as string),
        )
        .filter((v, i, a) => a.indexOf(v) === i)
    : []
  const tagsRaw = Array.isArray(o.hashtags)
    ? (o.hashtags as unknown[]).filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      )
    : []
  const segIds = Array.isArray(o.transcript_segment_ids)
    ? (o.transcript_segment_ids as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : []
  const chapIds = Array.isArray(o.chapter_ids)
    ? (o.chapter_ids as unknown[]).filter((s): s is string => typeof s === "string")
    : []
  return {
    id: typeof o.id === "string" && o.id ? o.id : `cl-${idx}`,
    title: typeof o.title === "string" ? o.title : "",
    hook: typeof o.hook === "string" ? o.hook : "",
    summary: typeof o.summary === "string" ? o.summary : null,
    start_seconds: start,
    end_seconds: end,
    transcript_segment_ids: segIds,
    chapter_ids: chapIds,
    status,
    source,
    mark,
    platform_targets: platforms,
    emotional_score: clamp01x100(Number(o.emotional_score ?? 50)),
    viral_score: clamp01x100(Number(o.viral_score ?? 50)),
    hook_score: clamp01x100(Number(o.hook_score ?? 50)),
    controversy_score: clamp01x100(Number(o.controversy_score ?? 30)),
    depth_score: clamp01x100(Number(o.depth_score ?? 50)),
    audience_type: audience,
    recommended_ratio: ratio,
    caption_suggestion:
      typeof o.caption_suggestion === "string" ? o.caption_suggestion : null,
    thumbnail_text:
      typeof o.thumbnail_text === "string" ? o.thumbnail_text : null,
    hashtags: tagsRaw,
    editor_notes: typeof o.editor_notes === "string" ? o.editor_notes : null,
    export_notes: typeof o.export_notes === "string" ? o.export_notes : null,
    confidence:
      typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
        ? o.confidence
        : null,
  }
}
