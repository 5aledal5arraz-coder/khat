"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { getAdminAuthUser, requireActionRole } from "@/lib/api-utils"
import { db } from "@/lib/db"
import {
  studioAnalysisRecords,
} from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import {
  coerceTranscriptDocument,
  recomputeCounts,
  type TranscriptDocument,
} from "@/lib/editorial/transcript-types"
import { upsertStudioAnalysisRecord } from "@/lib/studio/analysis-records"

export type SaveTranscriptResult =
  | {
      ok: true
      newVersion: number
      savedAt: string
    }
  | {
      ok: false
      code: "version_conflict"
      currentVersion: number
      currentDoc: TranscriptDocument
    }
  | {
      ok: false
      code: "no_session"
      message: string
    }
  | {
      ok: false
      code: "validation"
      message: string
    }
  | {
      ok: false
      code: "server_error"
      message: string
    }

export interface SaveTranscriptInput {
  eirId: string
  /** Version the client believed it was editing. Server compares to
   *  current row's data.version to detect conflicts. Pass `0` for the
   *  first save against a previously-empty record. */
  expectedVersion: number
  doc: TranscriptDocument
  /**
   * UX-7.5 Phase E — per-mount editor session id (UUID). Carried on
   * every save so the server-side `edited_fields` JSON can record
   * which editor session authored a change. Lays the foundation for
   * future "currently editing" presence without enabling realtime
   * collaboration in this wave.
   */
  editorSessionId?: string
  /** Per-save monotonic txn id from the autosave manager. Useful for
   *  forensic logs when investigating a chain of conflicts. */
  txnId?: number
}

/**
 * UX-7 — workspace transcript save action.
 *
 * Writes to `studio_analysis_records` with kind=transcript, scoped by
 * eir_id (and studio_session_id when available). Performs an
 * optimistic-concurrency check via `data.version`; rejects with a
 * `version_conflict` payload if another tab raced ahead.
 *
 * The action is the only canonical write path for workspace transcript
 * edits. The legacy Studio SPA continues to write to its own
 * studio_transcripts table; the two surfaces will reconcile in Phase
 * 5+ backfill.
 */
export async function saveTranscriptAction(
  input: SaveTranscriptInput,
): Promise<SaveTranscriptResult> {
  try {
    const gate = await requireActionRole("EDITOR")
    if (!gate.ok) return { ok: false, code: "server_error", message: gate.error }
    const admin = await getAdminAuthUser()
    if (!db) return { ok: false, code: "server_error", message: "DB unavailable" }

    // Verify EIR exists.
    const eirRow = await db
      .select({ id: episodeIntelligenceRecords.id })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, input.eirId))
      .limit(1)
    if (!eirRow[0]) {
      return {
        ok: false,
        code: "validation",
        message: "EIR not found",
      }
    }
    // Resolve studio session via the back-reference (studio_sessions.eir_id).
    const sessionRow = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.eir_id, input.eirId))
      .orderBy(desc(studioSessions.updated_at))
      .limit(1)
    const studioSessionId: string | null = sessionRow[0]?.id ?? null

    // Read current row (by eir_id, then by session id).
    let current = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "transcript"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    if (!current[0] && studioSessionId) {
      current = await db
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
    }

    const currentVersion =
      typeof (current[0]?.data as Record<string, unknown> | undefined)?.version === "number"
        ? ((current[0]?.data as Record<string, unknown>).version as number)
        : 0

    // Conflict detection.
    if (currentVersion !== input.expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        currentVersion,
        currentDoc: coerceTranscriptDocument(
          current[0]?.data as Record<string, unknown> | null,
        ),
      }
    }

    // Build the new doc — recompute counts from segments to keep the
    // row honest, regardless of what the client claims.
    const counts = recomputeCounts(input.doc)
    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const next: TranscriptDocument = {
      ...input.doc,
      ...counts,
      schema_version: 1,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }

    // Forensic editor-session metadata. Stored on the row's
    // edited_fields blob so it never collides with the document
    // payload itself.
    const editedFields: Record<string, unknown> = {
      last_save: {
        editor_session_id: input.editorSessionId ?? null,
        txn_id: input.txnId ?? null,
        admin_id: admin?.id ?? null,
        version: newVersion,
        at: savedAt,
      },
    }

    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "transcript",
      status: "ready",
      data: next as unknown as Record<string, unknown>,
      edited_fields: editedFields,
      generated_at: null,
      published_at: null,
    })

    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return { ok: true, newVersion, savedAt }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}
