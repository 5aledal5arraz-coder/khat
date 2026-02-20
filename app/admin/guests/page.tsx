import { getAllGuests } from "@/lib/admin/queries"
import { getEpisodes } from "@/lib/queries/episodes"
import { GuestsList } from "./guests-list"

export const dynamic = "force-dynamic"

export default async function GuestsAdminPage() {
  const [guests, episodes] = await Promise.all([
    getAllGuests(),
    getEpisodes({ limit: 200 }),
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

  return <GuestsList guests={guestsWithCounts} />
}
