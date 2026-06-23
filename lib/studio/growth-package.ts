/**
 * Studio growth-package persistence — the copy-ready YouTube growth deliverable
 * (Goal 1) stored as a `studio_analysis_records` row (kind=growth_package).
 * Routed through analysis-records, mirroring lib/studio/deep-analysis.ts.
 */

import type { GrowthPackage } from "@/lib/ai/growth/types"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
} from "./analysis-records"
import type { StudioAnalysisStatus } from "@/lib/db/schema/studio-analysis"

export interface StudioGrowthPackage {
  id: string
  session_id: string
  status: StudioAnalysisStatus
  data: GrowthPackage | null
  error_message: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
}

export async function getGrowthPackageForSession(
  sessionId: string,
): Promise<StudioGrowthPackage | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "growth_package")
    if (!r) return null
    return {
      id: r.id,
      session_id: r.studio_session_id ?? "",
      status: r.status,
      data: r.data && Object.keys(r.data).length > 0 ? (r.data as unknown as GrowthPackage) : null,
      error_message: r.error,
      generated_at: r.generated_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }
  } catch (err) {
    console.error("Error fetching growth package:", err)
    return null
  }
}

export async function saveGrowthPackage(
  sessionId: string,
  entry: {
    status: StudioAnalysisStatus
    data?: GrowthPackage | null
    error_message?: string | null
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "growth_package",
      status: entry.status,
      data: (entry.data ?? {}) as unknown as Record<string, unknown>,
      error: entry.error_message ?? null,
      generated_at: new Date(),
    })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
