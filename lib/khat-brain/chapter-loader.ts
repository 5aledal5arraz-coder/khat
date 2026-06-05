/**
 * UX-8 Phase B — Server-side chapter loader for the workspace.
 *
 * Reads the most-recent `studio_analysis_records` row of kind=chapters
 * for an EIR. Falls back to `kind=transcript` to derive the episode's
 * total duration when the chapter doc doesn't carry one. Always
 * returns a `ChapterDocument` — never throws.
 */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  studioAnalysisRecords,
  type StudioAnalysisStatus,
} from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import {
  coerceChapterDocument,
  emptyChapterDocument,
  type ChapterDocument,
} from "@/lib/editorial/chapter-types"
import { coerceTranscriptDocument } from "@/lib/editorial/transcript-types"

export interface ChapterLoadResult {
  doc: ChapterDocument
  source: "studio_analysis_records" | "empty"
  recordId: string | null
  studioSessionId: string | null
  status: StudioAnalysisStatus | "missing"
  updatedAt: string | null
  /** UX-8 — surface the latest transcript record id + version so the
   *  editor can flag chapters that were authored against an older
   *  transcript than the current one. */
  latestTranscriptRecordId: string | null
  latestTranscriptVersion: number | null
}

export async function loadChaptersForEir(
  eirId: string,
): Promise<ChapterLoadResult> {
  const empty: ChapterLoadResult = {
    doc: emptyChapterDocument(),
    source: "empty",
    recordId: null,
    studioSessionId: null,
    status: "missing",
    updatedAt: null,
    latestTranscriptRecordId: null,
    latestTranscriptVersion: null,
  }
  if (!db) return empty

  const sessionRow = await db
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  const studioSessionId = sessionRow[0]?.id ?? null

  // Read chapters by eir_id first.
  const chapterRows = await db
    .select()
    .from(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.eir_id, eirId),
        eq(studioAnalysisRecords.kind, "chapters"),
      ),
    )
    .orderBy(desc(studioAnalysisRecords.created_at))
    .limit(1)

  let chapterRow = chapterRows[0]
  if (!chapterRow && studioSessionId) {
    const bySession = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.studio_session_id, studioSessionId),
          eq(studioAnalysisRecords.kind, "chapters"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    chapterRow = bySession[0]
  }

  // Read latest transcript so we can compute total_duration_seconds
  // and tag the chapter doc with the transcript's record id +
  // version (drift-detection foundation).
  let latestTranscriptRecordId: string | null = null
  let latestTranscriptVersion: number | null = null
  let totalDurationSeconds: number | null = null
  const trxRows = await db
    .select()
    .from(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.eir_id, eirId),
        eq(studioAnalysisRecords.kind, "transcript"),
      ),
    )
    .orderBy(desc(studioAnalysisRecords.created_at))
    .limit(1)
  if (trxRows[0]) {
    const trx = trxRows[0]
    latestTranscriptRecordId = trx.id
    const t = coerceTranscriptDocument(trx.data as Record<string, unknown> | null)
    latestTranscriptVersion = t.version
    if (t.segments.length > 0) {
      const last = t.segments[t.segments.length - 1]
      if (typeof last.end_seconds === "number") {
        totalDurationSeconds = last.end_seconds
      } else if (typeof last.start_seconds === "number") {
        totalDurationSeconds = last.start_seconds
      }
    }
  }

  if (!chapterRow) {
    // Provide an empty doc but pre-populate the duration + transcript
    // pointers so the editor has context on first mount.
    return {
      ...empty,
      studioSessionId,
      latestTranscriptRecordId,
      latestTranscriptVersion,
      doc: {
        ...empty.doc,
        total_duration_seconds: totalDurationSeconds,
        source_transcript_record_id: latestTranscriptRecordId,
        source_transcript_version: latestTranscriptVersion,
      },
    }
  }

  const doc = coerceChapterDocument(
    chapterRow.data as Record<string, unknown> | null,
  )
  // Always refresh duration from latest transcript on load — chapters
  // may have been authored before the transcript was finalized.
  const merged: ChapterDocument = {
    ...doc,
    total_duration_seconds:
      doc.total_duration_seconds ?? totalDurationSeconds ?? null,
  }
  return {
    doc: merged,
    source: "studio_analysis_records",
    recordId: chapterRow.id,
    studioSessionId,
    status: chapterRow.status as StudioAnalysisStatus,
    updatedAt: chapterRow.updated_at.toISOString(),
    latestTranscriptRecordId,
    latestTranscriptVersion,
  }
}
