import { db, USE_DB as DB_AVAILABLE } from "@/lib/db"
import { deletedEpisodes } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"

/**
 * Episode tombstone helpers.
 *
 * Hard-deleted episodes are tracked in the `deleted_episodes` table.
 * Any ID present here is permanently removed from every episode list
 * and detail query, regardless of whether it still exists in YouTube's
 * cache or re-appears on a subsequent sync.
 */

// `deleted_episodes` is created by the baseline migration — no runtime bootstrap.

/** Return the set of permanently-deleted episode IDs. */
export async function getDeletedEpisodeIds(): Promise<Set<string>> {
  if (!DB_AVAILABLE) return new Set()
  try {
    const rows = await db!
      .select({ episode_id: deletedEpisodes.episode_id })
      .from(deletedEpisodes)
    return new Set(rows.map((r) => r.episode_id))
  } catch (error) {
    console.error("[deleted-episodes] Failed to read tombstones:", error)
    return new Set()
  }
}

/** Array variant — useful for passing as a server component prop. */
export async function listDeletedEpisodeIds(): Promise<string[]> {
  const set = await getDeletedEpisodeIds()
  return Array.from(set)
}

/**
 * Insert tombstones for the given episode IDs. Safe to call with ids that
 * are already tombstoned — existing rows are left untouched.
 */
export async function markEpisodesAsDeleted(
  episodeIds: string[],
  deletedBy?: string | null,
): Promise<number> {
  if (!DB_AVAILABLE) return 0
  const clean = episodeIds.filter((id) => typeof id === "string" && id.length > 0)
  if (clean.length === 0) return 0

  try {
    const result = await db!
      .insert(deletedEpisodes)
      .values(
        clean.map((id) => ({
          episode_id: id,
          deleted_by: deletedBy ?? null,
        })),
      )
      .onConflictDoNothing({ target: deletedEpisodes.episode_id })
      .returning({ episode_id: deletedEpisodes.episode_id })
    console.info(
      `[deleted-episodes] Marked ${result.length}/${clean.length} tombstone(s)`,
      result.map((r) => r.episode_id),
    )
    return result.length
  } catch (error) {
    console.error("[deleted-episodes] Failed to mark tombstones:", error)
    return 0
  }
}

/**
 * Remove tombstones (restore episodes). Only used by admin utilities.
 */
export async function restoreDeletedEpisodes(episodeIds: string[]): Promise<number> {
  if (!DB_AVAILABLE) return 0
  const clean = episodeIds.filter((id) => typeof id === "string" && id.length > 0)
  if (clean.length === 0) return 0

  try {
    const result = await db!
      .delete(deletedEpisodes)
      .where(inArray(deletedEpisodes.episode_id, clean))
      .returning({ episode_id: deletedEpisodes.episode_id })
    return result.length
  } catch (error) {
    console.error("[deleted-episodes] Failed to restore tombstones:", error)
    return 0
  }
}
