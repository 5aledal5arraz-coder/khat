import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ensureEpisodeInDb } from "./ensure-row"

/**
 * Assign a guest to an episode by updating episodes.guest_id directly.
 * Pass null to unlink the guest.
 *
 * If the episode has no row in the DB yet (because it's sourced from the
 * YouTube API), the row is materialized first so the update can persist.
 *
 * Returns the number of rows actually updated.
 */
export async function assignGuestToEpisode(
  episodeId: string,
  guestId: string | null,
): Promise<number> {
  const status = await ensureEpisodeInDb(episodeId)
  if (status === "not-found") {
    throw new Error(`Episode ${episodeId} not found in DB or YouTube cache`)
  }

  const result = await db!
    .update(episodes)
    .set({ guest_id: guestId, updated_at: new Date() })
    .where(eq(episodes.id, episodeId))
    .returning({ id: episodes.id })

  console.info(
    `[assignGuestToEpisode] episode=${episodeId} guest=${guestId ?? "null"} rows=${result.length}`,
  )
  return result.length
}
