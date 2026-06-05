import Link from "next/link"
import Image from "next/image"
import { Clock, Play, Eye } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"
import { BLUR_DATA_URL_16_9 } from "@/lib/image-utils"
import type { Episode, Guest } from "@/types/database"

interface EpisodeCardProps {
  episode: Episode & {
    guest?: Guest | null
  }
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  const videoId = getYouTubeId(episode.youtube_url)
  const summary = episode.summary || episode.description

  return (
    <Link href={`/episodes/${episode.slug}`} className="group block">
      <div className="museum-frame mb-4 overflow-hidden p-0">
        <div className="relative aspect-video overflow-hidden bg-black">
          {episode.youtube_url && (
            <Image
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt={episode.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL_16_9}
              className="object-cover grayscale transition-all duration-700 group-hover:scale-105 group-hover:grayscale-0"
            />
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-black/60 to-transparent p-4 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center border border-primary/30 bg-black/40 backdrop-blur-sm transition-transform group-hover:scale-110">
                <Play className="h-5 w-5 ms-0.5 text-primary" fill="currentColor" />
              </div>
            </div>
            {summary && (
              <p className="line-clamp-2 text-xs leading-relaxed text-white/80 italic">
                {summary}
              </p>
            )}
          </div>

          {/* Duration */}
          <div className="absolute bottom-2 start-2 flex items-center gap-1 bg-black/70 px-2 py-1 text-[10px] tracking-wider text-white/70">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(episode.duration_minutes)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 px-1">
        <h3 className="museum-font-headline text-xl leading-tight transition-colors duration-500 group-hover:text-primary sm:text-2xl">
          {episode.title}
        </h3>

        {episode.guest && (
          <p className="text-xs tracking-widest text-muted-foreground">
            مع {episode.guest.name}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1 text-[10px] tracking-wider text-muted-foreground/60">
          <span>{formatDate(episode.release_date)}</span>
          {episode.view_count != null && episode.view_count > 0 && (
            <>
              <span className="text-primary/20">|</span>
              <Eye className="h-3 w-3" />
              <span>{new Intl.NumberFormat('en', { notation: 'compact' }).format(episode.view_count)}</span>
            </>
          )}
          {episode.season && (
            <>
              <span className="text-primary/20">|</span>
              <span>الموسم {episode.season}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
