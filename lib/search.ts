import type { Episode, Guest } from "@/types/database"

/**
 * Normalize Arabic text for search comparison:
 * - Remove tashkeel/diacritics
 * - Normalize alef forms (أ إ آ → ا)
 * - Normalize taa marbuta (ة → ه)
 * - Normalize alef maqsura (ى → ي)
 * - Remove tatweel (ـ)
 * - Lowercase
 */
export function normalizeArabic(text: string): string {
  return text
    // Remove tashkeel/diacritics (U+0617–U+061A, U+064B–U+0652, U+0670)
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670]/g, "")
    // Normalize alef forms → ا
    .replace(/[أإآ]/g, "ا")
    // Normalize taa marbuta → ه
    .replace(/ة/g, "ه")
    // Normalize alef maqsura → ي
    .replace(/ى/g, "ي")
    // Remove tatweel
    .replace(/ـ/g, "")
    // Lowercase for Latin characters
    .toLowerCase()
}

/**
 * Score and rank episodes by relevance to a search query.
 * Searches across title, guest name, and description.
 */
export function searchEpisodes(episodes: Episode[], query: string): Episode[] {
  const normalizedQuery = normalizeArabic(query).trim()
  if (!normalizedQuery) return episodes

  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean)

  const scored = episodes.map((episode) => {
    let score = 0
    const normalizedTitle = normalizeArabic(episode.title)
    const normalizedGuest = episode.guest?.name
      ? normalizeArabic(episode.guest.name)
      : ""
    const normalizedDescription = normalizeArabic(
      episode.description || episode.summary || ""
    )

    // Full query matches
    if (normalizedTitle.includes(normalizedQuery)) {
      score += 30
      if (normalizedTitle.startsWith(normalizedQuery)) score += 20
    }
    if (normalizedGuest && normalizedGuest.includes(normalizedQuery)) {
      score += 25
    }

    // Per-word scoring
    for (const word of queryWords) {
      if (normalizedTitle.includes(word)) score += 10
      if (normalizedGuest && normalizedGuest.includes(word)) score += 8
      if (normalizedDescription.includes(word)) score += 3
    }

    return { episode, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.episode)
}

/**
 * Score and rank guests by relevance to a search query.
 * Searches across name and bio.
 */
export function searchGuests(guests: Guest[], query: string): Guest[] {
  const normalizedQuery = normalizeArabic(query).trim()
  if (!normalizedQuery) return guests

  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean)

  const scored = guests.map((guest) => {
    let score = 0
    const normalizedName = normalizeArabic(guest.name)
    const normalizedBio = guest.bio ? normalizeArabic(guest.bio) : ""

    // Full query matches on name
    if (normalizedName.includes(normalizedQuery)) {
      score += 30
      if (normalizedName.startsWith(normalizedQuery)) score += 20
    }

    // Bio full query match
    if (normalizedBio && normalizedBio.includes(normalizedQuery)) {
      score += 10
    }

    // Per-word scoring
    for (const word of queryWords) {
      if (normalizedName.includes(word)) score += 10
      if (normalizedBio && normalizedBio.includes(word)) score += 3
    }

    return { guest, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.guest)
}
