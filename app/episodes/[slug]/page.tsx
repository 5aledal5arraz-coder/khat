import { cache } from "react"
import { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  getCachedEpisodeBySlug,
  getCachedRelatedEpisodes,
} from "@/lib/cache"
import { getPublicEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { episodeThumbUrl } from "@/lib/episodes/thumbnail"
import { getEpisodeEirId } from "@/lib/queries/episodes"
import { getTeaserForEpisode } from "@/lib/teaser"
import { getEpisodeTopics } from "@/lib/episodes/episode-graph"
import { getPublicEpisodeDeepAnalysisByEir } from "@/lib/studio/deep-analysis"
import { buildEpisodeJsonLd } from "@/lib/seo/episode-jsonld"
import { resolveDefaultOgImage } from "@/lib/seo/og"
import { listPlatformsForSurface, listActivePlatforms } from "@/lib/queries/official-platforms"
import { getEpisodeSponsor } from "@/lib/queries/episode-sponsors"
import { getYouTubeId } from "@/lib/utils"
import { displayEpisodeTitle } from "@/lib/shared/formatters"
import { EpisodePageClient } from "@/components/episodes/episode-page-client"
import { ReadingProgress } from "@/components/ui/reading-progress"

// Note: searchParams (t= timestamp) forces dynamic rendering in Next.js 15+
// ISR would require moving timestamp param to client-side parsing
export const dynamic = "force-dynamic"

/**
 * One enrichment read per request, shared by `generateMetadata` and the page
 * body — both need it now that the share card uses `hero_summary`, and Next
 * runs the two separately. Same `cache()` pattern as
 * `getCategoriesForRequest` in lib/queries/categories.ts.
 */
const getEnrichmentForRequest = cache((episodeId: string) =>
  getPublicEpisodeEnrichment(episodeId),
)

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

  // Through the shared resolver, so the card honours `episodes.thumbnail_url`
  // — an editor's override used to be ignored here while the homepage queries
  // obeyed it.
  const ogImage = episodeThumbUrl(episode) ?? undefined

  // The layout's `title.template` appends the site name to every page, and
  // these titles arrive from YouTube already carrying the brand stamp — so 12
  // episodes shipped «… | بودكاست خط | بودكاست خط», the longest 113 characters
  // against the ~60 a search result shows.
  //
  // `displayEpisodeTitle` is the SAME peeler the cards and the page's own <h1>
  // already use, so the tab and the heading now read alike instead of the head
  // carrying a stamp the body had stripped. Not a second stripper written for
  // metadata — that is how the two would drift.
  const metaTitle = displayEpisodeTitle(episode.title)

  // `og:description` is a CARD, not the article. `summary` is the full
  // multi-paragraph body — 900+ characters on the episodes measured — which
  // every share surface truncates mid-sentence. `hero_summary` is the
  // one-sentence version written for exactly this, so prefer it and fall back
  // to the long one only when it is missing.
  const heroSummary = (await getEnrichmentForRequest(episode.id))?.hero_summary?.trim()
  const cardDescription = heroSummary || episode.summary || undefined

  return {
    title: metaTitle,
    description: cardDescription || `حلقة من بودكاست خط مع ${episode.guest?.name || "ضيف مميز"}`,
    alternates: { canonical: `https://khatpodcast.com/episodes/${episode.slug}` },
    openGraph: {
      title: metaTitle,
      description: cardDescription,
      type: "article",
      // The YouTube thumbnail stays the card whenever we can derive a video id.
      // When we can't (a non-standard `youtube_url`), fall back to the site card
      // instead of `undefined`: declaring `openGraph` REPLACES the root layout's
      // block, so `undefined` here shipped an episode with no og:image at all.
      images: ogImage
        ? [{ url: ogImage, width: 1280, height: 720 }]
        : [await resolveDefaultOgImage()],
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

  // Four fetches left with «اكتشف أكثر» and the previous/next pair: the
  // adjacent episodes, the home quotes and the daily reflections. They were
  // queried on every episode view to feed two sections the page no longer has.
  const [relatedEpisodes, enrichment, platformLinks, allActivePlatforms, sponsor, topics, eirId] = await Promise.all([
    getCachedRelatedEpisodes(episode.id),
    getEnrichmentForRequest(episode.id),
    listPlatformsForSurface("episode_page"),
    listActivePlatforms(),
    getEpisodeSponsor(episode.id),
    getEpisodeTopics(episode.id),
    getEpisodeEirId(episode.id),
  ])

  // The "behind the conversation" deep analysis is gated alongside the enriched
  // content: surface it only when the episode's enrichment is published.
  const deepAnalysis = enrichment ? await getPublicEpisodeDeepAnalysisByEir(eirId) : null

  // Archived teaser for this now-published episode (acceptance م4). Linked by
  // EIR; null when the episode had no teaser.
  const teaser = await getTeaserForEpisode(eirId)

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
        enrichment={enrichment}
        platformLinks={platformLinks}
        sponsor={sponsor}
        topics={topics}
        deepAnalysis={deepAnalysis}
        episodeTeaser={teaser}
        initialStartTime={startTime}
      />
    </>
  )
}
