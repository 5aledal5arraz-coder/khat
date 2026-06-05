import { db } from "@/lib/db"
import { eq, desc } from "drizzle-orm"
import { studioSessions } from "@/lib/db/schema/studio"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import fs from "fs/promises"
import path from "path"
import { deleteEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { deleteEpisodeOverride } from "@/lib/episodes/overrides"
import { deleteEpisodeQuotesEntry } from "@/lib/episodes/quotes"
import { getWebsitePackageForSession } from "./website-packages"
import type { StudioSession } from "@/types/database"
import { resolveEirForStudioSession } from "@/lib/khat-brain/studio-resolver"

const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

export async function getStudioSessions(): Promise<StudioSession[]> {
  try {
    const rows = await db!.select().from(studioSessions).orderBy(desc(studioSessions.created_at))
    return rows as unknown as StudioSession[]
  } catch (err) {
    console.error("Error fetching studio sessions:", err)
    return []
  }
}

export async function getStudioSession(id: string): Promise<StudioSession | null> {
  try {
    const rows = await db!.select().from(studioSessions).where(eq(studioSessions.id, id))
    return (rows[0] as unknown as StudioSession) ?? null
  } catch {
    return null
  }
}

export async function createStudioSession(
  session: Omit<StudioSession, "id" | "created_at" | "updated_at">,
  /**
   * Optional preparation reference. When set, the session inherits the
   * preparation's eir_id (and the episode's eir_id falls back if the
   * prep doesn't have one). When null, the resolver mints a fresh EIR
   * at phase=producing for orphan studio imports — this keeps every
   * session attached to the spine, even YouTube-only re-uploads.
   */
  options?: { preparationId?: string | null; createdBy?: string | null }
): Promise<{ success: boolean; data?: StudioSession; error?: string }> {
  try {
    const eirId = await resolveEirForStudioSession({
      preparationId: options?.preparationId ?? null,
      episodeId: session.episode_id ?? null,
      youtubeVideoId: session.video_id ?? null,
      videoTitle: session.video_title ?? session.episode_title ?? null,
      sourceType: session.source_type ?? session.source ?? null,
      createdBy: options?.createdBy ?? null,
    })

    const rows = await db!.insert(studioSessions).values({
      youtube_url: session.youtube_url,
      video_id: session.video_id,
      source: session.source,
      status: session.status,
      video_title: session.video_title,
      channel_title: session.channel_title,
      published_at: session.published_at ? new Date(session.published_at) : null,
      duration_seconds: session.duration_seconds,
      thumbnail_url: session.thumbnail_url,
      raw_youtube_response: session.raw_youtube_response,
      audio_filename: session.audio_filename,
      audio_file_size: session.audio_file_size,
      audio_start_seconds: session.audio_start_seconds,
      audio_end_seconds: session.audio_end_seconds,
      audio_best_intro: session.audio_best_intro,
      audio_edit_suggestions: session.audio_edit_suggestions as unknown[] | null,
      episode_id: session.episode_id,
      episode_title: session.episode_title,
      source_type: session.source_type,
      notes: session.notes,
      eir_id: eirId,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioSession }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateStudioSession(
  id: string,
  updates: Partial<StudioSession>
): Promise<{ success: boolean; data?: StudioSession; error?: string }> {
  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioSessions).set(setObj).where(eq(studioSessions.id, id)).returning()
    if (!rows[0]) return { success: false, error: "Session not found" }
    return { success: true, data: rows[0] as unknown as StudioSession }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function deleteStudioSession(id: string): Promise<boolean> {
  // Clean up pushed episode data if this session was linked to an episode
  const pkg = await getWebsitePackageForSession(id)
  if (pkg?.linked_episode_id) {
    try {
      await deleteEpisodeEnrichment(pkg.linked_episode_id)
      await deleteEpisodeOverride(pkg.linked_episode_id)
      await deleteEpisodeQuotesEntry(pkg.linked_episode_id)
    } catch {
      // ignore — config files may not exist
    }
  }

  // Clean up audio files if they exist
  const audioDir = path.join(AUDIO_DIR, id)
  try {
    await fs.rm(audioDir, { recursive: true, force: true })
  } catch {
    // ignore — directory may not exist for YouTube sessions
  }

  try {
    await db!.transaction(async (tx) => {
      // All Studio outputs now live in studio_analysis_records, keyed
      // on studio_session_id. One DELETE clears every kind for this
      // session in a single statement.
      await tx
        .delete(studioAnalysisRecords)
        .where(eq(studioAnalysisRecords.studio_session_id, id))
      await tx.delete(studioSessions).where(eq(studioSessions.id, id))
    })
    return true
  } catch {
    return false
  }
}
