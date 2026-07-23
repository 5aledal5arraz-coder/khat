/**
 * Studio transcripts — persistence routed through studio_analysis_records
 * (Khat Brain Phase 5). Public API shape preserved; the consolidated
 * table is the source of truth.
 */

import { cleanTranscriptText, countWords } from "./utils"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"
import type { TimedSegment } from "@/lib/studio/segments"
import type { EpisodeMap } from "@/lib/ai/episode-map"
import type { EpisodeReview } from "@/lib/studio/episode-review"
import type {
  StudioTranscript,
  StudioTranscriptSource,
  StudioTranscriptProcessingStatus,
  StudioTranscriptStatus,
  StudioTranscriptSummary,
  StudioTranscriptQuote,
} from "@/types/database"

interface TranscriptData {
  source?: StudioTranscriptSource | null
  language?: string | null
  transcript_raw?: string | null
  transcript_clean?: string | null
  transcript_article?: string | null
  word_count?: number | null
  char_count?: number | null
  summary?: StudioTranscriptSummary | null
  quotes_extracted?: StudioTranscriptQuote[] | null
  processing_status?: StudioTranscriptProcessingStatus | null
  // Studio Wave 2 (raw-audio time map). Both live in the transcript record's
  // `data` JSONB — no new kind, no migration (rashid). Segments are the
  // whisper-timed anchors the episode-map generator reads; episode_map is the
  // validated map with REAL seconds.
  timed_segments?: TimedSegment[] | null
  timed_segments_duration_seconds?: number | null
  episode_map?: EpisodeMap | null
}

function mapToLegacyShape(r: StudioAnalysisRecord): StudioTranscript {
  const data = (r.data ?? {}) as TranscriptData
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    source: (data.source ?? "youtube_captions") as StudioTranscriptSource,
    language: data.language ?? "ar",
    transcript_raw: data.transcript_raw ?? "",
    transcript_clean: data.transcript_clean ?? "",
    transcript_article: data.transcript_article ?? null,
    word_count: data.word_count ?? 0,
    char_count: data.char_count ?? 0,
    status: r.status as StudioTranscriptStatus,
    error_message: r.error,
    summary: data.summary ?? null,
    quotes_extracted: data.quotes_extracted ?? null,
    processing_status: (data.processing_status ?? "idle") as StudioTranscriptProcessingStatus,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioTranscript
}

export async function getTranscriptForSession(sessionId: string): Promise<StudioTranscript | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "transcript")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching transcript:", err)
    return null
  }
}

