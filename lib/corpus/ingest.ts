/**
 * Corpus ingestion — pull a source's YouTube catalogue into corpus_episodes.
 *
 * Reuses the existing YouTube client (getChannelVideos etc.) — the same code
 * that syncs Khat's own channel — pointed at any channel. Metadata only here
 * (Phase B1); transcripts (B2) and derived intelligence (B3) come later.
 *
 * Engagement is normalized per source: engagement_index = views / that source's
 * median views, so a small show and a huge show compare on the same footing.
 */

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { corpusEpisodes } from "@/lib/db/schema/corpus"
import {
  getChannelIdFromHandle,
  getChannelIdFromSearch,
  getChannelVideos,
  type YouTubeVideo,
} from "@/lib/youtube/client"
import { CORPUS_SOURCES, type CorpusSource } from "./sources"

export interface IngestResult {
  slug: string
  channel_id: string | null
  fetched: number
  upserted: number
  error?: string
}

/** Resolve a source to a channel id: explicit id → @handle → search query. */
export async function resolveChannelId(source: CorpusSource): Promise<string | null> {
  if (source.channel_id) return source.channel_id
  if (source.handle) {
    const id = await getChannelIdFromHandle(source.handle)
    if (id) return id
  }
  if (source.search_query) {
    return getChannelIdFromSearch(source.search_query)
  }
  return null
}

/** Median of a numeric list (0 when empty). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export async function ingestSource(source: CorpusSource): Promise<IngestResult> {
  if (!db) return { slug: source.slug, channel_id: null, fetched: 0, upserted: 0, error: "no db" }
  const channelId = await resolveChannelId(source)
  if (!channelId) {
    return { slug: source.slug, channel_id: null, fetched: 0, upserted: 0, error: "could not resolve channel" }
  }

  const videos = await getChannelVideos(channelId, source.max_episodes ?? 300)
  // Median views across THIS pull → per-source engagement baseline.
  const med = median(videos.map((v) => v.viewCount).filter((n) => n > 0))

  let upserted = 0
  for (const v of videos) {
    await upsertEpisode(source, channelId, v, med)
    upserted++
  }
  return { slug: source.slug, channel_id: channelId, fetched: videos.length, upserted }
}

async function upsertEpisode(
  source: CorpusSource,
  channelId: string,
  v: YouTubeVideo,
  medianViews: number,
): Promise<void> {
  const engagement = medianViews > 0 ? v.viewCount / medianViews : null
  const values = {
    source_slug: source.slug,
    is_khat: !!source.is_khat,
    platform: "youtube",
    external_id: v.id,
    channel_id: channelId,
    title: v.title,
    description: v.description,
    published_at: v.publishedAt ? new Date(v.publishedAt) : null,
    duration_seconds: v.durationSeconds,
    view_count: v.viewCount,
    like_count: v.likeCount,
    comment_count: v.commentCount,
    engagement_index: engagement,
    updated_at: new Date(),
  }
  await db!
    .insert(corpusEpisodes)
    .values(values)
    .onConflictDoUpdate({
      target: [corpusEpisodes.source_slug, corpusEpisodes.external_id],
      set: {
        title: values.title,
        description: values.description,
        view_count: values.view_count,
        like_count: values.like_count,
        comment_count: values.comment_count,
        engagement_index: values.engagement_index,
        duration_seconds: values.duration_seconds,
        updated_at: values.updated_at,
      },
    })
}

/** Ingest every configured source (or a subset by slug). Continues past failures. */
export async function ingestAllSources(opts: { only?: string[] } = {}): Promise<IngestResult[]> {
  const sources = opts.only
    ? CORPUS_SOURCES.filter((s) => opts.only!.includes(s.slug))
    : CORPUS_SOURCES
  const results: IngestResult[] = []
  for (const source of sources) {
    try {
      results.push(await ingestSource(source))
    } catch (err) {
      results.push({
        slug: source.slug,
        channel_id: null,
        fetched: 0,
        upserted: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}

/** Corpus counts by source — quick health check. */
export async function corpusCounts(): Promise<Array<{ source_slug: string; n: number }>> {
  if (!db) return []
  const rows = await db
    .select({ source_slug: corpusEpisodes.source_slug, n: sql<number>`count(*)::int` })
    .from(corpusEpisodes)
    .groupBy(corpusEpisodes.source_slug)
  return rows
}

/** Guard used by tests/health: is a source already ingested? */
export async function sourceHasEpisodes(slug: string): Promise<boolean> {
  if (!db) return false
  const [row] = await db
    .select({ id: corpusEpisodes.id })
    .from(corpusEpisodes)
    .where(and(eq(corpusEpisodes.source_slug, slug)))
    .limit(1)
  return !!row
}
