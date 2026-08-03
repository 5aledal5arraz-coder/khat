import { db } from "@/lib/db"
import { eq, desc } from "drizzle-orm"
import { studioSessions } from "@/lib/db/schema/studio"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import fs from "fs/promises"
import path from "path"
import type { StudioSession } from "@/types/database"
import { resolveEirForStudioSession } from "@/lib/khat-brain/studio-resolver"
import { AUDIO_DIR } from "./audio-path"

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

/**
 * Every session recorded from one YouTube video, newest first.
 *
 * `episodes.id` IS the YouTube video id, so this is how an episode
 * reaches its transcript when no operator ever linked a website package
 * to it. Several sessions can share a video (a failed import plus a good
 * one), which is why this returns the list and not a single row — the
 * caller picks the one that actually carries a ready transcript.
 */
export async function getStudioSessionsByVideoId(videoId: string): Promise<StudioSession[]> {
  try {
    const rows = await db!
      .select()
      .from(studioSessions)
      .where(eq(studioSessions.video_id, videoId))
      .orderBy(desc(studioSessions.created_at))
    return rows as unknown as StudioSession[]
  } catch (err) {
    console.error("Error fetching studio sessions by video id:", err)
    return []
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
      audio_stage: session.audio_stage ?? null,
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

export type DeleteStudioSessionResult =
  | { success: true }
  | { success: false; reason: "not_found" | "failed"; error?: string }

/**
 * ص-٢ — deleting a studio session deletes THE SESSION. Nothing else.
 *
 * It used to also hard-delete `episode_enrichments`, `episode_overrides`
 * and `episode_quotes_config` for the linked episode — outside the
 * transaction, behind an empty `catch {}` that swallowed the first
 * failure, skipped the remaining deletes, and still returned `true`. So
 * a routine "clean up the failed session" silently wiped a PUBLISHED
 * episode's summary, takeaways, timestamps and quotes off the public
 * site, with no confirmation, no audit trail and no way back — and,
 * because the link was inferred from the video id (ص-٣), it hit the
 * episode belonging to the OTHER session on the same video.
 *
 * Resetting an episode is a separate, deliberate action that already
 * exists with its own two-step confirmation:
 *   DELETE /api/admin/episodes/[id]/enrichments  ("استعادة الحلقة")
 * It is not a side effect of housekeeping.
 */
export async function deleteStudioSession(
  id: string,
): Promise<DeleteStudioSessionResult> {
  const existing = await getStudioSession(id)
  if (!existing) return { success: false, reason: "not_found" }

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
  } catch (err) {
    // No more silent `false`. A DB failure here is a DB failure, not a
    // missing session — the caller must be able to tell them apart.
    console.error(`[studio] deleteStudioSession(${id}) failed:`, err)
    return {
      success: false,
      reason: "failed",
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // Audio files last: the row is already gone, so a leftover directory
  // is disk noise, not data loss. Still reported rather than swallowed.
  try {
    await fs.rm(path.join(AUDIO_DIR, id), { recursive: true, force: true })
  } catch (err) {
    console.error(`[studio] audio cleanup for session ${id} failed:`, err)
  }

  return { success: true }
}
