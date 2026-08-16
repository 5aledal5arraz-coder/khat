import { cache } from "react"
import { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  getCachedEpisodeBySlug,
  getCachedRelatedEpisodes,
  getCachedPublicEpisodes,
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
import { resolveEpisodeSlug } from "@/lib/queries/upcoming-episodes"
import { filterLane } from "@/lib/episodes/programs"
import { EpisodePageClient } from "@/components/episodes/episode-page-client"
import { UpcomingEpisodePage } from "@/components/episodes/upcoming-episode-page"
import { ReadingProgress } from "@/components/ui/reading-progress"
import { getStoryTranscript, getStoryQuotes } from "@/lib/stories/transcripts"

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

/**
 * ONE slug, TWO eras, resolved published-first — see `resolveEpisodeSlug`.
 *
 * `cache()` for the same reason as the enrichment above: `generateMetadata` and
 * the page body run separately and both need the answer.
 */
const resolveForRequest = cache((slug: string) =>
  resolveEpisodeSlug(slug, getCachedEpisodeBySlug),
)

interface EpisodePageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ t?: string }>
}

export async function generateMetadata({ params }: EpisodePageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const resolved = await resolveForRequest(decodedSlug)

  // Render the not-found UI for a slug neither table answers.
  //
  // THIS COMMENT USED TO CLAIM «a real 404 response (not a soft-404 body with
  // HTTP 200)». It is not true and was not true before this route learned about
  // upcoming pages: measured against a production build on 2026-08-12, an
  // unknown slug here returns **HTTP 200** with the not-found body, and the
  // same holds across `/guests`, `/categories` and `/topics`. Fixing that is a
  // separate, site-wide decision and Khaled's call — but the comment is
  // corrected now, because a false claim in the code is worse than the bug it
  // describes: it stops anyone from looking.
  if (!resolved) notFound()

  if (resolved.kind === "upcoming") {
    const upcoming = resolved.upcoming

    // «قريباً — » LEADS both titles. A share card for a page with no video has
    // to say so in its first two words, before the truncation that every
    // surface applies: the title is the only part guaranteed to survive.
    const upcomingTitle = `قريباً — ${upcoming.title}`
    return {
      title: upcomingTitle,
      description:
        upcoming.summary?.trim() ||
        `حلقة قادمة من بودكاست خط${upcoming.guest ? ` مع ${upcoming.guest.name}` : ""} — الحلقة ما نزلت بعد.`,
      alternates: { canonical: `https://khatpodcast.com/episodes/${upcoming.slug}` },
      openGraph: {
        title: upcomingTitle,
        description: upcoming.summary?.trim() || undefined,
        type: "article",
        // No episode thumbnail exists yet, so the site card is the honest
        // choice. `undefined` would be wrong here for the same reason it is
        // below: declaring `openGraph` REPLACES the layout's block entirely.
        images: [await resolveDefaultOgImage()],
      },
    }
  }

  const episode = resolved.episode

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
  const resolved = await resolveForRequest(decodedSlug)

  if (!resolved) notFound()

  if (resolved.kind === "upcoming") {
    const upcoming = resolved.upcoming

    // The archive's newest conversations, as the way out of a page with
    // nothing to play. `filterLane(…, "khat")` is the same rule the homepage
    // grid uses, so «مقاطع خط» cut-downs can't turn up as "related".
    const [allEpisodes, videoPlatforms] = await Promise.all([
      getCachedPublicEpisodes().catch(() => []),
      listActivePlatforms({ category: "video" }).catch(() => []),
    ])
    const recommendations = filterLane(allEpisodes, "khat").slice(0, 3)
    const youtube = videoPlatforms.find((p) => p.platform_key === "youtube") ?? null

    // NO `PodcastEpisode` JSON-LD. The type requires a `datePublished` and an
    // `associatedMedia` that do not exist yet; emitting it would tell Google
    // an episode aired that did not.
    return (
      <UpcomingEpisodePage
        upcoming={upcoming}
        youtubeUrl={youtube?.url ?? null}
        recommendations={recommendations}
      />
    )
  }

  const episode = resolved.episode

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

  // THE CONVERSATION AS WORDS. Built by `scripts/build-story-transcript.ts` and
  // read from `content/stories/<videoId>.json`; null for every episode that has
  // not been through it yet, which the client renders as nothing at all.
  //
  // Keyed by YouTube id rather than slug on purpose: the slug is editorial and
  // can change, the video id is the thing the captions actually came from.
  const transcriptVideoId = getYouTubeId(episode.youtube_url)
  const story = transcriptVideoId ? await getStoryTranscript(transcriptVideoId) : null
  const transcript = story
    ? { paragraphs: story.paragraphs, chapters: story.chapters, wordCount: story.wordCount }
    : null
  const storyQuotes = transcriptVideoId ? await getStoryQuotes(transcriptVideoId) : null

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
    // The LESSONS, not the open questions. Both are rendered inside «خلف
    // المحادثة» on this page, but a lesson carries a title AND an explanation —
    // a real pair, visible where Google requires it. `open_questions` are open
    // by construction, which is why feeding them here produced a canned
    // non-answer on every entry.
    faq: (deepAnalysis?.lessons ?? []).map((l) => ({
      question: l.title,
      answer: l.explanation,
    })),
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
        transcript={transcript}
        storyQuotes={storyQuotes}
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
