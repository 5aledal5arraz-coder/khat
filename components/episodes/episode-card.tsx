"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, Calendar, Bookmark } from "lucide-react"
import { formatDuration, formatDate } from "@/lib/utils"
import { isItemSaved, toggleSaveItem } from "@/lib/saved"
import type { Episode, Guest, Topic } from "@/types/database"

interface EpisodeCardProps {
  episode: Episode & {
    guest?: Guest | null
    topics?: Topic[] | { topic: Topic }[]
  }
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  const [isSaved, setIsSaved] = useState(() => {
    if (typeof window === "undefined") return false
    return isItemSaved(episode.id, "episode")
  })
  const topics = episode.topics?.map((t) =>
    'topic' in t ? t.topic : t
  ) || []

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newState = toggleSaveItem({
      id: episode.id,
      type: "episode",
      title: episode.title,
      subtitle: episode.guest?.name ? `مع ${episode.guest.name}` : undefined,
      slug: episode.slug,
    })
    setIsSaved(newState)
  }

  return (
    <Link href={`/episodes/${episode.slug}`}>
      <Card className="group h-full overflow-hidden transition-all hover:shadow-lg">
        <div className="relative aspect-video overflow-hidden bg-muted">
          {episode.youtube_url && (
            <Image
              src={`https://img.youtube.com/vi/${getYouTubeId(episode.youtube_url)}/maxresdefault.jpg`}
              alt={episode.title}
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          )}
          <div className="absolute bottom-2 start-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(episode.duration_minutes)}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            className={`absolute top-2 end-2 h-8 w-8 bg-black/50 hover:bg-black/70 ${isSaved ? "text-primary" : "text-white"}`}
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
          </Button>
        </div>
        <CardContent className="p-4">
          <h3 className="line-clamp-2 text-lg font-semibold group-hover:text-primary">
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
            {episode.season && (
              <>
                <span>•</span>
                <span>الموسم {episode.season}</span>
              </>
            )}
          </div>
          {topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {topics.slice(0, 3).map((topic) => (
                <Badge key={topic.id} variant="secondary" className="text-xs">
                  {topic.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function getYouTubeId(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  return match ? match[1] : ''
}
