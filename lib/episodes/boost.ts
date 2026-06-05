import type { Episode } from '@/types/database'

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces deterministic values in [0, 1).
 */
function seededRandom(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Day-based seed that stays stable within a calendar day but rotates daily. */
function getDailySeed(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  )
  return dayOfYear + now.getFullYear() * 366
}

/** Fisher-Yates shuffle using a seeded PRNG. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  const rand = seededRandom(seed)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Calculate the median view count across all episodes. */
export function getMedianViews(episodes: Episode[]): number {
  const views = episodes
    .map((e) => e.view_count ?? 0)
    .sort((a, b) => a - b)

  if (views.length === 0) return 0
  return views[Math.floor(views.length / 2)]
}

/**
 * Pick `count` low-view episodes to highlight as "Hidden Gems".
 * - Below median views
 * - Excludes short clips (< 10 min)
 * - Daily-rotating shuffle (stable within the same day)
 */
export function getHiddenGems(episodes: Episode[], count: number = 5): Episode[] {
  const median = getMedianViews(episodes)
  const pool = episodes.filter(
    (e) => (e.view_count ?? 0) < median && e.duration_minutes >= 10
  )

  if (pool.length === 0) return []

  const shuffled = seededShuffle(pool, getDailySeed())
  return shuffled.slice(0, count)
}

/**
 * Interleave boosted (low-view) episodes into a date-sorted array.
 * - Picks below-median episodes from `allEpisodes` not already in `episodes`
 * - Inserts one boost every `interval` positions
 * - No duplicates with the main array or the Hidden Gems row
 */
export function interleaveBoosts(
  episodes: Episode[],
  allEpisodes: Episode[],
  options?: { interval?: number; excludeIds?: Set<string> }
): Episode[] {
  const interval = options?.interval ?? 5
  const excludeIds = options?.excludeIds ?? new Set<string>()

  const mainIds = new Set(episodes.map((e) => e.id))
  const median = getMedianViews(allEpisodes)

  const boostPool = allEpisodes.filter(
    (e) =>
      (e.view_count ?? 0) < median &&
      e.duration_minutes >= 10 &&
      !mainIds.has(e.id) &&
      !excludeIds.has(e.id)
  )

  if (boostPool.length === 0) return episodes

  const shuffled = seededShuffle(boostPool, getDailySeed())

  const result = [...episodes]
  let boostIndex = 0
  for (
    let pos = interval;
    pos <= result.length && boostIndex < shuffled.length;
    pos += interval + 1 // +1 because we just inserted one, shifting positions
  ) {
    result.splice(pos, 0, shuffled[boostIndex])
    boostIndex++
  }

  return result
}
