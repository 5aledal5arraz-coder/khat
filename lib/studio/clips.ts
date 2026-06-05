/**
 * Studio clips — persistence routed through studio_analysis_records
 * (Khat Brain Phase 4). See lib/studio/chapters.ts for the migration
 * pattern.
 */

import type { StudioClips, StudioClipsStatus, StudioClipItem } from "@/types/database"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"

function mapToLegacyShape(r: StudioAnalysisRecord): StudioClips {
  const data = r.data as { clips?: StudioClipItem[] } | null
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    status: r.status as StudioClipsStatus,
    clips: Array.isArray(data?.clips) ? data!.clips : [],
    raw_openai_response: r.raw_provider_response,
    error_message: r.error,
    edited_fields: (r.edited_fields ?? null) as Record<string, string> | null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioClips
}

export async function getClipsForSession(sessionId: string): Promise<StudioClips | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "clips")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching clips:", err)
    return null
  }
}

export async function createClips(
  sessionId: string,
  entry: {
    status: StudioClipsStatus
    clips: StudioClipItem[]
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioClips; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "clips",
      status: entry.status,
      data: { clips: entry.clips },
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

export async function updateClips(
  id: string,
  updates: { clips?: StudioClipItem[] }
): Promise<{ success: boolean; data?: StudioClips; error?: string }> {
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

    const data = (existing[0].data ?? {}) as { clips?: StudioClipItem[] }
    if (updates.clips !== undefined) data.clips = updates.clips

    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: existing[0].eir_id,
      kind: "clips",
      status: existing[0].status as StudioClipsStatus,
      data,
      raw_provider_response:
        (existing[0].raw_provider_response ?? null) as Record<string, unknown> | null,
      error: existing[0].error,
      edited_fields: {
        ...((existing[0].edited_fields ?? {}) as Record<string, unknown>),
        clips: { edited_at: new Date().toISOString() },
      },
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
