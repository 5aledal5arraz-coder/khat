import { getEpisodes } from "@/lib/queries/episodes"
import { getEpisodeOverrides } from "@/lib/episodes/overrides"
import { getAllGuests } from "@/lib/admin/queries"
import { getQuotesConfig } from "@/lib/episodes/quotes"
import { getYoutubePackConfig } from "@/lib/youtube-pack"
import { getHiddenEpisodeIds } from "./actions"
import { getCategoriesWithCounts } from "@/lib/queries/categories"
import { listDeletedEpisodeIds } from "@/lib/episodes/deleted"
import { EpisodesListing } from "./episodes-listing"

export default async function EpisodesAdminPage() {
  const [
    episodes,
    overrides,
    guests,
    quotesConfig,
    youtubePackConfig,
    hiddenEpisodeIds,
    categories,
    deletedEpisodeIds,
  ] = await Promise.all([
    // applyListPipeline already filters tombstoned episodes; keep includeHidden
    // true so the admin can still see hidden ones.
    getEpisodes({ limit: 200, includeHidden: true }),
    getEpisodeOverrides(),
    getAllGuests(),
    getQuotesConfig(),
    getYoutubePackConfig(),
    getHiddenEpisodeIds(),
    getCategoriesWithCounts(),
    listDeletedEpisodeIds(),
  ])

  const episodesData = episodes.map((ep) => ({
    id: ep.id,
    slug: ep.slug,
    title: ep.title,
    description: ep.description || "",
    youtube_url: ep.youtube_url,
    release_date: ep.release_date,
    duration_minutes: ep.duration_minutes,
    category_id: ep.category_id || null,
    guest_id: ep.guest?.id || null,
    guest_name: ep.guest?.name || null,
    // The listing does not render these; they are carried because
    // `AdminEpisodeView` is one shape for both screens and a second,
    // list-only variant is how the two drift.
    guest_testimonial: ep.guest_testimonial ?? null,
    guest_video_url: ep.guest_video_url ?? null,
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
      guests={guestsData}
      categories={categories}
      quotesConfig={quotesConfig}
      youtubePackConfig={youtubePackConfig}
      hiddenEpisodeIds={hiddenEpisodeIds}
      deletedEpisodeIds={deletedEpisodeIds}
    />
  )
}
