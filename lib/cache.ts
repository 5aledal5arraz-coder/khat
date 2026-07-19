/**
 * Server-side cache layer for public page queries.
 *
 * Wraps existing query functions with Next.js `unstable_cache` for
 * time-based caching with tag-based invalidation. Original query
 * functions remain untouched — this module re-exports cached versions.
 *
 * Usage:
 *   import { getCachedEpisodes, getCachedGuestBySlug } from "@/lib/cache"
 *
 * Invalidation:
 *   import { invalidate } from "@/lib/cache"
 *   invalidate("episodes")   // after episode publish/unpublish/hide
 *   invalidate("homepage")   // after featured/thinkers/partners change
 *   invalidate("guests")     // after guest create/update/delete
 */

import { unstable_cache, revalidateTag } from "next/cache"
import {
  getEpisodes,
  getEpisodeBySlug,
  getGuestBySlug,
  selectAdjacentEpisodes,
  selectRelatedEpisodes,
  tallyEpisodeCounts,
} from "@/lib/queries/episodes"
import { getHomepageFeaturedEpisodes } from "@/lib/queries/homepage-featured"
import { getHomepageThinkersForDisplay } from "@/lib/queries/homepage-thinkers"
import { getHomepagePartners } from "@/lib/queries/partnerships"
import { getActiveTeaserForDisplay, TEASER_CACHE_TAG, type ActiveTeaserView } from "@/lib/teaser"
import { getRelatedEpisodeIds } from "@/lib/episodes/episode-graph"
import { db } from "@/lib/db"
import { hiddenEpisodes } from "@/lib/db/schema"
import type { Episode, EpisodeWithRelations, GuestWithRelations } from "@/types/database"
import type { MuseumEpisode, MuseumThinker } from "@/lib/content/museum-data"
import type { TrustedPartner } from "@/lib/queries/partnerships"

// ─── Cache Tags ───────────────────────────────────────────────

export const CACHE_TAGS = {
  episodes: "public-episodes",
  episodeBySlug: (slug: string) => `public-episode-${slug}`,
  guests: "public-guests",
  guestBySlug: (slug: string) => `public-guest-${slug}`,
  homepage: "public-homepage",
  hiddenEpisodes: "public-hidden-episodes",
} as const

// ─── TTLs (seconds) ──────────────────────────────────────────

const TTL = {
  episodes: 5 * 60,        // 5 minutes
  episodeBySlug: 5 * 60,   // 5 minutes
  guestBySlug: 30 * 60,    // 30 minutes
  homepage: 30 * 60,        // 30 minutes
  partners: 60 * 60,        // 1 hour
  hiddenEpisodes: 10 * 60,  // 10 minutes
} as const

// ─── Cached Query Functions ──────────────────────────────────

/**
 * Cached episode listing for public pages.
 * Only caches the default (no search, no category) call — filtered/searched
 * queries bypass the cache since they're user-specific.
 */
export const getCachedPublicEpisodes = unstable_cache(
  async (): Promise<Episode[]> => {
    return getEpisodes({})
  },
  ["public-episodes-list"],
  { revalidate: TTL.episodes, tags: [CACHE_TAGS.episodes] }
)

/**
 * Cached active teaser for the homepage. Tagged with TEASER_CACHE_TAG so both
 * admin actions AND episode publish can drop it instantly (acceptance م4).
 */
export const getCachedActiveTeaser = unstable_cache(
  async (): Promise<ActiveTeaserView | null> => {
    return getActiveTeaserForDisplay()
  },
  ["active-teaser-display"],
  { revalidate: TTL.homepage, tags: [TEASER_CACHE_TAG] }
)

/**
 * Cached "related episodes" — canonical-first (Studio redesign, P4).
 *
 * Reads the semantic `episode_relationships` graph first (highest score first),
 * mapping ids onto the cached public list so unpublished/hidden related episodes
 * are dropped and DB score-ordering is preserved. Falls back to the legacy
 * naive selector ("first N") when the graph has no edges for this episode.
 * Signature unchanged so callers are untouched.
 */
export async function getCachedRelatedEpisodes(
  episodeId: string,
  limit = 3,
): Promise<Episode[]> {
  const list = await getCachedPublicEpisodes()
  try {
    const ids = await getRelatedEpisodeIds(episodeId, limit)
    if (ids.length > 0) {
      const byId = new Map(list.map((e) => [e.id, e]))
      const canonical = ids.map((id) => byId.get(id)).filter(Boolean) as Episode[]
      if (canonical.length > 0) return canonical.slice(0, limit)
    }
  } catch (err) {
    console.error("[cache] related-episode graph read failed, using fallback:", err)
  }
  return selectRelatedEpisodes(list, episodeId, limit)
}

