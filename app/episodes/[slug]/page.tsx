import { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  getCachedEpisodeBySlug,
  getCachedRelatedEpisodes,
  getCachedAdjacentEpisodes,
} from "@/lib/cache"
import { getQuotesByEpisodeId } from "@/lib/content/home-quotes"
import { getReflectionsByEpisodeId } from "@/lib/content/daily-reflections"
import { getEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { listPlatformsForSurface, listActivePlatforms } from "@/lib/queries/official-platforms"
import { getEpisodeSponsor } from "@/lib/queries/episode-sponsors"
import { getYouTubeId } from "@/lib/utils"
import { EpisodePageClient } from "@/components/episodes/episode-page-client"
import { ReadingProgress } from "@/components/ui/reading-progress"

// Note: searchParams (t= timestamp) forces dynamic rendering in Next.js 15+
// ISR would require moving timestamp param to client-side parsing
export const dynamic = "force-dynamic"

interface EpisodePageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ t?: string }>
}

export async function generateMetadata({ params }: EpisodePageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const episode = await getCachedEpisodeBySlug(decodedSlug)

  if (!episode) {
    // Trigger a real 404 response (not a soft-404 body with HTTP 200).
    notFound()
  }

  const videoId = getYouTubeId(episode.youtube_url)
  const ogImage = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined

  return {
    title: episode.title,
    description: episode.summary || `حلقة من بودكاست خط مع ${episode.guest?.name || "ضيف مميز"}`,
    alternates: { canonical: `https://khatpodcast.com/episodes/${episode.slug}` },
    openGraph: {
      title: episode.title,
      description: episode.summary || undefined,
      type: "article",
      images: ogImage ? [{ url: ogImage, width: 1280, height: 720 }] : undefined,
    },
  }
}

export default async function EpisodePage({ params, searchParams }: EpisodePageProps) {
  const { slug } = await params
  const { t } = await searchParams
  const startTime = t ? parseInt(t, 10) : undefined
  const decodedSlug = decodeURIComponent(slug)
  const episode = await getCachedEpisodeBySlug(decodedSlug)

  if (!episode) {
    notFound()
  }

  const [relatedEpisodes, { prev, next }, homeQuotes, reflections, enrichment, platformLinks, allActivePlatforms, sponsor] = await Promise.all([
    getCachedRelatedEpisodes(episode.id),
    getCachedAdjacentEpisodes(episode.slug),
    getQuotesByEpisodeId(episode.id),
    getReflectionsByEpisodeId(episode.id),
    getEpisodeEnrichment(episode.id),
    listPlatformsForSurface("episode_page"),
    listActivePlatforms(),
    getEpisodeSponsor(episode.id),
  ])

  // `sameAs` advertises our canonical social/video/audio accounts to search engines.
  const sameAs = allActivePlatforms
    .filter((p) => p.category !== "other" && p.platform_key !== "rss")
    .map((p) => p.url)

  const videoId = getYouTubeId(episode.youtube_url)
  const episodeUrl = `https://khatpodcast.com/episodes/${episode.slug}`

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VideoObject",
        name: episode.title,
        description: episode.summary || undefined,
        thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined,
        uploadDate: episode.release_date,
        duration: episode.duration_minutes ? `PT${episode.duration_minutes}M` : undefined,
        embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : undefined,
        url: episodeUrl,
        ...(sameAs.length > 0 ? { publisher: { "@type": "Organization", name: "KHAT Podcast", sameAs } } : {}),
        ...(episode.guest?.name && { actor: { "@type": "Person", name: episode.guest.name } }),
      },
      ...(episode.audio_url ? [{
        "@type": "AudioObject",
        name: episode.title,
        contentUrl: episode.audio_url,
        encodingFormat: episode.audio_type || "audio/mpeg",
        ...(episode.audio_duration ? { duration: `PT${Math.floor(episode.audio_duration / 60)}M${episode.audio_duration % 60}S` } : {}),
        uploadDate: episode.rss_published_at || episode.release_date,
      }] : []),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://khatpodcast.com" },
          { "@type": "ListItem", position: 2, name: "الحلقات", item: "https://khatpodcast.com/episodes" },
          { "@type": "ListItem", position: 3, name: episode.title, item: episodeUrl },
        ],
      },
    ],
  }

  return (
    <>
      <ReadingProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EpisodePageClient
        episode={episode}
        relatedEpisodes={relatedEpisodes}
        prev={prev}
        next={next}
        homeQuotes={homeQuotes}
        reflections={reflections}
        enrichment={enrichment}
        platformLinks={platformLinks}
        sponsor={sponsor}
        initialStartTime={startTime}
      />
    </>
  )
}
