"use client"

import Link from "next/link"
import Image from "next/image"
import type { Episode, HomeQuote, DailyReflection } from "@/types/database"
import { Card } from "@/components/ui/card"
import { Play, Clock, Sparkles } from "lucide-react"
import { formatDuration, getYouTubeId } from "@/lib/utils"

interface Props {
  episodes: Episode[]
  quote: HomeQuote | null
  reflection: DailyReflection | null
  reason: string | null
}

export function RecommendedForYou({ episodes, quote, reflection, reason }: Props) {
  if (episodes.length === 0) return null

  return (
    <section className="py-8 space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">نرشّحها لك</h2>
      </div>

      {reason && (
        <p className="text-sm text-muted-foreground">{reason}</p>
      )}

      {/* Personalized quote */}
      {quote && (
        <Card className="border-primary/20 bg-primary/5 p-5">
          <blockquote className="space-y-2">
            <p className="text-sm leading-relaxed font-medium">
              &ldquo;{quote.text}&rdquo;
            </p>
            {quote.attribution && (
              <footer className="text-xs text-muted-foreground">
                — {quote.attribution}
              </footer>
            )}
          </blockquote>
          {quote.episode_slug && (
            <Link
              href={`/episodes/${quote.episode_slug}`}
              className="mt-3 inline-block text-xs text-primary hover:underline"
            >
              استمع للحلقة
            </Link>
          )}
        </Card>
      )}

      {/* Personalized reflection */}
      {reflection && (
        <Card className="border-muted bg-muted/30 p-5 space-y-2">
          <p className="text-sm leading-relaxed">
            {reflection.short_quote || reflection.reflection}
          </p>
          {reflection.thinking_question && (
            <p className="text-xs text-muted-foreground italic">
              {reflection.thinking_question}
            </p>
          )}
        </Card>
      )}

      {/* Recommended episodes */}
      <div className="space-y-3">
        {episodes.slice(0, 6).map((ep) => {
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
                      {ep.guest?.name && (
                        <span>{ep.guest.name}</span>
                      )}
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
