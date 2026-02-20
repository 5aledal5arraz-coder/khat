import Link from "next/link"
import Image from "next/image"
import { Gem, Play, Clock } from "lucide-react"
import { getEpisodes } from "@/lib/queries/episodes"
import { getHiddenGems } from "@/lib/boost"
import { formatDuration, getYouTubeId } from "@/lib/utils"

export async function HiddenGems() {
  const allEpisodes = await getEpisodes({})
  const gems = getHiddenGems(allEpisodes, 5)

  if (gems.length === 0) return null

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <Gem className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">حلقات تستحق المشاهدة</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {gems.map((episode) => {
          const videoId = getYouTubeId(episode.youtube_url)
          return (
            <Link
              key={episode.id}
              href={`/episodes/${episode.slug}`}
              className="group relative shrink-0"
            >
              <div className="relative h-28 w-48 overflow-hidden rounded-lg bg-muted">
                <Image
                  src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                  alt={episode.title}
                  fill
                  sizes="192px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex h-full items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                      <Play className="h-4 w-4 ms-0.5 text-primary-foreground" fill="currentColor" />
                    </div>
                  </div>
                </div>
                {/* Duration */}
                <div className="absolute bottom-2 start-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{formatDuration(episode.duration_minutes)}</span>
                </div>
              </div>
              <p className="mt-2 max-w-[192px] truncate text-sm font-medium group-hover:text-primary transition-colors">
                {episode.title}
              </p>
              {episode.guest && (
                <p className="max-w-[192px] truncate text-xs text-muted-foreground">
                  مع {episode.guest.name}
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
