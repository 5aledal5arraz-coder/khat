import { getEpisodes } from "@/lib/supabase/queries"
import { getEpisodeOverrides } from "@/lib/episode-overrides"
import { getSectionsConfig } from "@/lib/episode-sections"
import { getGuestAssignments } from "@/lib/episode-guests"
import { getAllGuests } from "@/lib/admin/queries"
import { getQuotesConfig } from "@/lib/episode-quotes"
import { getYoutubePackConfig } from "@/lib/youtube-pack"
import { EpisodesListing } from "./episodes-listing"

export default async function EpisodesAdminPage() {
  const [episodes, overrides, sectionsConfig, guestAssignments, guests, quotesConfig, youtubePackConfig] = await Promise.all([
    getEpisodes({ limit: 200, includeHidden: true }),
    getEpisodeOverrides(),
    getSectionsConfig(),
    getGuestAssignments(),
    getAllGuests(),
    getQuotesConfig(),
    getYoutubePackConfig(),
  ])

  const episodesData = episodes.map((ep) => ({
    id: ep.id,
    slug: ep.slug,
    title: ep.title,
    description: ep.description || "",
    youtube_url: ep.youtube_url,
    release_date: ep.release_date,
    duration_minutes: ep.duration_minutes,
    guestId: ep.guest?.id || null,
    guestName: ep.guest?.name || null,
  }))

  const guestsData = guests.map((g) => ({
    id: g.id,
    name: g.name,
    photo_url: g.photo_url,
  }))

  return (
    <EpisodesListing
      episodes={episodesData}
      overrides={overrides}
      sectionsConfig={sectionsConfig}
      guestAssignments={guestAssignments}
      guests={guestsData}
      quotesConfig={quotesConfig}
      youtubePackConfig={youtubePackConfig}
    />
  )
}
