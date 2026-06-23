import { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  getCachedEpisodeBySlug,
  getCachedRelatedEpisodes,
  getCachedAdjacentEpisodes,
} from "@/lib/cache"
import { getQuotesByEpisodeId } from "@/lib/content/home-quotes"
import { getReflectionsByEpisodeId } from "@/lib/content/daily-reflections"
import { getPublicEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { getEpisodeEirId } from "@/lib/queries/episodes"
import { getEpisodeTopics } from "@/lib/episodes/episode-graph"
import { getPublicEpisodeDeepAnalysisByEir } from "@/lib/studio/deep-analysis"
import { buildEpisodeJsonLd } from "@/lib/seo/episode-jsonld"
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

  const [relatedEpisodes, { prev, next }, homeQuotes, reflections, enrichment, platformLinks, allActivePlatforms, sponsor, topics, eirId] = await Promise.all([
    getCachedRelatedEpisodes(episode.id),
    getCachedAdjacentEpisodes(episode.slug),
    getQuotesByEpisodeId(episode.id),
    getReflectionsByEpisodeId(episode.id),
    getPublicEpisodeEnrichment(episode.id),
    listPlatformsForSurface("episode_page"),
    listActivePlatforms(),
    getEpisodeSponsor(episode.id),
    getEpisodeTopics(episode.id),
    getEpisodeEirId(episode.id),
  ])

  // The "behind the conversation" deep analysis is gated alongside the enriched
  // content: surface it only when the episode's enrichment is published.
  const deepAnalysis = enrichment ? await getPublicEpisodeDeepAnalysisByEir(eirId) : null

  // `sameAs` advertises our canonical social/video/audio accounts to search engines.
  const sameAs = allActivePlatforms
    .filter((p) => p.category !== "other" && p.platform_key !== "rss")
    .map((p) => p.url)

  const guestSameAs = episode.guest?.external_links
    ? Object.values(episode.guest.external_links).filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    : []

  const videoId = getYouTubeId(episode.youtube_url)

  const jsonLd = buildEpisodeJsonLd({
    title: episode.title,
    slug: episode.slug,
    description: episode.summary,
    releaseDate: episode.release_date,
    durationMinutes: episode.duration_minutes,
    youtubeVideoId: videoId,
    audioUrl: episode.audio_url,
    audioType: episode.audio_type,
    audioDurationSeconds: episode.audio_duration,
    audioPublishedAt: episode.rss_published_at,
    guestName: episode.guest?.name ?? null,
    guestSameAs,
    topics: topics.map((t) => t.name),
    faq: deepAnalysis?.open_questions ?? [],
    publisherSameAs: sameAs,
  })

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
        topics={topics}
        deepAnalysis={deepAnalysis}
        initialStartTime={startTime}
      />
    </>
  )
}
