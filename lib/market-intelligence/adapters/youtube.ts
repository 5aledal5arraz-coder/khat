/**
 * Phase X Step 1 — YouTube market signal adapter.
 *
 * Two-call sequence: search.list → videos.list. We need the second call
 * because search.list does not include statistics (view counts).
 *
 * Hard requirement: YOUTUBE_API_KEY env var. Returns `configured: false`
 * cleanly when missing — never throws.
 */

import { env } from "@/lib/env"
import type { MarketCollectionResult, MarketRawSignal } from "./types"

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

export async function collectYoutubeTopic(
  query: string,
  language: string,
  maxResults = 10,
): Promise<MarketCollectionResult> {
  if (!env.YOUTUBE_API_KEY) {
    return {
      source: "youtube",
      configured: false,
      note: "YOUTUBE_API_KEY not set",
      signals: [],
    }
  }

  // ── 1. search.list — find candidate video ids ─────────────────────
  const searchUrl = new URL(SEARCH_URL)
  searchUrl.searchParams.set("part", "snippet")
  searchUrl.searchParams.set("q", query)
  searchUrl.searchParams.set("type", "video")
  searchUrl.searchParams.set("maxResults", String(Math.min(maxResults, 25)))
  if (language === "ar" || language === "en") {
    searchUrl.searchParams.set("relevanceLanguage", language)
  }

  let searchPayload: {
    items?: Array<{ id?: { videoId?: string } }>
  } = {}
  try {
    const res = await fetch(searchUrl.toString(), {
      headers: { "X-goog-api-key": env.YOUTUBE_API_KEY },
    })
    if (!res.ok) {
      return {
        source: "youtube",
        configured: true,
        note: `YouTube search ${res.status}`,
        signals: [],
      }
    }
    searchPayload = (await res.json()) as typeof searchPayload
  } catch (err) {
    return {
      source: "youtube",
      configured: true,
      note: err instanceof Error ? err.message : "search fetch failed",
      signals: [],
    }
  }

  const ids = (searchPayload.items ?? [])
    .map((it) => it.id?.videoId)
    .filter((v): v is string => Boolean(v))
  if (ids.length === 0) {
    return { source: "youtube", configured: true, signals: [] }
  }

  // ── 2. videos.list — pull statistics ──────────────────────────────
  const videosUrl = new URL(VIDEOS_URL)
  videosUrl.searchParams.set("part", "snippet,statistics")
  videosUrl.searchParams.set("id", ids.join(","))

  let videosPayload: {
    items?: Array<{
      id?: string
      snippet?: {
        title?: string
        description?: string
        defaultLanguage?: string
        defaultAudioLanguage?: string
      }
      statistics?: {
        viewCount?: string
        likeCount?: string
        commentCount?: string
      }
    }>
  } = {}
  try {
    const res = await fetch(videosUrl.toString(), {
      headers: { "X-goog-api-key": env.YOUTUBE_API_KEY },
    })
    if (!res.ok) {
      return {
        source: "youtube",
        configured: true,
        note: `YouTube videos ${res.status}`,
        signals: [],
      }
    }
    videosPayload = (await res.json()) as typeof videosPayload
  } catch (err) {
    return {
      source: "youtube",
      configured: true,
      note: err instanceof Error ? err.message : "videos fetch failed",
      signals: [],
    }
  }

  const signals: MarketRawSignal[] = []
  for (const item of videosPayload.items ?? []) {
    const id = item.id
    const title = item.snippet?.title?.trim()
    if (!id || !title) continue
    const detected =
      item.snippet?.defaultAudioLanguage ??
      item.snippet?.defaultLanguage ??
      language
    const views = item.statistics?.viewCount
      ? Number(item.statistics.viewCount)
      : null
    signals.push({
      source: "youtube",
      external_id: id,
      title,
      description: item.snippet?.description ?? null,
      language: detected,
      view_signal: Number.isFinite(views) ? views : null,
      raw: item as Record<string, unknown>,
    })
  }
  return { source: "youtube", configured: true, signals }
}
