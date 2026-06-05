/**
 * Studio chapters — persistence routed through studio_analysis_records
 * (Khat Brain Phase 4). The public API shape (StudioChapters, success
 * envelopes) is preserved so the 27+ API routes continue working
 * unchanged. Internally we read/write the consolidated table via the
 * analysis-records repo.
 */

import type { StudioChapters, StudioChaptersStatus, StudioChapterItem } from "@/types/database"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"

function mapToLegacyShape(r: StudioAnalysisRecord): StudioChapters {
  // Reconstruct the legacy StudioChapters shape from the consolidated row.
  const data = r.data as { chapters?: StudioChapterItem[] } | null
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    status: r.status as StudioChaptersStatus,
    chapters: Array.isArray(data?.chapters) ? data!.chapters : [],
    raw_openai_response: r.raw_provider_response,
    error_message: r.error,
    edited_fields: (r.edited_fields ?? null) as Record<string, string> | null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioChapters
}

export async function getChaptersForSession(sessionId: string): Promise<StudioChapters | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "chapters")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching chapters:", err)
    return null
  }
}

export async function createChapters(
  sessionId: string,
  entry: {
    status: StudioChaptersStatus
    chapters: StudioChapterItem[]
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioChapters; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "chapters",
      status: entry.status,
      data: { chapters: entry.chapters },
      raw_provider_response: entry.raw_openai_response,
      error: entry.error_message,
      generated_at: new Date(),
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateChapters(
  id: string,
  updates: { chapters?: StudioChapterItem[] }
): Promise<{ success: boolean; data?: StudioChapters; error?: string }> {
  // The legacy contract was "update by record id". The consolidated
  // table is keyed on (session_id, kind), so we resolve the session_id
  // from the record id, merge the data blob, and upsert. Net result
  // matches the prior behavior: an admin edit replaces the row.
  try {
    const { db } = await import("@/lib/db")
    const { studioAnalysisRecords } = await import("@/lib/db/schema/studio-analysis")
    const { eq } = await import("drizzle-orm")

    const existing = await db!
      .select()
      .from(studioAnalysisRecords)
      .where(eq(studioAnalysisRecords.id, id))
      .limit(1)
    if (!existing[0]) return { success: false, error: "Not found" }

    const sessionId = existing[0].studio_session_id
    if (!sessionId) return { success: false, error: "Record has no session" }

    const data = (existing[0].data ?? {}) as { chapters?: StudioChapterItem[] }
    if (updates.chapters !== undefined) data.chapters = updates.chapters

    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: existing[0].eir_id,
      kind: "chapters",
      status: existing[0].status as StudioChaptersStatus,
      data,
      raw_provider_response:
        (existing[0].raw_provider_response ?? null) as Record<string, unknown> | null,
      error: existing[0].error,
      edited_fields: {
        ...((existing[0].edited_fields ?? {}) as Record<string, unknown>),
        chapters: { edited_at: new Date().toISOString() },
      },
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
