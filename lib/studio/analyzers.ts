/**
 * Studio analyzer — persistence routed through studio_analysis_records
 * (Khat Brain Phase 5).
 */

import type {
  StudioAnalyzer,
  StudioAnalyzerStatus,
  StudioAnalyzerData,
} from "@/types/database"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"

interface AnalyzerWrapper {
  prompt_version?: string
  data?: StudioAnalyzerData | null
}

function mapToLegacyShape(r: StudioAnalysisRecord): StudioAnalyzer {
  const wrap = (r.data ?? {}) as AnalyzerWrapper
  // Reverse the status mapping: pending → idle on read.
  const reverseStatus: StudioAnalyzerStatus =
    r.status === "pending" ? "idle" : (r.status as StudioAnalyzerStatus)
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    status: reverseStatus,
    data: (wrap.data ?? null) as StudioAnalyzerData | null,
    prompt_version: wrap.prompt_version ?? "v1",
    raw_openai_response: r.raw_provider_response,
    error_message: r.error,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioAnalyzer
}

export async function getAnalyzerForSession(sessionId: string): Promise<StudioAnalyzer | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "analyzer")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching analyzer:", err)
    return null
  }
}

export async function createAnalyzer(
  sessionId: string,
  entry: {
    status: StudioAnalyzerStatus
    data: StudioAnalyzerData | null
    prompt_version: string
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  },
): Promise<{ success: boolean; data?: StudioAnalyzer; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const wrapper: AnalyzerWrapper = {
      prompt_version: entry.prompt_version,
      data: entry.data,
    }
    // Map analyzer status ("idle"|"generating"|"ready"|"error") to the
    // generic studio_analysis_records lifecycle (idle→pending).
    const mappedStatus =
      entry.status === "idle" ? "pending" : (entry.status as "generating" | "ready" | "error")
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "analyzer",
      status: mappedStatus,
      data: wrapper as Record<string, unknown>,
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
