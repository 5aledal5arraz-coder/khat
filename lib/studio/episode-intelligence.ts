/**
 * Studio episode-intelligence persistence — the shared "Global Episode
 * Intelligence" understanding layer is computed once per episode and stored
 * as a `studio_analysis_records` row (kind=episode_intelligence) so it can be
 * reused by every downstream deliverable (the Growth package + the Website
 * knowledge hub) WITHOUT re-reading the transcript or re-running the
 * (expensive) analysis on each pipeline pass.
 *
 * Routed through analysis-records, mirroring lib/studio/deep-analysis.ts.
 */

import type { GlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
} from "./analysis-records"
import type { StudioAnalysisStatus } from "@/lib/db/schema/studio-analysis"

export interface StudioEpisodeIntelligence {
  id: string
  session_id: string
  status: StudioAnalysisStatus
  data: GlobalEpisodeIntelligence | null
  error_message: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
}

/** Read the persisted intelligence for a session, if any. */
export async function getEpisodeIntelligenceForSession(
  sessionId: string,
): Promise<StudioEpisodeIntelligence | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "episode_intelligence")
    if (!r) return null
    return {
      id: r.id,
      session_id: r.studio_session_id ?? "",
      status: r.status,
      data: (r.data && Object.keys(r.data).length > 0
        ? (r.data as unknown as GlobalEpisodeIntelligence)
        : null),
      error_message: r.error,
      generated_at: r.generated_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }
  } catch (err) {
    console.error("Error fetching episode intelligence:", err)
    return null
  }
}

/** Persist (replace) the intelligence for a session. */
export async function saveEpisodeIntelligence(
  sessionId: string,
  entry: {
    status: StudioAnalysisStatus
    data?: GlobalEpisodeIntelligence | null
    raw_openai_response?: Record<string, unknown> | null
    error_message?: string | null
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "episode_intelligence",
      status: entry.status,
      data: (entry.data ?? {}) as unknown as Record<string, unknown>,
      raw_provider_response: entry.raw_openai_response ?? null,
      error: entry.error_message ?? null,
      generated_at: new Date(),
    })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
