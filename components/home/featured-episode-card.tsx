"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import type { Episode } from "@/types/database"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { YouTubeEmbed } from "@/components/episodes/youtube-embed"
import { Play, Clock, X, ChevronLeft, ChevronDown } from "lucide-react"
import { formatDuration, formatDate, getYouTubeId } from "@/lib/utils"

interface Props {
  episode: Episode
}

export function FeaturedEpisodeCard({ episode }: Props) {
  const [expanded, setExpanded] = useState(false)
  const videoId = getYouTubeId(episode.youtube_url)

  return (
    <Card className="overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
      {/* Collapsed card — click to expand */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${episode.title} — اضغط للتوسيع`}
        className="group relative aspect-video cursor-pointer overflow-hidden"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
      >
        {videoId ? (
          <Image
            src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
            alt={episode.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-4 start-4 end-4">
          <Badge className="mb-2 bg-primary text-primary-foreground">مميزة</Badge>
          <h3 className="text-lg font-bold text-white md:text-xl">
            {episode.title}
          </h3>
          {episode.guest && (
            <p className="mt-1 text-sm text-white/80">مع {episode.guest.name}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-white/70">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(episode.duration_minutes)}
            </span>
            <span>{formatDate(episode.release_date)}</span>
          </div>
        </div>
        <div className="absolute bottom-4 end-4">
          <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full">
            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Expandable panel */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 p-4 md:p-6">
            {/* YouTube player — only mount when expanded to avoid unnecessary iframe */}
            {expanded && (
              <YouTubeEmbed
                url={episode.youtube_url}
                title={episode.title}
                episodeId={episode.id}
                episodeSlug={episode.slug}
                durationMinutes={episode.duration_minutes}
              />
            )}

            {/* Summary */}
            {episode.summary && (
              <div>
                <h4 className="mb-1 text-sm font-semibold text-muted-foreground">ملخص الحلقة</h4>
                <p className="text-sm leading-relaxed">{episode.summary}</p>
              </div>
            )}

            {/* Key takeaways */}
            {episode.key_takeaways && episode.key_takeaways.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">أبرز النقاط</h4>
                <ul className="space-y-1.5">
                  {episode.key_takeaways.map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Guest link */}
            {episode.guest && (
              <p className="text-sm">
                <span className="text-muted-foreground">الضيف: </span>
                <Link
                  href={`/guests/${episode.guest.slug}`}
                  className="font-medium text-primary hover:underline"
                >
                  {episode.guest.name}
                </Link>
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Link href={`/episodes/${episode.slug}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  شاهد الحلقة كاملة
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setExpanded(false)}
              >
                <X className="h-3.5 w-3.5" />
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
