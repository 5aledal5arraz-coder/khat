import { db } from "@/lib/db"
import { homepageThinkers } from "@/lib/db/schema/content"
import { guests } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import { getHomepageMode } from "./homepage-settings"
import type { MuseumThinker } from "@/lib/content/museum-data"
import { getEpisodes } from "./episodes"
import { filterLane } from "@/lib/episodes/programs"

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
  { id: string; name: string; slug: string | null; bio: string | null; photo_url: string | null; episode_youtube_url: string | null }[]
> {
  // A3 — DB-null guard.
  if (!db) return []
  try {
    // CONVERSATIONS ONLY — not «مقاطع خط».
    //
    // This used to read `episodes` straight, newest-first by release_date. On
    // today's data that hands the gallery three CLIP thumbnails: the six clips
    // are the most recent rows on the table AND they carry `guest_id`, so they
    // win the dedupe before a single real episode is reached. The face shown
    // for a guest would be a cut-down's cover art, not their conversation.
    //
    // `filterLane(list, "khat")` is the same rule the homepage grid uses, so
    // the gallery and the grid can never disagree about what counts as an
    // episode. It needs resolved categories — hence `withCategories: true`;
    // without it filterLane warns and passes everything through, and the clips
    // come straight back.
    const all = await getEpisodes({ withCategories: true })
    const conversations = filterLane(all, "khat")

    // Deduplicate by guest, keeping the first (most recent) occurrence.
    //
    // READ BOTH `guest.id` AND `guest_id`. A listed episode is a MERGE of the
    // DB row and the YouTube snapshot in `config/episode-cache.json`, and that
    // snapshot has no idea who the guests are — all 77 of its rows carry a null
    // `guest_id`. Depending on which side wins a given field, an episode can
    // arrive with a fully populated `guest` object and a null `guest_id`.
    // Filtering on the scalar alone silently found ONE guest on a database
    // holding twenty, and the section rendered a single card while the grid
    // directly above it printed seven guest names — because the grid reads
    // `ep.guest?.name`. Same data, two shapes; take whichever is there.
    const seen = new Set<string>()
    const guestEps: { guest_id: string; youtube_url: string }[] = []
    for (const ep of conversations) {
      const guestId = ep.guest?.id ?? ep.guest_id ?? null
      if (guestId && !seen.has(guestId)) {
        seen.add(guestId)
        guestEps.push({ guest_id: guestId, youtube_url: ep.youtube_url })
        // GATHER A BENCH, NOT EXACTLY THREE.
        //
        // This used to stop at 3, and those 3 were "the guests of the newest
        // episodes" — which is the same list the grid beside them renders. The
        // section was structurally guaranteed to repeat itself: 3 of 3 shown on
        // production were already on screen. The caller filters out whoever is
        // already visible and then takes three, so it needs spares.
        if (guestEps.length >= 12) break
      }
    }

    if (guestEps.length === 0) return []

    // Fetch guest details maintaining order
    const result: { id: string; name: string; slug: string | null; bio: string | null; photo_url: string | null; episode_youtube_url: string | null }[] = []
    for (const ge of guestEps) {
      const [guest] = await db
        .select({
          id: guests.id,
          name: guests.name,
          slug: guests.slug,
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

      // NO YOUTUBE-THUMBNAIL FALLBACK FOR A FACE.
      //
      // It used to end `|| youTubeThumbUrl(videoId)`, which looks like a free
      // portrait and is not one. Our 41 thumbnails are hand-composed 16:9
      // posters with the episode title BURNED INTO the artwork — roughly a
      // third of the frame is the guest and two thirds is type (see the rules
      // in components/media/episode-thumb.tsx). Dropped into a gallery of
      // people that renders as the episode's cover art, so «معرض العقول» would
      // have been a second copy of the episode grid sitting directly above it,
      // and any square crop lands on the burned-in headline instead of a face.
      //
      // Empty string is the honest answer, and the section reads it as "render
      // this one typographically". The moment a real portrait exists — an
      // uploaded `custom_image` or `guests.photo_url` — the card shows it. No
      // guest has a photo today (0 of 20 on production).
      const results: MuseumThinker[] = latestGuests.map((guest) => {
        const t = thinkerByGuestId.get(guest.id)
        return {
          id: guest.id,
          name: guest.name,
          title: t?.custom_title || "",
          description: t?.custom_description || guest.bio || "",
          imageUrl: t?.custom_image || guest.photo_url || "",
          slug: guest.slug ?? undefined,
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
      // Public homepage render — project only the columns used. A SELECT *
      // would put admin-only phone/email into the awaited raw pg Result, which
      // React's dev-mode async-debug channel serializes into the flight payload.
      const [guest] = await db
        .select({ id: guests.id, name: guests.name, slug: guests.slug, bio: guests.bio, photo_url: guests.photo_url })
        .from(guests)
        .where(eq(guests.id, row.guest_id))
        .limit(1)
      if (!guest) continue

      // Same rule as auto mode above: a real portrait or nothing. An episode
      // poster is not a face, and letting manual mode fall back to one while
      // auto mode does not would make the two modes render differently from
      // the same guest.
      const imageUrl = guest.photo_url || ""

      results.push({
        id: guest.id,
        name: guest.name,
        title: row.custom_title || "",
        description: row.custom_description || guest.bio || "",
        imageUrl: row.custom_image || imageUrl,
        slug: guest.slug ?? undefined,
      })
    }

    return results.length > 0 ? results : null
  } catch {
    return null
  }
}
