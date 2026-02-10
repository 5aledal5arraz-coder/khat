"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, Calendar, Play, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"
import type { Episode, Guest } from "@/types/database"

interface EpisodeCardProps {
  episode: Episode & {
    guest?: Guest | null
  }
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const videoId = getYouTubeId(episode.youtube_url)
  const summary = episode.summary || episode.description

  return (
    <Link href={`/episodes/${episode.slug}`}>
      <Card
        className="group h-full overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-video overflow-hidden bg-muted">
          {episode.youtube_url && (
            <Image
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt={episode.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform group-hover:scale-105"
            />
          )}

          {/* Hover Preview Overlay */}
          <div
            className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-black/70 to-transparent p-4 transition-opacity duration-300 ${
              isHovered ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* Play Button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm transition-transform group-hover:scale-110">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary shadow-lg">
                  <Play className="h-5 w-5 ms-0.5 text-primary-foreground" fill="currentColor" />
                </div>
              </div>
            </div>

            {/* Preview Text */}
            {summary && (
              <p className="line-clamp-2 text-xs leading-relaxed text-white/90">
                {summary}
              </p>
            )}
          </div>

          {/* Duration Badge - always visible */}
          <div className="absolute bottom-2 start-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(episode.duration_minutes)}</span>
          </div>
        </div>

        <CardContent className="p-4">
          {/* Topic tags */}
          {episode.topics && episode.topics.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {episode.topics.slice(0, 2).map((topic) => (
                <Badge key={topic.id} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {topic.name}
                </Badge>
              ))}
            </div>
          )}
          <h3 className="line-clamp-2 text-lg font-semibold group-hover:text-primary transition-colors">
            {episode.title}
          </h3>
          {episode.guest && (
            <p className="mt-1 text-sm text-muted-foreground">
              مع {episode.guest.name}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(episode.release_date)}</span>
            {episode.view_count != null && episode.view_count > 0 && (
              <>
                <span>•</span>
                <Eye className="h-3 w-3" />
                <span>{new Intl.NumberFormat('ar-SA', { notation: 'compact' }).format(episode.view_count)}</span>
              </>
            )}
            {episode.season && (
              <>
                <span>•</span>
                <span>الموسم {episode.season}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

