"use client"

import Link from "next/link"
import { YouTubeEmbed } from "./youtube-embed"
import { ShareButtons } from "./share-buttons"
import { usePlayer } from "./episode-player-context"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, User } from "lucide-react"
import { formatDate, formatDuration } from "@/lib/utils"

interface EpisodeHeroProps {
  episode: {
    id: string
    title: string
    slug: string
    youtube_url: string
    duration_minutes: number
    release_date: string
    season?: number | null
    guest?: {
      name: string
      slug: string
    } | null
    topics?: { id: string; name: string; slug: string }[]
  }
  teaser?: string
}

export function EpisodeHero({ episode, teaser }: EpisodeHeroProps) {
  const { seekTime } = usePlayer()

  return (
    <div className="space-y-4">
      <YouTubeEmbed
        url={episode.youtube_url}
        title={episode.title}
        startTime={seekTime ?? undefined}
        episodeId={episode.id}
        episodeSlug={episode.slug}
        durationMinutes={episode.duration_minutes}
      />

      <h1 className="text-3xl font-bold">{episode.title}</h1>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {episode.guest && (
          <Link
            href={`/guests/${episode.guest.slug}`}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <User className="h-4 w-4" />
            <span>{episode.guest.name}</span>
          </Link>
        )}
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          <span>{formatDate(episode.release_date)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>{formatDuration(episode.duration_minutes)}</span>
        </div>
        {episode.season && <span>الموسم {episode.season}</span>}
      </div>

      {episode.topics && episode.topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {episode.topics.map((topic) => (
            <Link key={topic.id} href={`/episodes?category=${topic.slug}`}>
              <Badge variant="secondary">{topic.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      {teaser && (
        <p className="text-muted-foreground leading-relaxed">{teaser}</p>
      )}

      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
        <span className="text-sm text-muted-foreground">شارك الحلقة:</span>
        <ShareButtons
          url={`/episodes/${episode.slug}`}
          title={episode.title}
          size="default"
        />
      </div>
    </div>
  )
}
