import { getAllGuests } from "@/lib/admin/queries"
import { getEpisodes } from "@/lib/supabase/queries"
import { GuestsList } from "./guests-list"

export const dynamic = "force-dynamic"

export default async function GuestsAdminPage() {
  const [guests, episodes] = await Promise.all([
    getAllGuests(),
    getEpisodes({ limit: 200 }),
  ])

  // Count episodes per guest
  const guestEpisodeCounts = new Map<string, number>()
  for (const episode of episodes) {
    if (episode.guest_id) {
      guestEpisodeCounts.set(
        episode.guest_id,
        (guestEpisodeCounts.get(episode.guest_id) || 0) + 1
      )
    }
    if (episode.guest?.id) {
      guestEpisodeCounts.set(
        episode.guest.id,
        (guestEpisodeCounts.get(episode.guest.id) || 0) + 1
      )
    }
  }

  const guestsWithCounts = guests.map((guest) => ({
    ...guest,
    episodeCount: guestEpisodeCounts.get(guest.id) || 0,
  }))

  return <GuestsList guests={guestsWithCounts} />
}
