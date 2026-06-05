/**
 * YouTube Data API v3 retriever.
 *
 * Searches YouTube for a query, fetches view counts, returns normalized
 * raw sources. Throws on any non-ok response or network failure so the
 * pipeline orchestrator can surface the real error — no silent swallowing.
 */

import type { RawRetrievedSource } from "./types"

interface YouTubeSearchItem {
  id: { videoId?: string }
  snippet: {
    title: string
    description: string
    channelTitle: string
    publishedAt: string
  }
}

interface YouTubeVideoDetail {
  id: string
  snippet: {
    title: string
    description: string
    channelTitle: string
    publishedAt: string
  }
  statistics?: { viewCount?: string; likeCount?: string }
}

interface YouTubeErrorResponse {
  error?: {
    code?: number
    message?: string
    status?: string
    errors?: Array<{ reason?: string; message?: string }>
  }
}

async function callYouTube<T>(url: URL, label: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const json = (await res.json()) as T & YouTubeErrorResponse
  if (!res.ok || json.error) {
    const err = json.error
    const reason = err?.errors?.[0]?.reason || err?.status || "unknown"
    const message = err?.message || `${label} failed with HTTP ${res.status}`
    throw new Error(`YouTube ${label} ${res.status} [${reason}]: ${message}`)
  }
  return json
}

export async function youtubeSearch(
  query: string,
  maxResults = 6,
): Promise<RawRetrievedSource[]> {
  // Prefer an unrestricted server key if provided; fall back to the main key.
  const key = process.env.YOUTUBE_API_KEY2 || process.env.YOUTUBE_API_KEY
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured")

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search")
  searchUrl.searchParams.set("part", "snippet")
  searchUrl.searchParams.set("q", query)
  searchUrl.searchParams.set("type", "video")
  searchUrl.searchParams.set("maxResults", String(maxResults))
  searchUrl.searchParams.set("relevanceLanguage", "ar")
  searchUrl.searchParams.set("key", key)

  const searchData = await callYouTube<{ items?: YouTubeSearchItem[] }>(searchUrl, "search.list")
  const videoIds = (searchData.items ?? [])
    .map((i) => i.id.videoId)
    .filter((v): v is string => Boolean(v))

  if (videoIds.length === 0) return []

  const detailUrl = new URL("https://www.googleapis.com/youtube/v3/videos")
  detailUrl.searchParams.set("part", "snippet,statistics")
  detailUrl.searchParams.set("id", videoIds.join(","))
  detailUrl.searchParams.set("key", key)
  const detailData = await callYouTube<{ items?: YouTubeVideoDetail[] }>(detailUrl, "videos.list")

  const sources: RawRetrievedSource[] = (detailData.items ?? [])
    .map((v) => ({
      provider: "youtube" as const,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      publisher: v.snippet.channelTitle,
      published_at: v.snippet.publishedAt,
      snippet: (v.snippet.description || "").slice(0, 600),
      metrics: {
        view_count: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined,
        like_count: v.statistics?.likeCount ? Number(v.statistics.likeCount) : undefined,
      },
    }))
    .sort((a, b) => (b.metrics?.view_count ?? 0) - (a.metrics?.view_count ?? 0))

  return sources
}
