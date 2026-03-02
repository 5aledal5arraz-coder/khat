import type { MetadataRoute } from "next"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import { getAllGuests } from "@/lib/admin/queries"
import { getAllPaths } from "@/lib/emotional-paths"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://khatpodcast.com"

  const [episodes, guests, paths] = await Promise.all([
    fetchAllEpisodes().catch(() => []),
    getAllGuests().catch(() => []),
    getAllPaths().catch(() => []),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/episodes`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/guests`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/paths`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/resources`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/space`, changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${baseUrl}/sponsor`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/guest`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/series`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/store`, changeFrequency: "monthly", priority: 0.4 },
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

  const pathRoutes: MetadataRoute.Sitemap = paths.map((p) => ({
    url: `${baseUrl}/paths/${p.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))

  return [...staticRoutes, ...episodeRoutes, ...guestRoutes, ...pathRoutes]
}