/**
 * Cached prev/next neighbours for an episode detail page — derived from the
 * single cached list (was a full resolution per detail-page view).
 */
export async function getCachedAdjacentEpisodes(
  slug: string,
): Promise<{ prev: Episode | null; next: Episode | null }> {
  return selectAdjacentEpisodes(await getCachedPublicEpisodes(), slug)
}

/**
 * Cached per-category episode counts for the list page filter chips —
 * derived from the single cached list (was a full resolution per list view).
 */
export async function getCachedEpisodeCounts(): Promise<Record<string, number>> {
  return tallyEpisodeCounts(await getCachedPublicEpisodes())
}

/**
 * Cached episode detail for public episode pages.
 */
export function getCachedEpisodeBySlug(slug: string): Promise<EpisodeWithRelations | null> {
  const cached = unstable_cache(
    async () => getEpisodeBySlug(slug),
    [`public-episode-${slug}`],
    {
      revalidate: TTL.episodeBySlug,
      tags: [CACHE_TAGS.episodes, CACHE_TAGS.episodeBySlug(slug)],
    }
  )
  return cached()
}

/**
 * Cached guest detail for public guest pages.
 */
export function getCachedGuestBySlug(slug: string): Promise<GuestWithRelations | null> {
  const cached = unstable_cache(
    async () => getGuestBySlug(slug),
    [`public-guest-${slug}`],
    {
      revalidate: TTL.guestBySlug,
      tags: [CACHE_TAGS.guests, CACHE_TAGS.guestBySlug(slug)],
    }
  )
  return cached()
}

/**
 * Cached homepage featured episodes.
 */
export const getCachedHomepageFeatured = unstable_cache(
  async (): Promise<MuseumEpisode[] | null> => {
    return getHomepageFeaturedEpisodes()
  },
  ["public-homepage-featured"],
  { revalidate: TTL.homepage, tags: [CACHE_TAGS.homepage] }
)

/**
 * Cached homepage thinkers.
 */
export const getCachedHomepageThinkers = unstable_cache(
  async (): Promise<MuseumThinker[] | null> => {
    return getHomepageThinkersForDisplay()
  },
  ["public-homepage-thinkers"],
  { revalidate: TTL.homepage, tags: [CACHE_TAGS.homepage] }
)

/**
 * Cached homepage partners.
 */
export const getCachedHomepagePartners = unstable_cache(
  async (): Promise<TrustedPartner[]> => {
    return getHomepagePartners()
  },
  ["public-homepage-partners"],
  { revalidate: TTL.partners, tags: [CACHE_TAGS.homepage] }
)

/**
 * Cached hidden episode IDs.
 */
export const getCachedHiddenEpisodeIds = unstable_cache(
  async (): Promise<string[]> => {
    if (!db) return []
    try {
      const rows = await db.select({ episode_id: hiddenEpisodes.episode_id }).from(hiddenEpisodes)
      return rows.map((r) => r.episode_id)
    } catch {
      return []
    }
  },
  ["public-hidden-episode-ids"],
  { revalidate: TTL.hiddenEpisodes, tags: [CACHE_TAGS.hiddenEpisodes] }
)

// ─── Invalidation ────────────────────────────────────────────

type InvalidationScope = "episodes" | "guests" | "homepage" | "hidden" | "all"

/**
 * Invalidate cached data by scope. Call from admin mutation endpoints.
 *
 * Scopes:
 *  - "episodes"  → episode list + all individual episode pages
 *  - "guests"    → all guest pages
 *  - "homepage"  → featured, thinkers, partners
 *  - "hidden"    → hidden episode IDs + episode list
 *  - "all"       → everything
 */
export function invalidate(scope: InvalidationScope): void {
  // Next.js 16 revalidateTag requires a cache life profile as 2nd arg.
  // We use { expire: 0 } to immediately expire tagged entries.
  const expire = { expire: 0 }

  switch (scope) {
    case "episodes":
      revalidateTag(CACHE_TAGS.episodes, expire)
      break
    case "guests":
      revalidateTag(CACHE_TAGS.guests, expire)
      break
    case "homepage":
      revalidateTag(CACHE_TAGS.homepage, expire)
      break
    case "hidden":
      revalidateTag(CACHE_TAGS.hiddenEpisodes, expire)
      revalidateTag(CACHE_TAGS.episodes, expire)
      break
    case "all":
      revalidateTag(CACHE_TAGS.episodes, expire)
      revalidateTag(CACHE_TAGS.guests, expire)
      revalidateTag(CACHE_TAGS.homepage, expire)
      revalidateTag(CACHE_TAGS.hiddenEpisodes, expire)
      break
  }
}
