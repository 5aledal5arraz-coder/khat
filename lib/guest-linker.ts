import { USE_DB } from "@/lib/db"
import { assignGuestToEpisode } from "@/lib/episode-guests"
import { createGuest, getAllGuests } from "@/lib/admin/queries"

/**
 * Create a URL-safe slug from an Arabic name.
 * Removes diacritics, replaces spaces with hyphens, strips non-alphanumeric.
 */
export function slugifyArabicName(name: string): string {
  return name
    .trim()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip Arabic diacritics
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FF\w-]/g, "") // keep Arabic, alphanumeric, hyphens
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

/**
 * Find an existing guest by exact name match (case-insensitive).
 */
export async function findGuestByName(name: string) {
  const trimmed = name.trim().toLowerCase()
  if (!USE_DB) {
    const all = await getAllGuests()
    return all.find((g) => g.name.trim().toLowerCase() === trimmed) ?? null
  }

  try {
    const all = await getAllGuests()
    return all.find((g) => g.name.trim().toLowerCase() === trimmed) ?? null
  } catch (e) {
    console.error("findGuestByName error:", e)
    return null
  }
}

/**
 * Find a guest by name, or create a new one.
 * Returns the guest record.
 */
export async function findOrCreateGuest(
  name: string,
  bio?: string | null
): Promise<{ guest: { id: string; name: string; slug: string }; created: boolean } | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  // Try to find existing guest
  const existing = await findGuestByName(trimmed)
  if (existing) {
    return { guest: { id: existing.id, name: existing.name, slug: existing.slug }, created: false }
  }

  // Create new guest
  let slug = slugifyArabicName(trimmed)
  if (!slug) slug = `guest-${Date.now()}`

  // Handle slug collisions by appending a number
  if (USE_DB) {
    const allGuests = await getAllGuests()
    const existingSlugs = new Set(allGuests.map((g) => g.slug))
    let finalSlug = slug
    let counter = 2
    while (existingSlugs.has(finalSlug)) {
      finalSlug = `${slug}-${counter}`
      counter++
    }
    slug = finalSlug
  }

  const result = await createGuest({
    name: trimmed,
    slug,
    bio: bio || null,
    photo_url: null,
    external_links: {},
    testimonial: null,
  })

  if (result.success && result.data) {
    return { guest: { id: result.data.id, name: result.data.name, slug: result.data.slug }, created: true }
  }

  console.error("findOrCreateGuest: failed to create guest:", result.error)
  return null
}

/**
 * Auto-link a guest to an episode by name.
 * Finds or creates the guest, then assigns them to the episode.
 * Returns info about what was done.
 */
export async function autoLinkGuestForEpisode(
  episodeId: string,
  guestName: string,
  guestBio?: string | null
): Promise<{
  linked: boolean
  guestId?: string
  guestName?: string
  guestSlug?: string
  created?: boolean
  error?: string
}> {
  try {
    const result = await findOrCreateGuest(guestName, guestBio)
    if (!result) {
      return { linked: false, error: "فشل في إنشاء أو إيجاد الضيف" }
    }

    await assignGuestToEpisode(episodeId, result.guest.id)

    return {
      linked: true,
      guestId: result.guest.id,
      guestName: result.guest.name,
      guestSlug: result.guest.slug,
      created: result.created,
    }
  } catch (e) {
    console.error("autoLinkGuestForEpisode error:", e)
    return { linked: false, error: e instanceof Error ? e.message : "خطأ غير متوقع" }
  }
}
