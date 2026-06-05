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
