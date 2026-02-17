import type { Episode } from "@/types/database"

/**
 * Merge a YouTube-sourced episode with DB-sourced episode data.
 * DB fields win when non-null/non-empty, except for live stats
 * (view_count, duration_minutes, thumbnail_url) which always come from YouTube.
 */
export function mergeEpisode(
  youtube: Episode,
  db: Partial<Episode> | null
): Episode {
  if (!db) return youtube

  // Fields that always come from YouTube (live stats)
  const youtubeOnlyFields = new Set([
    "view_count",
    "duration_minutes",
    "thumbnail_url",
  ])

  const merged = { ...youtube }

  for (const [key, dbValue] of Object.entries(db)) {
    if (youtubeOnlyFields.has(key)) continue
    if (key === "id") continue // join key, always YouTube

    // DB value wins when present and non-empty
    if (dbValue !== null && dbValue !== undefined && dbValue !== "") {
      if (Array.isArray(dbValue) && dbValue.length === 0) continue
      ;(merged as Record<string, unknown>)[key] = dbValue
    }
  }

  return merged
}

/**
 * Merge a list of YouTube episodes with DB episodes by ID.
 * Also includes DB-only episodes (not on YouTube).
 */
export function mergeEpisodeLists(
  youtubeEpisodes: Episode[],
  dbEpisodes: Partial<Episode>[]
): Episode[] {
  const dbMap = new Map<string, Partial<Episode>>()
  for (const ep of dbEpisodes) {
    if (ep.id) dbMap.set(ep.id, ep)
  }

  // Merge YouTube episodes with their DB counterparts
  const merged = youtubeEpisodes.map((ytEp) => {
    const dbEp = dbMap.get(ytEp.id)
    if (dbEp) dbMap.delete(ytEp.id)
    return mergeEpisode(ytEp, dbEp ?? null)
  })

  // Include DB-only episodes (not found on YouTube)
  for (const dbEp of dbMap.values()) {
    if (dbEp.id && dbEp.title && dbEp.youtube_url) {
      merged.push(dbEp as Episode)
    }
  }

  return merged
}
