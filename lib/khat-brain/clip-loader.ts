/**
 * UX-9 Phase B — Server-side clip loader.
 *
 * Reads `studio_analysis_records kind=clips`, plus the latest
 * transcript + chapter records so the editor can render anchored
 * context (segment text previews, chapter chip linkage). Always
 * returns a `ClipDocument` — never throws.
 */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  studioAnalysisRecords,
  type StudioAnalysisStatus,
} from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import {
  coerceClipDocument,
  emptyClipDocument,
  type ClipDocument,
} from "@/lib/editorial/clip-types"
import {
  coerceTranscriptDocument,
  type TranscriptDocument,
} from "@/lib/editorial/transcript-types"
import {
  coerceChapterDocument,
  type ChapterDocument,
} from "@/lib/editorial/chapter-types"

export interface ClipLoadResult {
  doc: ClipDocument
  source: "studio_analysis_records" | "empty"
  recordId: string | null
  studioSessionId: string | null
  status: StudioAnalysisStatus | "missing"
  updatedAt: string | null
  /** UX-9 — minimal transcript + chapter context for the editor.
   *  Allows the clip card to render segment-text previews + chapter
   *  chips without a second fetch. */
  transcript: TranscriptDocument | null
  chapters: ChapterDocument | null
}

export async function loadClipsForEir(eirId: string): Promise<ClipLoadResult> {
  const empty: ClipLoadResult = {
    doc: emptyClipDocument(),
    source: "empty",
    recordId: null,
    studioSessionId: null,
    status: "missing",
    updatedAt: null,
    transcript: null,
    chapters: null,
  }
  if (!db) return empty

  const sessionRow = await db
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  const studioSessionId = sessionRow[0]?.id ?? null

  // Read clips, transcript, chapters in parallel.
  const [clipsRow, trxRow, chRow] = await Promise.all([
    db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, eirId),
          eq(studioAnalysisRecords.kind, "clips"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1),
    db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, eirId),
          eq(studioAnalysisRecords.kind, "transcript"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1),
    db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, eirId),
          eq(studioAnalysisRecords.kind, "chapters"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1),
  ])

  let transcript: TranscriptDocument | null = null
  let totalDurationSeconds: number | null = null
  let latestTranscriptRecordId: string | null = null
  let latestTranscriptVersion: number | null = null
  if (trxRow[0]) {
    const t = coerceTranscriptDocument(
      trxRow[0].data as Record<string, unknown> | null,
    )
    transcript = t
    latestTranscriptRecordId = trxRow[0].id
    latestTranscriptVersion = t.version
    if (t.segments.length > 0) {
      const last = t.segments[t.segments.length - 1]
      totalDurationSeconds =
        typeof last.end_seconds === "number"
          ? last.end_seconds
          : typeof last.start_seconds === "number"
            ? last.start_seconds
            : null
    }
  }

  let chapters: ChapterDocument | null = null
  if (chRow[0]) {
    chapters = coerceChapterDocument(
      chRow[0].data as Record<string, unknown> | null,
    )
  }

  if (!clipsRow[0]) {
    return {
      ...empty,
      studioSessionId,
      transcript,
      chapters,
      doc: {
        ...empty.doc,
        total_duration_seconds: totalDurationSeconds,
        source_transcript_record_id: latestTranscriptRecordId,
        source_transcript_version: latestTranscriptVersion,
      },
    }
  }

  const doc = coerceClipDocument(
    clipsRow[0].data as Record<string, unknown> | null,
  )
  // Keep the duration/transcript pointers fresh on each load.
  const merged: ClipDocument = {
    ...doc,
    total_duration_seconds:
      doc.total_duration_seconds ?? totalDurationSeconds ?? null,
    source_transcript_record_id:
      doc.source_transcript_record_id ?? latestTranscriptRecordId,
    source_transcript_version:
      doc.source_transcript_version ?? latestTranscriptVersion,
  }
  return {
    doc: merged,
    source: "studio_analysis_records",
    recordId: clipsRow[0].id,
    studioSessionId,
    status: clipsRow[0].status as StudioAnalysisStatus,
    updatedAt: clipsRow[0].updated_at.toISOString(),
    transcript,
    chapters,
  }
}
