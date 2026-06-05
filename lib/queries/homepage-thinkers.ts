import { db } from "@/lib/db"
import { homepageThinkers } from "@/lib/db/schema/content"
import { episodes, guests } from "@/lib/db/schema"
import { eq, asc, desc } from "drizzle-orm"
import { getHomepageMode } from "./homepage-settings"
import type { MuseumThinker } from "@/lib/content/museum-data"

export interface HomepageThinkerRow {
  id: string
  position: number
  guest_id: string
  custom_title: string | null
  custom_description: string | null
  custom_image: string | null
  updated_at: Date | null
}

/** Get all thinker selections ordered by position */
export async function getHomepageThinkers(): Promise<HomepageThinkerRow[]> {
  // A3 — DB-null guard. Empty array is the documented fallback for
  // homepage rendering when the DB is unreachable; matches the
  // catch-fallback for transient errors.
  if (!db) return []
  try {
    return await db
      .select()
      .from(homepageThinkers)
      .orderBy(asc(homepageThinkers.position))
  } catch {
    return []
  }
}

/** Save thinkers (replaces all positions) */
export async function saveHomepageThinkers(
  items: {
    position: number
    guest_id: string
    custom_title?: string
    custom_description?: string
    custom_image?: string
  }[]
): Promise<void> {
  await db!.delete(homepageThinkers)
  if (items.length === 0) return

  await db!.insert(homepageThinkers).values(
    items.map((item) => ({
      position: item.position,
      guest_id: item.guest_id,
      custom_title: item.custom_title || null,
      custom_description: item.custom_description || null,
      custom_image: item.custom_image || null,
    }))
  )
}

/** Get latest 3 guests who have episodes (for auto mode), ordered by most recent episode */
export async function getLatestGuestsForHomepage(): Promise<
  { id: string; name: string; bio: string | null; photo_url: string | null; episode_youtube_url: string | null }[]
> {
  // A3 — DB-null guard.
  if (!db) return []
  try {
    // Get latest episodes that have guests, one per guest
    const latestEps = await db
      .select({
        guest_id: episodes.guest_id,
        release_date: episodes.release_date,
        youtube_url: episodes.youtube_url,
      })
      .from(episodes)
      .where(eq(episodes.status, "published"))
      .orderBy(desc(episodes.release_date))
      .limit(50)

    // Deduplicate by guest_id, keeping the first (most recent) occurrence
    const seen = new Set<string>()
    const guestEps: { guest_id: string; youtube_url: string }[] = []
    for (const ep of latestEps) {
      if (ep.guest_id && !seen.has(ep.guest_id)) {
        seen.add(ep.guest_id)
        guestEps.push({ guest_id: ep.guest_id, youtube_url: ep.youtube_url })
        if (guestEps.length >= 3) break
      }
    }

    if (guestEps.length === 0) return []

    // Fetch guest details maintaining order
    const result: { id: string; name: string; bio: string | null; photo_url: string | null; episode_youtube_url: string | null }[] = []
    for (const ge of guestEps) {
      const [guest] = await db
        .select({
          id: guests.id,
          name: guests.name,
          bio: guests.bio,
          photo_url: guests.photo_url,
        })
        .from(guests)
        .where(eq(guests.id, ge.guest_id))
        .limit(1)
      if (guest) result.push({ ...guest, episode_youtube_url: ge.youtube_url })
    }

    return result
  } catch {
    return []
  }
}

/** Get thinkers as MuseumThinker[] for the homepage. Returns null if none configured. */
export async function getHomepageThinkersForDisplay(): Promise<MuseumThinker[] | null> {
  // A3 — DB-null guard. Returning null signals "nothing to render"
  // to the homepage section, which then falls back to its static
  // default. Matches the catch-fallback for transient errors.
  if (!db) return null
  try {
    const mode = await getHomepageMode("thinkers")

    if (mode === "auto") {
      const latestGuests = await getLatestGuestsForHomepage()
      if (latestGuests.length === 0) return null

      // Check for existing custom content
      const thinkers = await getHomepageThinkers()
      const thinkerByGuestId = new Map(thinkers.map((t) => [t.guest_id, t]))

      const results: MuseumThinker[] = latestGuests.map((guest) => {
        const t = thinkerByGuestId.get(guest.id)
        const videoId = guest.episode_youtube_url?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || ""
        return {
          id: guest.id,
          name: guest.name,
          title: t?.custom_title || "",
          description: t?.custom_description || guest.bio || "",
          imageUrl: t?.custom_image || guest.photo_url || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ""),
        }
      })

      return results.length > 0 ? results : null
    }

    // Manual mode: use saved selections
    const rows = await db
      .select()
      .from(homepageThinkers)
      .orderBy(asc(homepageThinkers.position))

    if (rows.length === 0) return null

    const results: MuseumThinker[] = []
    for (const row of rows) {
      const [guest] = await db
        .select()
        .from(guests)
        .where(eq(guests.id, row.guest_id))
        .limit(1)
      if (!guest) continue

      // Fallback: use guest's latest episode thumbnail if no photo
      let imageUrl = guest.photo_url || ""
      if (!imageUrl) {
        const [ep] = await db
          .select({ youtube_url: episodes.youtube_url })
          .from(episodes)
          .where(eq(episodes.guest_id, row.guest_id))
          .orderBy(desc(episodes.release_date))
          .limit(1)
        const videoId = ep?.youtube_url?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || ""
        if (videoId) imageUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      }

      results.push({
        id: guest.id,
        name: guest.name,
        title: row.custom_title || "",
        description: row.custom_description || guest.bio || "",
        imageUrl: row.custom_image || imageUrl,
      })
    }

    return results.length > 0 ? results : null
  } catch {
    return null
  }
}
