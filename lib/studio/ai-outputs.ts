/**
 * Studio AI outputs — persistence routed through studio_analysis_records
 * (Khat Brain Phase 5).
 */

import type { StudioAiOutput, StudioAiOutputStatus } from "@/types/database"
import {
  upsertStudioAnalysisRecord,
  getStudioAnalysisRecord,
  resolveEirIdForSession,
  type StudioAnalysisRecord,
} from "./analysis-records"

interface AiOutputData {
  model?: string
  prompt_version?: string
  title_best?: string
  title_alternatives?: string[]
  thumbnail_text_options?: string[]
  youtube_description?: string
  seo_keywords?: string[]
  hashtags?: string[]
}

function mapToLegacyShape(r: StudioAnalysisRecord): StudioAiOutput {
  const data = (r.data ?? {}) as AiOutputData
  return {
    id: r.id,
    session_id: r.studio_session_id ?? "",
    model: data.model ?? "gpt-4o-mini",
    prompt_version: data.prompt_version ?? "v1",
    status: r.status as StudioAiOutputStatus,
    title_best: data.title_best ?? "",
    title_alternatives: data.title_alternatives ?? [],
    thumbnail_text_options: data.thumbnail_text_options ?? [],
    youtube_description: data.youtube_description ?? "",
    seo_keywords: data.seo_keywords ?? [],
    hashtags: data.hashtags ?? [],
    raw_openai_response: r.raw_provider_response,
    error_message: r.error,
    edited_fields: (r.edited_fields ?? null) as Record<string, string> | null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  } as unknown as StudioAiOutput
}

export async function getAiOutputForSession(sessionId: string): Promise<StudioAiOutput | null> {
  try {
    const r = await getStudioAnalysisRecord(sessionId, "ai_outputs")
    return r ? mapToLegacyShape(r) : null
  } catch (err) {
    console.error("Error fetching AI output:", err)
    return null
  }
}

export async function createAiOutput(
  sessionId: string,
  output: {
    model: string
    prompt_version: string
    status: StudioAiOutputStatus
    title_best: string
    title_alternatives: string[]
    thumbnail_text_options: string[]
    youtube_description: string
    seo_keywords: string[]
    hashtags: string[]
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  },
): Promise<{ success: boolean; data?: StudioAiOutput; error?: string }> {
  try {
    const eirId = await resolveEirIdForSession(sessionId)
    const data: AiOutputData = {
      model: output.model,
      prompt_version: output.prompt_version,
      title_best: output.title_best,
      title_alternatives: output.title_alternatives,
      thumbnail_text_options: output.thumbnail_text_options,
      youtube_description: output.youtube_description,
      seo_keywords: output.seo_keywords,
      hashtags: output.hashtags,
    }
    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: eirId,
      kind: "ai_outputs",
      status: output.status,
      data: data as Record<string, unknown>,
      raw_provider_response: output.raw_openai_response,
      error: output.error_message,
      generated_at: new Date(),
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateAiOutput(
  id: string,
  updates: Partial<
    Pick<
      StudioAiOutput,
      | "title_best"
      | "title_alternatives"
      | "thumbnail_text_options"
      | "youtube_description"
      | "seo_keywords"
      | "hashtags"
    >
  >,
): Promise<{ success: boolean; data?: StudioAiOutput; error?: string }> {
  try {
    const { db } = await import("@/lib/db")
    const { studioAnalysisRecords } = await import("@/lib/db/schema/studio-analysis")
    const { eq } = await import("drizzle-orm")

    const existing = await db!
      .select()
      .from(studioAnalysisRecords)
      .where(eq(studioAnalysisRecords.id, id))
      .limit(1)
    if (!existing[0]) return { success: false, error: "Output not found" }
    const sessionId = existing[0].studio_session_id
    if (!sessionId) return { success: false, error: "Record has no session" }

    const data = (existing[0].data ?? {}) as AiOutputData
    for (const [k, v] of Object.entries(updates) as [keyof AiOutputData, unknown][]) {
      if (v !== undefined) (data as Record<string, unknown>)[k as string] = v
    }

    const saved = await upsertStudioAnalysisRecord({
      studio_session_id: sessionId,
      eir_id: existing[0].eir_id,
      kind: "ai_outputs",
      status: existing[0].status as StudioAiOutputStatus,
      data: data as Record<string, unknown>,
      raw_provider_response:
        (existing[0].raw_provider_response ?? null) as Record<string, unknown> | null,
      error: existing[0].error,
      edited_fields: {
        ...((existing[0].edited_fields ?? {}) as Record<string, unknown>),
        edited_at: new Date().toISOString(),
      },
    })
    return { success: true, data: mapToLegacyShape(saved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
