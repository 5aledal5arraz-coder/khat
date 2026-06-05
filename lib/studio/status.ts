/**
 * Studio session AI-status aggregator — migrated to read from
 * studio_analysis_records (Khat Brain Phase 5).
 */

import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { studioSessions } from "@/lib/db/schema/studio"
import {
  studioAnalysisRecords,
  type StudioAnalysisKind,
} from "@/lib/db/schema/studio-analysis"

export type AiStatus = "ready" | "processing" | "completed"

const PIPELINE_KINDS: readonly StudioAnalysisKind[] = [
  "transcript",
  "ai_outputs",
  "chapters",
  "clips",
  "website_package",
] as const

/**
 * For every studio session, determine its AI processing status:
 * - "ready"      → session exists but no AI content generated yet
 * - "processing" → some AI content exists but pipeline is incomplete
 * - "completed"  → transcript + ai_outputs + chapters + clips + website_package all "ready"
 */
export async function getSessionAiStatuses(): Promise<Record<string, AiStatus>> {
  try {
    const records = await db!
      .select({
        session_id: studioAnalysisRecords.studio_session_id,
        kind: studioAnalysisRecords.kind,
        status: studioAnalysisRecords.status,
      })
      .from(studioAnalysisRecords)
      .where(inArray(studioAnalysisRecords.kind, [...PIPELINE_KINDS]))

    const readyByKind = new Map<StudioAnalysisKind, Set<string>>()
    for (const k of PIPELINE_KINDS) readyByKind.set(k, new Set<string>())
    const hasAny = new Set<string>()

    for (const r of records) {
      if (!r.session_id) continue
      hasAny.add(r.session_id)
      if (r.status === "ready") {
        readyByKind.get(r.kind as StudioAnalysisKind)?.add(r.session_id)
      }
    }

    const sessionRows = await db!.select({ id: studioSessions.id }).from(studioSessions)
    const result: Record<string, AiStatus> = {}

    for (const { id } of sessionRows) {
      const allReady = PIPELINE_KINDS.every((k) => readyByKind.get(k)?.has(id))
      if (allReady) result[id] = "completed"
      else if (hasAny.has(id)) result[id] = "processing"
      else result[id] = "ready"
    }
    return result
  } catch (err) {
    console.error("Error fetching AI statuses:", err)
    return {}
  }
}
