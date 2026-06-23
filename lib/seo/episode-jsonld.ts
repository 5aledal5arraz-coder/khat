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
  faq?: string[]
  /** Org-level social/video/audio accounts for the publisher. */
  publisherSameAs?: string[]
}

const SITE = "https://khatpodcast.com"
const SERIES_NAME = "خط بودكاست"

function iso8601Duration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `PT${m}M${s}S`
}

export function buildEpisodeJsonLd(input: EpisodeJsonLdInput): Record<string, unknown> {
  const episodeUrl = `${SITE}/episodes/${input.slug}`
  const videoId = input.youtubeVideoId || null
  const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined
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
  const faq = (input.faq ?? []).filter((q) => q && q.trim().length > 0)
  if (faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((q) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: `استمع إلى الحلقة لمعرفة الإجابة: ${input.title}` },
      })),
    })
  }

  return { "@context": "https://schema.org", "@graph": graph }
}
