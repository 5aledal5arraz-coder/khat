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

/** Last-known-good tombstone set — replayed through a transient DB error. */
let lastKnownDeletedIds: Set<string> | null = null

/**
 * Return the set of permanently-deleted episode IDs.
 *
 * FAILS CLOSED, like `getHiddenEpisodeIds` in lib/queries/episodes.ts. It used
 * to return an EMPTY set on any DB error — i.e. "nothing is deleted" — which
 * publishes every tombstoned episode for as long as the list built from that
 * answer is cached. On 2026-10-02 the live sitemap listed exactly the 36
 * tombstoned clips (all 404 on their own page, which re-reads the set) while
 * the uncached /api/episodes listed 41 with none of them.
 *
 * On error: reuse the last good set if there is one; otherwise THROW. The
 * public query layer turns the throw into "no list / no page", the YouTube
 * import into a failed import (never a re-import of a deleted video).
 */
export async function getDeletedEpisodeIds(): Promise<Set<string>> {
  if (!DB_AVAILABLE) return new Set()
  try {
    const rows = await db!
      .select({ episode_id: deletedEpisodes.episode_id })
      .from(deletedEpisodes)
    lastKnownDeletedIds = new Set(rows.map((r) => r.episode_id))
    return lastKnownDeletedIds
  } catch (error) {
    if (lastKnownDeletedIds) {
      console.error(
        `[deleted-episodes] Failed to read tombstones — reusing the last known set of ${lastKnownDeletedIds.size}:`,
        error,
      )
      return lastKnownDeletedIds
    }
    console.error(
      "[deleted-episodes] Failed to read tombstones and no previous set is cached — failing CLOSED:",
      error,
    )
    throw new Error("deleted_episodes unavailable — cannot vouch that no listed episode is deleted")
  }
}

/**
 * Array variant — the admin episodes screen. Degrades to [] (that screen only
 * badges deleted rows; it publishes nothing).
 */
export async function listDeletedEpisodeIds(): Promise<string[]> {
  const set = await getDeletedEpisodeIds().catch(() => new Set<string>())
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
