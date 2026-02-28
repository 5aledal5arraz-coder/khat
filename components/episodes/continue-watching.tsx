"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Play, Clock } from "lucide-react"
import { getRecentlyViewed, type WatchProgress } from "@/lib/watch-history"
import { formatDuration } from "@/lib/utils"

export function ContinueWatching() {
  const [episodes, setEpisodes] = useState<WatchProgress[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setEpisodes(getRecentlyViewed())
  }, [])

  if (!mounted || episodes.length === 0) {
    return null
  }

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-semibold">شفتها مؤخراً</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {episodes.map((episode) => (
          <Link
            key={episode.episodeId}
            href={`/episodes/${episode.slug}`}
            className="group relative shrink-0"
          >
            <div className="relative h-24 w-40 overflow-hidden rounded-lg bg-muted">
              <Image
                src={episode.thumbnailUrl}
                alt={episode.title}
                fill
                sizes="160px"
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
                <span>{formatDuration(episode.durationMinutes)}</span>
              </div>
            </div>
            <p className="mt-2 max-w-[160px] truncate text-sm font-medium group-hover:text-primary">
              {episode.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
