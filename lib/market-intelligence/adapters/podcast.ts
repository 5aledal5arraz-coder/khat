/**
 * Phase X Step 1 — Apple Podcasts (iTunes Search) market signal adapter.
 *
 * Public iTunes Search API — no key required. Limited: no per-episode
 * play counts are exposed, so `view_signal` is always null for this
 * source. The clustering layer treats null as "use signal_count as the
 * popularity proxy."
 *
 * Country selection: we steer Arabic queries to SA (largest Arabic
 * podcast market) and English queries to US. Override via opts.country.
 */

import type { MarketCollectionResult, MarketRawSignal } from "./types"

const SEARCH_URL = "https://itunes.apple.com/search"

export async function collectPodcastTopic(
  query: string,
  language: string,
  maxResults = 10,
  opts?: { country?: string },
): Promise<MarketCollectionResult> {
  const country =
    opts?.country ?? (language === "ar" ? "SA" : language === "en" ? "US" : "US")

  const url = new URL(SEARCH_URL)
  url.searchParams.set("media", "podcast")
  url.searchParams.set("entity", "podcastEpisode")
  url.searchParams.set("term", query)
  url.searchParams.set("country", country)
  url.searchParams.set("limit", String(Math.min(maxResults, 50)))

  let payload: {
    resultCount?: number
    results?: Array<{
      trackId?: number
      episodeGuid?: string
      trackName?: string
      collectionName?: string
      description?: string
      shortDescription?: string
      artistName?: string
      artworkUrl600?: string
      releaseDate?: string
      genres?: string[]
      country?: string
      trackTimeMillis?: number
    }>
  } = {}

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "khatpodcast-market/1.0" },
    })
    if (!res.ok) {
      return {
        source: "podcast_apple",
        configured: true,
        note: `iTunes ${res.status}`,
        signals: [],
      }
    }
    payload = (await res.json()) as typeof payload
  } catch (err) {
    return {
      source: "podcast_apple",
      configured: true,
      note: err instanceof Error ? err.message : "fetch failed",
      signals: [],
    }
  }

  const signals: MarketRawSignal[] = []
  for (const item of payload.results ?? []) {
    const externalId =
      typeof item.trackId === "number"
        ? String(item.trackId)
        : item.episodeGuid ?? null
    const title = (item.trackName ?? item.collectionName ?? "").trim()
    if (!externalId || !title) continue
    signals.push({
      source: "podcast_apple",
      external_id: externalId,
      title,
      description: item.description ?? item.shortDescription ?? null,
      language,
      view_signal: null,
      raw: item as Record<string, unknown>,
    })
  }
  return { source: "podcast_apple", configured: true, signals }
}
