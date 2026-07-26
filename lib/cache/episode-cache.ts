import { createConfigStore } from "@/lib/config-store"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import type { Episode } from "@/types/database"

interface EpisodeCacheData {
  episodes: Episode[]
  fetchedAt: string | null
  ttlMs: number
}

const DEFAULT_TTL = 12 * 60 * 60 * 1000 // 12 hours

const store = createConfigStore<EpisodeCacheData>("episode-cache.json", {
  episodes: [],
  fetchedAt: null,
  ttlMs: DEFAULT_TTL,
})

function isStale(data: EpisodeCacheData): boolean {
  if (!data.fetchedAt || data.episodes.length === 0) return true
  const age = Date.now() - new Date(data.fetchedAt).getTime()
  return age > data.ttlMs
}

export async function getCachedEpisodes(): Promise<Episode[]> {
  const cached = await store.read()

  if (!isStale(cached)) {
    return cached.episodes
  }

  // Fetch fresh from YouTube
  try {
    const episodes = await fetchAllEpisodes()
    await store.write({
      episodes,
      fetchedAt: new Date().toISOString(),
      ttlMs: cached.ttlMs || DEFAULT_TTL,
    })
    return episodes
  } catch (error) {
    console.error("Failed to fetch episodes, using stale cache:", error)
    // Return stale data if available
    if (cached.episodes.length > 0) return cached.episodes
    throw error
  }
}

/**
 * Read the cached YouTube snapshot WITHOUT triggering a refresh.
 *
 * `getCachedEpisodes()` refreshes on a stale read, which means calling it
 * from a page render can fire a YouTube Data API request inside that
 * render — unbounded network latency plus quota, on whichever request
 * happens to be the unlucky one after the 12h TTL expires. Callers that
 * only need to REPORT on the archive (counters, status tiles) use this
 * instead and say how fresh the answer is; the refresh stays with the
 * callers that actually serve the episode list.
 */
export async function peekCachedEpisodes(): Promise<{
  episodes: Episode[]
  stale: boolean
  fetchedAt: string | null
}> {
  const cached = await store.read()
  return {
    episodes: cached.episodes,
    stale: isStale(cached),
    fetchedAt: cached.fetchedAt,
  }
}

export async function invalidateEpisodeCache(): Promise<void> {
  const cached = await store.read()
  await store.write({
    ...cached,
    fetchedAt: null, // Forces stale on next read
  })
}

export async function getCacheStatus(): Promise<{
  episodeCount: number
  fetchedAt: string | null
  isStale: boolean
  ttlMs: number
}> {
  const cached = await store.read()
  return {
    episodeCount: cached.episodes.length,
    fetchedAt: cached.fetchedAt,
    isStale: isStale(cached),
    ttlMs: cached.ttlMs,
  }
}
