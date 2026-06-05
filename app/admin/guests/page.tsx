import { getAllGuests } from "@/lib/admin/queries"
import { getEpisodes } from "@/lib/queries/episodes"
import { GuestsList } from "./guests-list"

export const dynamic = "force-dynamic"

export default async function GuestsAdminPage() {
  // Load ALL episodes (no limit) so the link picker in the guest editor
  // can show every episode in the database, not just a partial subset.
  const [guests, episodes] = await Promise.all([
    getAllGuests(),
    getEpisodes({ includeHidden: true }),
  ])

  const guestEpisodeCounts = new Map<string, number>()
  for (const episode of episodes) {
    const gid = episode.guest_id || episode.guest?.id
    if (gid) {
      guestEpisodeCounts.set(gid, (guestEpisodeCounts.get(gid) || 0) + 1)
    }
  }

  const guestsWithCounts = guests.map((guest) => ({
    ...guest,
    episodeCount: guestEpisodeCounts.get(guest.id) || 0,
  }))

  // Slim episode data for episode linking UI
  const episodeSummaries = episodes.map((ep) => ({
    id: ep.id,
    title: ep.title,
    guest_id: ep.guest_id || ep.guest?.id || null,
    release_date: ep.release_date,
  }))

  return <GuestsList guests={guestsWithCounts} episodes={episodeSummaries} />
}
