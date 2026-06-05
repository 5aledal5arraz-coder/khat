/**
 * Khat Brain Phase 4 — YouTube performance refresh handler.
 *
 * Pulls latest view/like/comment counts from YouTube for one episode,
 * writes a row into `performance_snapshots` (time-series), updates
 * `episodes.view_count` for the public-facing surface, and walks the
 * linked EIR to "analyzing".
 *
 * Limitation: retention_pct is NOT exposed by the public YouTube Data
 * API v3. Filling that field requires the YouTube Analytics API
 * (channel-owner OAuth scope). Until that's wired, retention stays
 * null on every snapshot.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { performanceSnapshots } from "@/lib/db/schema/studio-analysis"
import { syncEirOnPerformanceWrite } from "@/lib/khat-brain"
import { registerHandler } from "../registry"

interface YoutubePerfPayload {
  /** EIR id — required so we can walk the phase. */
  eir_id: string
  /** Episode row id — used for the back-reference on the snapshot. */
  episode_id: string
  /** YouTube video id (the 11-char one). */
  video_id: string
}

interface YoutubePerfResult extends Record<string, unknown> {
  eir_id: string
  episode_id: string
  video_id: string
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  walked: string
}

registerHandler<YoutubePerfPayload, YoutubePerfResult>(
  "youtube.refresh_performance",
  async (payload, ctx) => {
    if (!payload.eir_id || !payload.episode_id || !payload.video_id) {
      throw new Error(
        `youtube.refresh_performance: payload requires eir_id, episode_id, video_id (got ${JSON.stringify(payload)})`,
      )
    }

    // Lazy-imported to keep the module load light.
    const { getVideosByIds } = await import("@/lib/youtube/client")

    const videos = await getVideosByIds([payload.video_id])
    if (videos.length === 0) {
      throw new Error(`YouTube returned no data for video ${payload.video_id}`)
    }
    const v = videos[0]

    // Persist a fresh snapshot row.
    await db!.insert(performanceSnapshots).values({
      eir_id: payload.eir_id,
      episode_id: payload.episode_id,
      view_count: String(v.viewCount),
      like_count: String(v.likeCount),
      comment_count: String(v.commentCount),
      source: "youtube_api",
      raw: {
        video_id: v.id,
        published_at: v.publishedAt,
        duration: v.duration,
        duration_seconds: v.durationSeconds,
      },
    })

    // Update the public-facing `episodes.view_count` so listings reflect
    // the freshest number without re-querying YouTube on every page hit.
    await db!
      .update(episodes)
      .set({ view_count: v.viewCount, updated_at: new Date() })
      .where(eq(episodes.id, payload.episode_id))

    // Walk the EIR to "analyzing". Monotonic — skip if already at
    // analyzing/learned/archived.
    const walk = await syncEirOnPerformanceWrite({ eirId: payload.eir_id })

    return {
      eir_id: payload.eir_id,
      episode_id: payload.episode_id,
      video_id: payload.video_id,
      view_count: v.viewCount,
      like_count: v.likeCount,
      comment_count: v.commentCount,
      walked: walk,
      worker: ctx.workerId,
    }
  },
)
