import type { MetadataRoute } from "next"
import { getCachedPublicEpisodes } from "@/lib/cache"
import { getGuests } from "@/lib/queries/episodes"
import { getCategories } from "@/lib/queries/categories"

/**
 * The sitemap must advertise the pages this site actually serves — nothing more.
 *
 * It used to read episodes from `fetchAllEpisodes()` (lib/youtube/queries), which
 * queries the YouTube Data API, NOT our database. The public archive and
 * `/episodes/[slug]` read the DB. So the sitemap listed every video on the
 * channel — including the ones never imported — and each of those slugs resolved
 * to a "page not found" body. Every source here is now the SAME source the
 * corresponding public page renders from:
 *   /episodes        → getCachedPublicEpisodes()   (app/episodes/page.tsx)
 *   /guests          → getGuests()                 (app/guests/page.tsx)
 *   /categories/[..] → getCategories()
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://khatpodcast.com"

  const [episodes, guests, categories] = await Promise.all([
    getCachedPublicEpisodes().catch(() => []),
    getGuests().catch(() => []),
    getCategories().catch(() => []),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/episodes`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/guests`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.4 },
    // /sponsor is a 307 to /partner (next.config.ts redirects) — a sitemap must
    // list the destination, not the redirect.
    { url: `${baseUrl}/partner`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/contribute`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/guest`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/listen`, changeFrequency: "monthly", priority: 0.6 },
  ]

  // Episode, guest and category slugs are all Arabic, so they MUST be
  // percent-encoded — a sitemap URL has to be a valid URI or the whole document
  // is rejected. (Categories already did this; episodes and guests did not.)
  const episodeRoutes: MetadataRoute.Sitemap = episodes.map((ep) => ({
    url: `${baseUrl}/episodes/${encodeURIComponent(ep.slug)}`,
    lastModified: ep.updated_at ? new Date(ep.updated_at) : new Date(ep.release_date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }))

  const guestRoutes: MetadataRoute.Sitemap = guests.map((g) => ({
    url: `${baseUrl}/guests/${encodeURIComponent(g.slug)}`,
    lastModified: new Date(g.created_at),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${baseUrl}/categories/${encodeURIComponent(c.slug)}`,
    lastModified: new Date(c.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }))

  return [...staticRoutes, ...episodeRoutes, ...guestRoutes, ...categoryRoutes]
}
