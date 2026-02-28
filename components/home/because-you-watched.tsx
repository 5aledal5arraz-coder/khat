"use client"

import Link from "next/link"
import Image from "next/image"
import type { Episode } from "@/types/database"
import { Card } from "@/components/ui/card"
import { Play, Clock } from "lucide-react"
import { formatDuration, getYouTubeId } from "@/lib/utils"

interface Props {
  sourceTitle: string
  episodes: Episode[]
}

export function BecauseYouWatched({ sourceTitle, episodes }: Props) {
  if (episodes.length === 0) return null

  return (
    <section className="py-8 space-y-4">
      <h2 className="text-lg font-bold">
        لأنك شفت: {sourceTitle}
      </h2>

      <div className="space-y-3">
        {episodes.map((ep) => {
          const videoId = getYouTubeId(ep.youtube_url)
          return (
            <Link key={ep.id} href={`/episodes/${ep.slug}`}>
              <Card className="group transition-all hover:border-primary/50">
                <div className="flex gap-4 p-4">
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {videoId ? (
                      <Image
                        src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                        alt={ep.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Play className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <h4 className="text-sm font-semibold line-clamp-2 group-hover:text-primary">
                      {ep.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(ep.duration_minutes)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
