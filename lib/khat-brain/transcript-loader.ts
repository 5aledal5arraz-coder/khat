/**
 * UX-7 Phase A — Server-side transcript loader for the workspace.
 *
 * Reads the most-recent `studio_analysis_records` row of kind=transcript
 * for an EIR (by eir_id first, then by the linked studio_session_id).
 * The legacy `studio_transcripts` table is intentionally NOT read here
 * (see the note at the empty-doc return below) — when neither lookup
 * hits, an empty doc is returned so the editor still mounts. The shape
 * returned to the client is always the new `TranscriptDocument`.
 *
 * No writes from this module — see `transcript-actions.ts` for the
 * server action that owns the save path.
 */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  studioAnalysisRecords,
  type StudioAnalysisStatus,
} from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import {
  coerceTranscriptDocument,
  type TranscriptDocument,
} from "@/lib/editorial/transcript-types"

export interface TranscriptLoadResult {
  /** Always populated — empty doc if neither source has data. */
  doc: TranscriptDocument
  /** Where the doc came from. */
  source: "studio_analysis_records" | "studio_transcripts" | "empty"
  /** The id of the studio_analysis_records row, if read from there. */
  recordId: string | null
  /** Linked studio_session_id (text); null if no session has been linked. */
  studioSessionId: string | null
  /** Lifecycle status of the record. */
  status: StudioAnalysisStatus | "missing"
  /** Last update timestamp from the source row. ISO. */
  updatedAt: string | null
}

export async function loadTranscriptForEir(
  eirId: string,
): Promise<TranscriptLoadResult> {
  if (!db) {
    return {
      doc: coerceTranscriptDocument(null),
      source: "empty",
      recordId: null,
      studioSessionId: null,
      status: "missing",
      updatedAt: null,
    }
  }

  // Resolve the studio_session_id via studio_sessions.eir_id back-ref.
  const sessionRow = await db
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  const studioSessionId: string | null = sessionRow[0]?.id ?? null

  // 1) Try the consolidated table by eir_id first.
  const byEir = await db
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
  if (byEir[0]) {
    const r = byEir[0]
    return {
      doc: coerceTranscriptDocument(r.data as Record<string, unknown> | null),
      source: "studio_analysis_records",
      recordId: r.id,
      studioSessionId,
      status: r.status as StudioAnalysisStatus,
      updatedAt: r.updated_at.toISOString(),
    }
  }

  // 2) Try by studio_session_id (legacy backfill writes there even when
  //    eir_id is null).
  if (studioSessionId) {
    const bySession = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.studio_session_id, studioSessionId),
          eq(studioAnalysisRecords.kind, "transcript"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    if (bySession[0]) {
      const r = bySession[0]
      return {
        doc: coerceTranscriptDocument(r.data as Record<string, unknown> | null),
        source: "studio_analysis_records",
        recordId: r.id,
        studioSessionId,
        status: r.status as StudioAnalysisStatus,
        updatedAt: r.updated_at.toISOString(),
      }
    }
  }

  // 3) Nothing found. Return an empty doc so the editor still mounts.
  // Note: the legacy `studio_transcripts` table is intentionally NOT
  // read here — per the UX-7 brief, the workspace surface owns
  // `studio_analysis_records kind=transcript`. Operators with content
  // only in the legacy table can open the full Studio workspace via
  // the escape-hatch link (`/admin/studio?video=<videoId>` — there is
  // no per-session studio route) to view it there; the workspace will
  // pick up edits once they flow through Phase 5+ backfill.
  return {
    doc: coerceTranscriptDocument(null),
    source: "empty",
    recordId: null,
    studioSessionId,
    status: "missing",
    updatedAt: null,
  }
}
