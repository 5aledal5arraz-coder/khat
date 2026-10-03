/**
 * Episode rows from YouTube metadata + the idempotent UPSERT (B2 step 4).
 *
 * Every write is `INSERT … ON CONFLICT (youtube_video_id) DO UPDATE`, so a
 * retried page, a resumed crawl or a second full initial crawl creates zero
 * duplicates. An update refreshes the metadata only (title, description,
 * views, availability, duration, last_seen_at, metadata_hash) and NEVER
 * touches downstream state — guest_extraction_status, content_kind and every
 * appearance survive — with one exception: an episode that was `skipped`
 * only because it was not yet eligible (an upcoming live that has since
 * become a 90-minute recording) is re-opened to `pending`.
 */
import { createHash } from "node:crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  podcastEpisodes,
  type PodcastAvailability,
  type PodcastDurationClass,
  type PodcastExtractionStatus,
  type PodcastRegistryType,
} from "@/lib/db/schema/podcast-universe"
import { durationClass, parseIsoDuration } from "./duration"
import type { YtPlaylistItem, YtVideoItem } from "./youtube"

export interface EpisodeRow {
  channel_id: string
  youtube_video_id: string
  title: string
  description: string | null
  published_at: Date
  duration_seconds: number
  view_count: number | null
  view_count_checked_at: Date
  language: string | null
  duration_class: PodcastDurationClass
  availability_status: PodcastAvailability
  guest_extraction_status: PodcastExtractionStatus
  metadata_hash: string
  raw_metadata: Record<string, unknown>
}

/** Only CORE_INTERVIEW × CORE_LONGFORM enters automatic extraction (Decision 2/11, B6). */
export function isExtractionEligible(registryType: PodcastRegistryType, cls: PodcastDurationClass): boolean {
  return registryType === "core_interview" && cls === "core_longform"
}

export function availabilityOf(privacy: string | undefined | null): PodcastAvailability {
  if (privacy === "public" || privacy === "unlisted") return "public"
  if (privacy === "private") return "private"
  return "unknown"
}

export function metadataHash(v: YtVideoItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        v.snippet?.title ?? "",
        v.snippet?.description ?? "",
        v.contentDetails?.duration ?? "",
        v.status?.privacyStatus ?? "",
      ]),
    )
    .digest("hex")
}

/**
 * videos.list item → row. Returns null (with a reason) when the item cannot
 * be indexed honestly — never a fabricated duration or date.
 */
export function episodeRowFromVideo(
  v: YtVideoItem,
  channelId: string,
  registryType: PodcastRegistryType,
  now: Date = new Date(),
): { row: EpisodeRow } | { row: null; reason: string } {
  const seconds = parseIsoDuration(v.contentDetails?.duration)
  if (seconds == null) return { row: null, reason: `unreadable duration "${v.contentDetails?.duration ?? ""}"` }
  const published = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null
  if (!published || Number.isNaN(published.getTime())) return { row: null, reason: "missing publishedAt" }
  const cls = durationClass(seconds)
  const views = v.statistics?.viewCount != null ? Number(v.statistics.viewCount) : null
  return {
    row: {
      channel_id: channelId,
      youtube_video_id: v.id,
      title: v.snippet?.title ?? "",
      description: v.snippet?.description ?? null,
      published_at: published,
      duration_seconds: seconds,
      view_count: views != null && Number.isFinite(views) ? views : null,
      view_count_checked_at: now,
      language: v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? null,
      duration_class: cls,
      availability_status: availabilityOf(v.status?.privacyStatus),
      guest_extraction_status: isExtractionEligible(registryType, cls) ? "pending" : "skipped",
      metadata_hash: metadataHash(v),
      raw_metadata: {
        channelId: v.snippet?.channelId ?? null,
        liveBroadcastContent: v.snippet?.liveBroadcastContent ?? null,
        privacyStatus: v.status?.privacyStatus ?? null,
        uploadStatus: v.status?.uploadStatus ?? null,
        isoDuration: v.contentDetails?.duration ?? null,
      },
    },
  }
}

/** Why a playlist id came back without a videos.list item. */
export function unavailableKind(item: YtPlaylistItem | undefined): PodcastAvailability {
  const title = item?.snippet?.title ?? ""
  if (title === "Deleted video") return "deleted"
  if (item?.status?.privacyStatus === "private" || title === "Private video") return "private"
  return "unavailable"
}

/**
 * UPSERT rows on youtube_video_id. Returns how many were inserted vs updated.
 * `(xmax = 0)` is true exactly for a freshly inserted tuple.
 */
export async function upsertEpisodes(rows: EpisodeRow[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 }
  if (!db) throw new Error("Database not configured")
  const out = await db
    .insert(podcastEpisodes)
    .values(rows.map((r) => ({ ...r, first_seen_at: r.view_count_checked_at, last_seen_at: r.view_count_checked_at })))
    .onConflictDoUpdate({
      target: podcastEpisodes.youtube_video_id,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        published_at: sql`excluded.published_at`,
        duration_seconds: sql`excluded.duration_seconds`,
        duration_class: sql`excluded.duration_class`,
        view_count: sql`excluded.view_count`,
        view_count_checked_at: sql`excluded.view_count_checked_at`,
        language: sql`COALESCE(excluded.language, ${podcastEpisodes.language})`,
        availability_status: sql`excluded.availability_status`,
        metadata_hash: sql`excluded.metadata_hash`,
        raw_metadata: sql`excluded.raw_metadata`,
        last_seen_at: sql`excluded.last_seen_at`,
        updated_at: sql`now()`,
        // Downstream state is preserved; only a not-yet-eligible skip re-opens.
        guest_extraction_status: sql`CASE
          WHEN ${podcastEpisodes.guest_extraction_status} = 'skipped'
           AND excluded.guest_extraction_status = 'pending'
           AND ${podcastEpisodes.guest_extraction_note} IS NULL
          THEN 'pending'
          ELSE ${podcastEpisodes.guest_extraction_status} END`,
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` })
  const inserted = out.filter((r) => r.inserted).length
  return { inserted, updated: out.length - inserted }
}

/** Which of `ids` are already indexed (any channel). */
export async function knownVideoIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0 || !db) return new Set()
  const res = await db.execute(sql`
    SELECT youtube_video_id FROM podcast_episodes
    WHERE youtube_video_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `)
  return new Set((res.rows as Array<{ youtube_video_id: string }>).map((r) => r.youtube_video_id))
}

/** A previously indexed video that videos.list no longer returns. */
export async function markUnavailable(videoId: string, status: PodcastAvailability, now: Date): Promise<void> {
  if (!db) return
  await db.execute(sql`
    UPDATE podcast_episodes
    SET availability_status = ${status}, last_seen_at = ${now.toISOString()}, updated_at = now()
    WHERE youtube_video_id = ${videoId}
  `)
}
