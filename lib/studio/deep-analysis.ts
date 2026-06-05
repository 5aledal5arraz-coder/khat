/**
 * Studio deep analysis — persistence routed through studio_analysis_records
 * (Khat Brain Phase 4). See lib/studio/chapters.ts for the migration
 * pattern.
 */

import type { StudioDeepAnalysis, StudioDeepAnalysisStatus } from "@/types/database"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"

interface DeepAnalysisData {
  themes?: StudioDeepAnalysis["themes"]
  thesis?: string | null
  arguments?: StudioDeepAnalysis["arguments"]
  emotional_moments?: StudioDeepAnalysis["emotional_moments"]
  lessons?: StudioDeepAnalysis["lessons"]
  contradictions?: StudioDeepAnalysis["contradictions"]
  dialogue_map?: StudioDeepAnalysis["dialogue_map"]
  conversation_arc?: string | null
  open_questions?: string[]
}

function mapToLegacyShape(r: StudioAnalysisRecord): StudioDeepAnalysis {
  const data = (r.data ?? {}) as DeepAnalysisData
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    status: r.status as StudioDeepAnalysisStatus,
    themes: data.themes ?? [],
    thesis: data.thesis ?? null,
    arguments: data.arguments ?? [],
    emotional_moments: data.emotional_moments ?? [],
    lessons: data.lessons ?? [],
    contradictions: data.contradictions ?? [],
    dialogue_map: data.dialogue_map ?? null,
    conversation_arc: data.conversation_arc ?? null,
    open_questions: data.open_questions ?? [],
    raw_openai_response: r.raw_provider_response,
    error_message: r.error,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioDeepAnalysis
}

export async function getDeepAnalysisForSession(sessionId: string): Promise<StudioDeepAnalysis | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "deep_analysis")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching deep analysis:", err)
    return null
  }
}

export async function createDeepAnalysis(
  sessionId: string,
  entry: {
    status: StudioDeepAnalysisStatus
    themes?: StudioDeepAnalysis["themes"]
    thesis?: string | null
    arguments?: StudioDeepAnalysis["arguments"]
    emotional_moments?: StudioDeepAnalysis["emotional_moments"]
    lessons?: StudioDeepAnalysis["lessons"]
    contradictions?: StudioDeepAnalysis["contradictions"]
    dialogue_map?: StudioDeepAnalysis["dialogue_map"]
    conversation_arc?: string | null
    open_questions?: string[]
    raw_openai_response?: Record<string, unknown> | null
    error_message?: string | null
  }
): Promise<{ success: boolean; data?: StudioDeepAnalysis; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const data: DeepAnalysisData = {
      themes: entry.themes ?? [],
      thesis: entry.thesis ?? null,
      arguments: entry.arguments ?? [],
      emotional_moments: entry.emotional_moments ?? [],
      lessons: entry.lessons ?? [],
      contradictions: entry.contradictions ?? [],
      dialogue_map: entry.dialogue_map ?? null,
      conversation_arc: entry.conversation_arc ?? null,
      open_questions: entry.open_questions ?? [],
    }
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "deep_analysis",
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
