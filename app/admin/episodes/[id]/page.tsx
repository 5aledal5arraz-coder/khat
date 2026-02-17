import { notFound } from "next/navigation"
import { getEpisodes } from "@/lib/supabase/queries"
import { getEpisodeOverrides } from "@/lib/episode-overrides"
import { getSectionsConfig } from "@/lib/episode-sections"
import { getGuestAssignments } from "@/lib/episode-guests"
import { getAllGuests } from "@/lib/admin/queries"
import { getQuotesConfig } from "@/lib/episode-quotes"
import { getYoutubePackConfig } from "@/lib/youtube-pack"
import { getEpisodeEnrichment } from "@/lib/episode-enrichments"
import { EpisodeDetail } from "./episode-detail"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EpisodeDetailPage({ params }: PageProps) {
  const { id } = await params

  const [
    episodes,
    overrides,
    sectionsConfig,
    guestAssignments,
    guests,
    quotesConfig,
    youtubePackConfig,
    enrichment,
  ] = await Promise.all([
    getEpisodes({ limit: 200, includeHidden: true }),
    getEpisodeOverrides(),
    getSectionsConfig(),
    getGuestAssignments(),
    getAllGuests(),
    getQuotesConfig(),
    getYoutubePackConfig(),
    getEpisodeEnrichment(id),
  ])

  const rawEpisode = episodes.find((ep) => ep.id === id)
  if (!rawEpisode) notFound()

  const episode = {
    id: rawEpisode.id,
    slug: rawEpisode.slug,
    title: rawEpisode.title,
    description: rawEpisode.description || "",
    youtube_url: rawEpisode.youtube_url,
    release_date: rawEpisode.release_date,
    duration_minutes: rawEpisode.duration_minutes,
    guestId: rawEpisode.guest?.id || null,
    guestName: rawEpisode.guest?.name || null,
  }

  const override = overrides.find((o) => o.id === id) || null
  const currentSectionId = sectionsConfig.assignments[id] || null
  const isHidden = sectionsConfig.hiddenEpisodes.includes(id) ||
    (currentSectionId
      ? sectionsConfig.sections.find((s) => s.id === currentSectionId)?.hidden === true
      : false)
  const isDeleted = sectionsConfig.deletedEpisodes.includes(id)
  const currentGuestId = guestAssignments[id] || episode.guestId || null

  const guestsData = guests.map((g) => ({
    id: g.id,
    name: g.name,
    photo_url: g.photo_url,
  }))

  return (
    <EpisodeDetail
      episode={episode}
      override={override}
      sections={sectionsConfig.sections}
      currentSectionId={currentSectionId}
      isHidden={isHidden}
      isDeleted={isDeleted}
      guests={guestsData}
      currentGuestId={currentGuestId}
      quotesEntry={quotesConfig[id] || null}
      youtubePackEntry={youtubePackConfig[id] || null}
      enrichment={enrichment}
    />
  )
}
