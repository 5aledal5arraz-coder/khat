/**
 * Shared orchestration for producing a session's Growth package.
 *
 * Used by BOTH the SSE pipeline step (`generate-stream`) and the dedicated
 * Growth route (`/api/admin/studio/[id]/growth-package`) so the
 * ensure-intelligence + assemble + persist logic lives in one place.
 *
 * Imports sibling modules directly (not the ./index barrel) to avoid a
 * circular re-export, since index.ts re-exports this file.
 */

import type { GlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"
import type { GrowthPackage } from "@/lib/ai/growth/types"
import { generateGlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"
import { generateGrowthPackage } from "@/lib/ai/growth"
import { getStudioSession } from "./sessions"
import { getTranscriptForSession } from "./transcripts"
import { getChaptersForSession } from "./chapters"
import { getAiOutputForSession } from "./ai-outputs"
import { getEpisodeIntelligenceForSession, saveEpisodeIntelligence } from "./episode-intelligence"
import { saveGrowthPackage } from "./growth-package"

export interface RunGrowthOptions {
  /** Reuse an already-loaded intelligence (e.g. from the SSE pipeline run). */
  intelligence?: GlobalEpisodeIntelligence | null
  /** Per-slice progress callback for streaming UIs. */
  onProgress?: (slice: string) => void
}

export async function runGrowthPackageForSession(
  sessionId: string,
  opts: RunGrowthOptions = {},
): Promise<{ success: boolean; data?: GrowthPackage; error?: string }> {
  const session = await getStudioSession(sessionId)
  if (!session) return { success: false, error: "الجلسة غير موجودة" }

  // 1. Ensure the shared intelligence exists (reuse > persisted > generate).
  let intelligence = opts.intelligence ?? null
  if (!intelligence?.episode_essence) {
    const persisted = await getEpisodeIntelligenceForSession(sessionId)
    if (persisted?.status === "ready" && persisted.data?.episode_essence) {
      intelligence = persisted.data
    }
  }
  if (!intelligence?.episode_essence) {
    const transcript = await getTranscriptForSession(sessionId)
    if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
      return { success: false, error: "لا يوجد نص جاهز — اجلب النص التلقائي أولاً" }
    }
    opts.onProgress?.("intelligence")
    const intel = await generateGlobalEpisodeIntelligence(transcript.transcript_clean, session.video_title || "")
    if (!intel.success) {
      return { success: false, error: intel.error || "تعذّر تحليل الحلقة" }
    }
    intelligence = intel.data
    await saveEpisodeIntelligence(sessionId, { status: "ready", data: intel.data, raw_openai_response: intel.raw || null })
  }

  // 2. Gather anchoring context (chapters for ad timing, chosen title).
  const chaptersRec = await getChaptersForSession(sessionId)
  const chapters = chaptersRec?.status === "ready" && Array.isArray(chaptersRec.chapters)
    ? chaptersRec.chapters.map((c) => ({ start_time: c.start_time, title: c.title }))
    : undefined
  const aiOut = await getAiOutputForSession(sessionId)

  // 3. Generate + persist.
  await saveGrowthPackage(sessionId, { status: "generating" })
  const result = await generateGrowthPackage(
    {
      videoTitle: session.video_title || "",
      channelTitle: session.channel_title || null,
      durationSeconds: session.duration_seconds,
      intelligence,
      chapters,
      existingTitle: aiOut?.title_best || null,
    },
    opts.onProgress,
  )

  await saveGrowthPackage(sessionId, {
    status: result.success ? "ready" : "error",
    data: result.data,
    error_message: result.success ? null : result.error || null,
  })

  return result
}
