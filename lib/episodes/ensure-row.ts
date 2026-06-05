import { db, USE_DB } from "@/lib/db"
import { episodes as episodesTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getCachedEpisodes } from "@/lib/cache/episode-cache"

/**
 * Ensure a row exists in the `episodes` table for the given episode ID.
 *
 * Many episodes on the admin listing come directly from the YouTube API
 * via the merge layer — they have no row in the `episodes` table until
 * someone edits something that writes to the DB. Admin actions that
 * persist to `episodes` (assigning a guest, assigning a category, etc.)
 * would silently be a no-op against those YouTube-only episodes because
 * `UPDATE episodes WHERE id = ?` affects zero rows.
 *
 * This helper materializes the YouTube data into the DB so subsequent
 * updates can actually stick.
 *
 * Returns:
 *   - "existed"   — the row was already present in the DB
 *   - "inserted"  — the row was materialized from YouTube cache
 *   - "not-found" — the id isn't in the DB OR the YouTube cache; the caller
 *                   should treat this as a hard failure.
 */
export async function ensureEpisodeInDb(
  episodeId: string,
): Promise<"existed" | "inserted" | "not-found"> {
  if (!USE_DB || !db) return "not-found"

  // Fast path: already in DB
  const existing = await db
    .select({ id: episodesTable.id })
    .from(episodesTable)
    .where(eq(episodesTable.id, episodeId))
    .limit(1)
  if (existing.length > 0) return "existed"

  // Look up YouTube data for this id
  let ytEpisode
  try {
    const cached = await getCachedEpisodes()
    ytEpisode = cached.find((e) => e.id === episodeId)
  } catch (err) {
    console.error(
      `[ensureEpisodeInDb] YouTube cache read failed for ${episodeId}:`,
      err,
    )
    return "not-found"
  }

  if (!ytEpisode) {
    console.warn(
      `[ensureEpisodeInDb] Episode ${episodeId} not found in DB or YouTube cache`,
    )
    return "not-found"
  }

  // Uniquify slug against the DB (the slug unique constraint otherwise
  // fails the insert when two YouTube titles produce the same slug).
  let slug = ytEpisode.slug || ytEpisode.id
  const slugMatches = await db
    .select({ slug: episodesTable.slug })
    .from(episodesTable)
    .where(eq(episodesTable.slug, slug))
    .limit(1)
  if (slugMatches.length > 0) {
    const suffix = episodeId.slice(0, 6).toLowerCase()
    slug = `${slug}-${suffix}`
  }

  try {
    await db
      .insert(episodesTable)
      .values({
        id: ytEpisode.id,
        title: ytEpisode.title,
        slug,
        description: ytEpisode.description || null,
        youtube_url: ytEpisode.youtube_url,
        duration_minutes: ytEpisode.duration_minutes || 0,
        release_date: ytEpisode.release_date,
        episode_number: ytEpisode.episode_number ?? null,
        season: ytEpisode.season ?? null,
        thumbnail_url: ytEpisode.thumbnail_url || null,
        status: "published",
        featured: false,
        view_count: ytEpisode.view_count ?? 0,
      })
      .onConflictDoNothing({ target: episodesTable.id })

    console.info(`[ensureEpisodeInDb] Materialized ${episodeId} from YouTube cache`)
    return "inserted"
  } catch (err) {
    console.error(`[ensureEpisodeInDb] Insert failed for ${episodeId}:`, err)
    return "not-found"
  }
}
