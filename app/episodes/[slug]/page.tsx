import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getEpisodeBySlug, getRelatedEpisodes, getAdjacentEpisodes } from "@/lib/queries/episodes"
import { getQuotesByEpisodeId } from "@/lib/home-quotes"
import { getPathsForEpisode } from "@/lib/emotional-paths"
import { getReflectionsByEpisodeId } from "@/lib/daily-reflections"
import { getEpisodeEnrichment } from "@/lib/episode-enrichments"
import { getArticlesByEpisodeId } from "@/lib/space-queries"
import { getYouTubeId } from "@/lib/utils"
import { EpisodePageClient } from "@/components/episodes/episode-page-client"

interface EpisodePageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ t?: string }>
}

export async function generateMetadata({ params }: EpisodePageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const episode = await getEpisodeBySlug(decodedSlug)

  if (!episode) {
    return { title: "الحلقة غير موجودة" }
  }

  const videoId = getYouTubeId(episode.youtube_url)
  const ogImage = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined

  return {
    title: episode.title,
    description: episode.summary || `حلقة من بودكاست خط مع ${episode.guest?.name || "ضيف مميز"}`,
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
  const episode = await getEpisodeBySlug(decodedSlug)

  if (!episode) {
    notFound()
  }

  const [relatedEpisodes, { prev, next }, homeQuotes, paths, reflections, enrichment, hibrArticles] = await Promise.all([
    getRelatedEpisodes(episode.id, episode.topics.map(t => t.id)),
    getAdjacentEpisodes(episode.slug),
    getQuotesByEpisodeId(episode.id),
    getPathsForEpisode(episode.id),
    getReflectionsByEpisodeId(episode.id),
    getEpisodeEnrichment(episode.id),
    getArticlesByEpisodeId(episode.id),
  ])

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
        ...(episode.guest?.name && { actor: { "@type": "Person", name: episode.guest.name } }),
      },
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
        paths={paths}
        reflections={reflections}
        enrichment={enrichment}
        hibrArticles={hibrArticles}
        initialStartTime={startTime}
      />
    </>
  )
}
