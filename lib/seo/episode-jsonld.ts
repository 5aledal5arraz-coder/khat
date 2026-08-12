/**
 * Episode JSON-LD graph builder (Studio redesign, P7).
 *
 * Produces a richer schema.org @graph for the knowledge-hub episode page:
 * PodcastEpisode (+ partOfSeries) and VideoObject/AudioObject for the media,
 * a Person node for the guest, a BreadcrumbList, optional FAQPage from the
 * episode's open questions, and `about`/`keywords` from the topic taxonomy.
 *
 * Pure — no I/O — so it's trivially testable.
 */

import { youTubeThumbUrl } from "@/lib/episodes/thumbnail"

export interface EpisodeJsonLdInput {
  title: string
  slug: string
  description?: string | null
  releaseDate: string
  durationMinutes?: number | null
  youtubeVideoId?: string | null
  audioUrl?: string | null
  audioType?: string | null
  audioDurationSeconds?: number | null
  audioPublishedAt?: string | null
  guestName?: string | null
  guestSameAs?: string[]
  /** Topic names — become `about`/`keywords`. */
  topics?: string[]
  /** Open questions → FAQPage. */
  /**
   * Question/answer pairs that are VISIBLE on the page — Google's own
   * requirement for `FAQPage`, and the reason this is no longer `string[]`.
   *
   * It used to take `open_questions`, which are open BY CONSTRUCTION: the
   * episode raises them and does not answer them. So every answer shipped as
   * the same canned line, «استمع إلى الحلقة لمعرفة الإجابة» — structured data
   * telling Google "this page answers questions" over a page that answers none.
   */
  faq?: { question: string; answer: string }[]
  /** Org-level social/video/audio accounts for the publisher. */
  publisherSameAs?: string[]
}

const SITE = "https://khatpodcast.com"
const SERIES_NAME = "بودكاست خط"

function iso8601Duration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `PT${m}M${s}S`
}

export function buildEpisodeJsonLd(input: EpisodeJsonLdInput): Record<string, unknown> {
  const episodeUrl = `${SITE}/episodes/${input.slug}`
  const videoId = input.youtubeVideoId || null
  const thumb = videoId ? youTubeThumbUrl(videoId) : undefined
  const topics = (input.topics ?? []).filter(Boolean)

  const graph: Record<string, unknown>[] = []

  // ── PodcastEpisode ────────────────────────────────────────────────
  const podcastEpisode: Record<string, unknown> = {
    "@type": "PodcastEpisode",
    "@id": `${episodeUrl}#episode`,
    name: input.title,
    description: input.description || undefined,
    datePublished: input.releaseDate,
    url: episodeUrl,
    partOfSeries: {
      "@type": "PodcastSeries",
      name: SERIES_NAME,
      url: SITE,
      ...(input.publisherSameAs && input.publisherSameAs.length > 0 ? { sameAs: input.publisherSameAs } : {}),
    },
  }
  if (topics.length > 0) {
    podcastEpisode.about = topics.map((t) => ({ "@type": "Thing", name: t }))
    podcastEpisode.keywords = topics.join(", ")
  }
  if (input.guestName) {
    podcastEpisode.actor = {
      "@type": "Person",
      name: input.guestName,
      ...(input.guestSameAs && input.guestSameAs.length > 0 ? { sameAs: input.guestSameAs } : {}),
    }
  }
  if (videoId) {
    podcastEpisode.associatedMedia = { "@id": `${episodeUrl}#video` }
  }
  graph.push(podcastEpisode)

  // ── VideoObject ──────────────────────────────────────────────────
  if (videoId) {
    graph.push({
      "@type": "VideoObject",
      "@id": `${episodeUrl}#video`,
      name: input.title,
      description: input.description || undefined,
      thumbnailUrl: thumb,
      uploadDate: input.releaseDate,
      duration: input.durationMinutes ? `PT${input.durationMinutes}M` : undefined,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      url: episodeUrl,
      ...(input.publisherSameAs && input.publisherSameAs.length > 0
        ? { publisher: { "@type": "Organization", name: "KHAT Podcast", sameAs: input.publisherSameAs } }
        : {}),
      ...(input.guestName ? { actor: { "@type": "Person", name: input.guestName } } : {}),
    })
  }

  // ── AudioObject ──────────────────────────────────────────────────
  if (input.audioUrl) {
    graph.push({
      "@type": "AudioObject",
      name: input.title,
      contentUrl: input.audioUrl,
      encodingFormat: input.audioType || "audio/mpeg",
      ...(input.audioDurationSeconds ? { duration: iso8601Duration(input.audioDurationSeconds) } : {}),
      uploadDate: input.audioPublishedAt || input.releaseDate,
    })
  }

  // ── Person (guest) ───────────────────────────────────────────────
  if (input.guestName) {
    graph.push({
      "@type": "Person",
      name: input.guestName,
      ...(input.guestSameAs && input.guestSameAs.length > 0 ? { sameAs: input.guestSameAs } : {}),
      ...(topics.length > 0 ? { knowsAbout: topics } : {}),
    })
  }

  // ── BreadcrumbList ───────────────────────────────────────────────
  graph.push({
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE },
      { "@type": "ListItem", position: 2, name: "الحلقات", item: `${SITE}/episodes` },
      { "@type": "ListItem", position: 3, name: input.title, item: episodeUrl },
    ],
  })

  // ── FAQPage (from open questions) ────────────────────────────────
  // BOTH halves must be real. A pair missing either one is dropped rather than
  // padded — an entry with an invented answer is the defect this replaced, and
  // an empty `FAQPage` is worse than none at all.
  const faq = (input.faq ?? []).filter(
    (p) => p?.question?.trim().length > 0 && p?.answer?.trim().length > 0,
  )
  if (faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((p) => ({
        "@type": "Question",
        name: p.question.trim(),
        acceptedAnswer: { "@type": "Answer", text: p.answer.trim() },
      })),
    })
  }

  return { "@context": "https://schema.org", "@graph": graph }
}
