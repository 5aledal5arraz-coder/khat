/**
 * Studio guest intelligence — persistence routed through
 * studio_analysis_records (Khat Brain Phase 4). See
 * lib/studio/chapters.ts for the migration pattern.
 */

import type {
  StudioGuestIntelligence,
  StudioGuestIntelligenceStatus,
} from "@/types/database"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"

interface GuestIntelligenceData {
  detected_name?: string | null
  detected_bio?: string | null
  confidence_score?: number | null
  speaking_style?: string | null
  key_positions?: string[]
  notable_quotes?: StudioGuestIntelligence["notable_quotes"]
  external_links?: Record<string, string> | null
  linked_guest_id?: string | null
}

function mapToLegacyShape(r: StudioAnalysisRecord): StudioGuestIntelligence {
  const data = (r.data ?? {}) as GuestIntelligenceData
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    status: r.status as StudioGuestIntelligenceStatus,
    detected_name: data.detected_name ?? null,
    detected_bio: data.detected_bio ?? null,
    confidence_score: data.confidence_score ?? null,
    speaking_style: data.speaking_style ?? null,
    key_positions: data.key_positions ?? [],
    notable_quotes: data.notable_quotes ?? [],
    external_links: data.external_links ?? null,
    linked_guest_id: data.linked_guest_id ?? null,
    raw_openai_response: r.raw_provider_response,
    error_message: r.error,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioGuestIntelligence
}

export async function getGuestIntelligenceForSession(
  sessionId: string,
): Promise<StudioGuestIntelligence | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "guest_intelligence")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching guest intelligence:", err)
    return null
  }
}

export async function createGuestIntelligence(
  sessionId: string,
  entry: {
    status: StudioGuestIntelligenceStatus
    detected_name?: string | null
    detected_bio?: string | null
    confidence_score?: number | null
    speaking_style?: string | null
    key_positions?: string[]
    notable_quotes?: StudioGuestIntelligence["notable_quotes"]
    external_links?: Record<string, string> | null
    linked_guest_id?: string | null
    raw_openai_response?: Record<string, unknown> | null
    error_message?: string | null
  }
): Promise<{ success: boolean; data?: StudioGuestIntelligence; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const data: GuestIntelligenceData = {
      detected_name: entry.detected_name ?? null,
      detected_bio: entry.detected_bio ?? null,
      confidence_score: entry.confidence_score ?? null,
      speaking_style: entry.speaking_style ?? null,
      key_positions: entry.key_positions ?? [],
      notable_quotes: entry.notable_quotes ?? [],
      external_links: entry.external_links ?? null,
      linked_guest_id: entry.linked_guest_id ?? null,
    }
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "guest_intelligence",
      status: entry.status,
      data: data as Record<string, unknown>,
      raw_provider_response: entry.raw_openai_response ?? null,
      error: entry.error_message ?? null,
      generated_at: new Date(),
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
