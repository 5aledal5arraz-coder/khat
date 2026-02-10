import { EpisodeCard } from "./episode-card"
import type { Episode, Guest } from "@/types/database"

interface EpisodeRecommendationsProps {
  episodes: (Episode & { guest?: Guest | null })[]
}

export function EpisodeRecommendations({ episodes }: EpisodeRecommendationsProps) {
  if (episodes.length === 0) return null

  return (
    <div className="space-y-4 pt-8">
      <h2 className="text-xl font-semibold">حلقات ذات صلة</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {episodes.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} />
        ))}
      </div>
    </div>
  )
}