export async function createTranscript(
  sessionId: string,
  source: StudioTranscriptSource,
  rawText: string,
  language: string = "ar",
): Promise<{ success: boolean; data?: StudioTranscript; error?: string }> {
  const cleanText = cleanTranscriptText(rawText)
  const wordCount = countWords(cleanText)
  const charCount = cleanText.length
  const isUsable = cleanText.trim().length >= 10

  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const data: TranscriptData = {
      source,
      language,
      transcript_raw: rawText,
      transcript_clean: cleanText,
      transcript_article: null,
      word_count: wordCount,
      char_count: charCount,
      summary: null,
      quotes_extracted: null,
      processing_status: "idle",
    }
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "transcript",
      status: isUsable ? "ready" : "error",
      data: data as Record<string, unknown>,
      error: isUsable ? null : "النص المستخرج فارغ أو قصير جداً بعد التنظيف",
      generated_at: new Date(),
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function createTranscriptError(
  sessionId: string,
  errorMessage: string,
): Promise<void> {
  const eirId = await resolveEirIdForSession(sessionId)
  await upsertStudioAnalysisRecord({
    studio_session_id: sessionId,
    eir_id: eirId,
    kind: "transcript",
    status: "error",
    data: {
      source: "youtube_captions",
      language: "ar",
      transcript_raw: "",
      transcript_clean: "",
      transcript_article: null,
      word_count: 0,
      char_count: 0,
      summary: null,
      quotes_extracted: null,
      processing_status: "idle",
    },
    error: errorMessage,
  })
}

export async function updateTranscriptProcessing(
  transcriptId: string,
  updates: {
    transcript_article?: string | null
    summary?: StudioTranscriptSummary | null
    quotes_extracted?: StudioTranscriptQuote[] | null
    processing_status?: StudioTranscriptProcessingStatus
  },
): Promise<{ success: boolean; data?: StudioTranscript; error?: string }> {
  try {
    const { db } = await import("@/lib/db")
    const { studioAnalysisRecords } = await import("@/lib/db/schema/studio-analysis")
    const { eq } = await import("drizzle-orm")

    const existing = await db!
      .select()
      .from(studioAnalysisRecords)
      .where(eq(studioAnalysisRecords.id, transcriptId))
      .limit(1)
    if (!existing[0]) return { success: false, error: "Transcript not found" }
    const sessionId = existing[0].studio_session_id
    if (!sessionId) return { success: false, error: "Record has no session" }

    const data = (existing[0].data ?? {}) as TranscriptData
    if (updates.transcript_article !== undefined) data.transcript_article = updates.transcript_article
    if (updates.summary !== undefined) data.summary = updates.summary
    if (updates.quotes_extracted !== undefined) data.quotes_extracted = updates.quotes_extracted
    if (updates.processing_status !== undefined) data.processing_status = updates.processing_status

    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: existing[0].eir_id,
      kind: "transcript",
      status: existing[0].status as StudioTranscriptStatus,
      data: data as Record<string, unknown>,
      error: existing[0].error,
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ─── Studio Wave 2 — timed segments + episode time map ───────────────────────
//
// Both persist into the transcript record's `data` JSONB (no new kind, no
// migration). Writes MERGE into any existing transcript data so the whisper
// timestamp path never clobbers a YouTube-caption transcript, and reads
// return null when the field was never written.

/**
 * Persist the whisper-timed segments the episode-map generator reads back.
 * Backfills the transcript TEXT fields from the segments ONLY when no
 * transcript exists yet (raw-audio path) — an existing caption transcript
 * keeps its own text.
 */
export async function saveTimedSegments(
  sessionId: string,
  segments: TimedSegment[],
  durationSeconds: number | null,
): Promise<void> {
  const existing = await getStudioAnalysisRecord(sessionId, "transcript")
  const eirId = existing?.eir_id ?? (await resolveEirIdForSession(sessionId))
  const prev = (existing?.data ?? {}) as TranscriptData

  const cleanFromSegments = cleanTranscriptText(segments.map((s) => s.text).join(" "))

  const data: TranscriptData = {
    ...prev,
    // Backfill text only when absent — never overwrite an existing transcript.
    source: prev.source ?? "whisper",
    language: prev.language ?? "ar",
    transcript_raw: prev.transcript_raw ?? cleanFromSegments,
    transcript_clean: prev.transcript_clean ?? cleanFromSegments,
    transcript_article: prev.transcript_article ?? null,
    word_count: prev.word_count ?? countWords(cleanFromSegments),
    char_count: prev.char_count ?? cleanFromSegments.length,
    summary: prev.summary ?? null,
    quotes_extracted: prev.quotes_extracted ?? null,
    processing_status: prev.processing_status ?? "idle",
    timed_segments: segments,
    timed_segments_duration_seconds: durationSeconds,
  }

  await upsertStudioAnalysisRecord({
    studio_session_id: sessionId,
    eir_id: eirId,
    kind: "transcript",
    status: (existing?.status as StudioTranscriptStatus) ?? "ready",
    data: data as Record<string, unknown>,
    error: existing?.error ?? null,
    generated_at: new Date(),
  })
}

/** Read the persisted timed segments back (for the generator / re-runs). */
export async function getTimedSegments(
  sessionId: string,
): Promise<{ segments: TimedSegment[]; durationSeconds: number | null } | null> {
  const record = await getStudioAnalysisRecord(sessionId, "transcript")
  const data = (record?.data ?? {}) as TranscriptData
  if (!data.timed_segments || data.timed_segments.length === 0) return null
  return {
    segments: data.timed_segments,
    durationSeconds: data.timed_segments_duration_seconds ?? null,
  }
}

/** Persist the validated episode time map onto the transcript record. */
export async function saveEpisodeMap(
  sessionId: string,
  map: EpisodeMap,
): Promise<void> {
  const existing = await getStudioAnalysisRecord(sessionId, "transcript")
  const eirId = existing?.eir_id ?? (await resolveEirIdForSession(sessionId))
  const prev = (existing?.data ?? {}) as TranscriptData

  const data: TranscriptData = { ...prev, episode_map: map }

  await upsertStudioAnalysisRecord({
    studio_session_id: sessionId,
    eir_id: eirId,
    kind: "transcript",
    status: (existing?.status as StudioTranscriptStatus) ?? "ready",
    data: data as Record<string, unknown>,
    error: existing?.error ?? null,
    generated_at: new Date(),
  })
}

/** Read the persisted episode time map back (for the UI / next task). */
export async function getEpisodeMap(sessionId: string): Promise<EpisodeMap | null> {
  const record = await getStudioAnalysisRecord(sessionId, "transcript")
  const data = (record?.data ?? {}) as TranscriptData
  return data.episode_map ?? null
}

// ─── Studio 3-phase journey — Phase-2 edit review ────────────────────────────
//
// Unlike the map (which merges into the RAW session's transcript record), the
// review is its OWN record under the `phase2_review` kind, keyed to the EDITED
// session id. `kind` is code-only (not DB-CHECK-enforced), so this needs no
// migration. The partial unique index on (studio_session_id, kind) guarantees
// exactly one review per edited session — a re-run replaces it in place.

/** Domain shape of the phase2_review record's `data` JSONB. */
interface EpisodeReviewData {
  review?: EpisodeReview | null
}

/**
 * Persist the deterministic Phase-2 review, keyed to the EDITED session id.
 * `generated_at` is stamped so the UI can show when the review last ran.
 */
export async function saveEpisodeReview(
  editedSessionId: string,
  review: EpisodeReview,
): Promise<void> {
  const eirId = await resolveEirIdForSession(editedSessionId)
  const data: EpisodeReviewData = { review }
  await upsertStudioAnalysisRecord({
    studio_session_id: editedSessionId,
    eir_id: eirId,
    kind: "phase2_review",
    status: "ready",
    data: data as Record<string, unknown>,
    generated_at: new Date(),
  })
}

/** Read the persisted Phase-2 review back (for the status endpoint / UI). */
export async function getEpisodeReview(
  editedSessionId: string,
): Promise<EpisodeReview | null> {
  const record = await getStudioAnalysisRecord(editedSessionId, "phase2_review")
  const data = (record?.data ?? {}) as EpisodeReviewData
  return data.review ?? null
}
