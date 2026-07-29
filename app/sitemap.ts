import type { MetadataRoute } from "next"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import { getAllGuests } from "@/lib/admin/queries"
import { getCategories } from "@/lib/queries/categories"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://khatpodcast.com"

  const [episodes, guests, categories] = await Promise.all([
    fetchAllEpisodes().catch(() => []),
    getAllGuests().catch(() => []),
    getCategories().catch(() => []),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/episodes`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/guests`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${baseUrl}/sponsor`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/guest`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/listen`, changeFrequency: "monthly", priority: 0.6 },
  ]

  const episodeRoutes: MetadataRoute.Sitemap = episodes.map((ep) => ({
    url: `${baseUrl}/episodes/${ep.slug}`,
    lastModified: ep.updated_at ? new Date(ep.updated_at) : new Date(ep.release_date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }))

  const guestRoutes: MetadataRoute.Sitemap = guests.map((g) => ({
    url: `${baseUrl}/guests/${g.slug}`,
    lastModified: new Date(g.created_at),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))

  // Category archives. The slugs are Arabic, so they MUST be percent-encoded —
  // a sitemap URL has to be a valid URI or the whole document is rejected.
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${baseUrl}/categories/${encodeURIComponent(c.slug)}`,
    lastModified: new Date(c.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }))

  return [...staticRoutes, ...episodeRoutes, ...guestRoutes, ...categoryRoutes]
}
