import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getEpisodeBySlug, getRelatedEpisodes, getAdjacentEpisodes } from "@/lib/supabase/queries"
import { getQuotesByEpisodeId } from "@/lib/home-quotes"
import { getPathsForEpisode } from "@/lib/emotional-paths"
import { getReflectionsByEpisodeId } from "@/lib/daily-reflections"
import { getYouTubeId } from "@/lib/utils"
import { EpisodePageClient } from "@/components/episodes/episode-page-client"

interface EpisodePageProps {
  params: Promise<{ slug: string }>
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

export default async function EpisodePage({ params }: EpisodePageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const episode = await getEpisodeBySlug(decodedSlug)

  if (!episode) {
    notFound()
  }

  const [relatedEpisodes, { prev, next }, homeQuotes, paths, reflections] = await Promise.all([
    getRelatedEpisodes(episode.id, episode.topics.map(t => t.id)),
    getAdjacentEpisodes(episode.slug),
    getQuotesByEpisodeId(episode.id),
    getPathsForEpisode(episode.id),
    getReflectionsByEpisodeId(episode.id),
  ])

  return (
    <EpisodePageClient
      episode={episode}
      relatedEpisodes={relatedEpisodes}
      prev={prev}
      next={next}
      homeQuotes={homeQuotes}
      paths={paths}
      reflections={reflections}
    />
  )
}
