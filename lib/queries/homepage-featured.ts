import { db } from "@/lib/db"
import { homepageFeatured } from "@/lib/db/schema/content"
import { episodes, guests } from "@/lib/db/schema"
import { eq, asc, desc, and, ne } from "drizzle-orm"
import { getHomepageMode } from "./homepage-settings"
import type { MuseumEpisode } from "@/lib/content/museum-data"

export interface HomepageFeaturedRow {
  id: string
  position: number
  episode_id: string
  custom_quote: string | null
  custom_description: string | null
  custom_image: string | null
  updated_at: Date | null
}

/** Get all featured episode selections ordered by position */
export async function getHomepageFeatured(): Promise<HomepageFeaturedRow[]> {
  // A3 — DB-null guard. Empty array is the documented fallback for
  // homepage rendering; matches the catch-fallback for transient errors.
  if (!db) return []
  try {
    return await db
      .select()
      .from(homepageFeatured)
      .orderBy(asc(homepageFeatured.position))
  } catch {
    return []
  }
}

/** Save featured episodes (replaces all positions) */
export async function saveHomepageFeatured(
  items: {
    position: number
    episode_id: string
    custom_quote?: string
    custom_description?: string
    custom_image?: string
  }[]
): Promise<void> {
  await db!.delete(homepageFeatured)
  if (items.length === 0) return

  await db!.insert(homepageFeatured).values(
    items.map((item) => ({
      position: item.position,
      episode_id: item.episode_id,
      custom_quote: item.custom_quote || null,
      custom_description: item.custom_description || null,
      custom_image: item.custom_image || null,
    }))
  )
}

/** Get latest 3 published episodes (for auto mode) */
export async function getLatestEpisodesForHomepage(): Promise<
  { id: string; title: string; slug: string; description: string | null; youtube_url: string; thumbnail_url: string | null; episode_number: number | null; guest_id: string | null; release_date: string }[]
> {
  // A3 — DB-null guard.
  if (!db) return []
  try {
    return await db
      .select({
        id: episodes.id,
        title: episodes.title,
        slug: episodes.slug,
        description: episodes.description,
        youtube_url: episodes.youtube_url,
        thumbnail_url: episodes.thumbnail_url,
        episode_number: episodes.episode_number,
        guest_id: episodes.guest_id,
        release_date: episodes.release_date,
      })
      .from(episodes)
      .where(and(eq(episodes.status, "published"), ne(episodes.youtube_url, "")))
      .orderBy(desc(episodes.release_date))
      .limit(3)
  } catch {
    return []
  }
}

/** Build a MuseumEpisode from DB episode + optional featured row */
async function buildMuseumEpisode(
  ep: { id: string; title: string; youtube_url: string; thumbnail_url: string | null; episode_number: number | null; guest_id: string | null; description: string | null },
  featured?: typeof homepageFeatured.$inferSelect | null
): Promise<MuseumEpisode> {
  let guestName = ""
  // A3 — guard the guest-name lookup. If DB is null, fall back to
  // empty guestName; the museum card renders without it.
  if (ep.guest_id && db) {
    const [guest] = await db
      .select({ name: guests.name })
      .from(guests)
      .where(eq(guests.id, ep.guest_id))
      .limit(1)
    if (guest) guestName = guest.name
  }

  const videoId = ep.youtube_url?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || ""

  return {
    id: videoId,
    title: ep.title,
    guestName,
    number: ep.episode_number ? `المعرض ٠${String(ep.episode_number).padStart(2, "0")}` : "",
    quote: featured?.custom_quote || "",
    description: featured?.custom_description || ep.description || "",
    imageUrl: featured?.custom_image || ep.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ""),
    youtubeUrl: ep.youtube_url || "",
    transcript: "",
  }
}

/** Get featured episodes as MuseumEpisode[] for the homepage. Returns null if none configured. */
export async function getHomepageFeaturedEpisodes(): Promise<MuseumEpisode[] | null> {
  // A3 — DB-null guard. Returning null signals "use the static
  // homepage default"; matches the catch-fallback for transient errors.
  if (!db) return null
  try {
    const mode = await getHomepageMode("featured")

    if (mode === "auto") {
      const latestEps = await getLatestEpisodesForHomepage()
      if (latestEps.length === 0) return null

      // Check if we have any custom content stored for these episodes
      const featured = await getHomepageFeatured()
      const featuredByEpId = new Map(featured.map((f) => [f.episode_id, f]))

      const results = await Promise.all(
        latestEps.map((ep) => buildMuseumEpisode(ep, featuredByEpId.get(ep.id)))
      )
      return results.length > 0 ? results : null
    }

    // Manual mode: use saved selections
    const featured = await db
      .select()
      .from(homepageFeatured)
      .orderBy(asc(homepageFeatured.position))

    if (featured.length === 0) return null

    const results: MuseumEpisode[] = []
    for (const f of featured) {
      const [ep] = await db
        .select()
        .from(episodes)
        .where(eq(episodes.id, f.episode_id))
        .limit(1)
      if (!ep) continue
      results.push(await buildMuseumEpisode(ep, f))
    }

    return results.length > 0 ? results : null
  } catch {
    return null
  }
}
