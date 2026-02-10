"use client"

import Link from "next/link"
import { ChevronRight, ChevronLeft } from "lucide-react"
import { EpisodePlayerProvider } from "./episode-player-context"
import { EpisodeHero } from "./episode-hero"
import { EpisodeSummary } from "./episode-summary"
import { EpisodeIdeas } from "./episode-ideas"
import { EpisodeRecommendations } from "./episode-recommendations"
import { GuestIntroSection } from "./guest-intro-section"
import { ResourcesList } from "./resources-list"
import { QuoteCard } from "@/components/quotes/quote-card"
import { getYouTubeWatchUrl } from "@/lib/utils"
import type { EpisodeWithRelations, Episode, Guest, HomeQuote, EmotionalPath, DailyReflection } from "@/types/database"
import { EpisodeConnections } from "./episode-connections"

function TimestampLink({ seconds, title, youtubeUrl }: { seconds: number; title: string; youtubeUrl: string }) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const watchUrl = getYouTubeWatchUrl(youtubeUrl, seconds)

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-muted"
    >
      <span className="shrink-0 font-mono text-sm tabular-nums text-primary">
        {mins}:{secs.toString().padStart(2, "0")}
      </span>
      <span className="text-sm">{title}</span>
    </a>
  )
}

interface EpisodePageClientProps {
  episode: EpisodeWithRelations
  relatedEpisodes: (Episode & { guest?: Guest | null })[]
  prev: Episode | null
  next: Episode | null
  homeQuotes?: HomeQuote[]
  paths?: EmotionalPath[]
  reflections?: DailyReflection[]
}

export function EpisodePageClient({
  episode,
  relatedEpisodes,
  prev,
  next,
  homeQuotes = [],
  paths = [],
  reflections = [],
}: EpisodePageClientProps) {
  const summary = episode.summary || episode.description || null
  const takeaways = episode.key_takeaways ?? []
  const hasDbTimestamps = episode.timestamps.length > 0
  const hasDbQuotes = episode.quotes.length > 0

  // Teaser: first ~150 chars of summary
  const teaser = summary ? summary.slice(0, 150) + (summary.length > 150 ? "..." : "") : undefined

  return (
    <EpisodePlayerProvider>
      <div className="container mx-auto overflow-x-hidden px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Guest Intro */}
          <GuestIntroSection
            guest={episode.guest || {
              name: "ضيف الحلقة",
              slug: "guest",
              bio: null,
              photo_url: null,
              external_links: null,
            }}
            testimonial={episode.guest_testimonial}
            testimonialVideoUrl={episode.guest_video_url}
          />

          {/* 1. Hero Section */}
          <EpisodeHero
            episode={episode}
            teaser={teaser}
          />

          {/* 2. Quick Summary */}
          {summary && <EpisodeSummary summary={summary} />}

          {/* 3. Timestamps */}
          {hasDbTimestamps && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">فهرس الحلقة</h2>
              <div className="space-y-1">
                {episode.timestamps.map((ts) => (
                  <TimestampLink
                    key={ts.id}
                    seconds={ts.time_seconds}
                    title={ts.title}
                    youtubeUrl={episode.youtube_url}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 4. Quotes */}
          {hasDbQuotes && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">اقتباسات من الحلقة</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {episode.quotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={{ ...quote, guest: episode.guest }}
                    episodeTitle={episode.title}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 5. Takeaways */}
          <EpisodeIdeas takeaways={takeaways} />

          {/* Resources */}
          {episode.resources.length > 0 && (
            <div className="rounded-lg border p-4">
              <ResourcesList resources={episode.resources} />
            </div>
          )}

          {/* Connected Content: quotes, paths, reflections */}
          <EpisodeConnections
            homeQuotes={homeQuotes}
            paths={paths}
            reflections={reflections}
          />

          {/* Next / Previous Navigation */}
          {(prev || next) && (
            <div className="flex items-stretch gap-4 pt-8 border-t">
              {prev ? (
                <Link
                  href={`/episodes/${prev.slug}`}
                  className="group flex flex-1 items-center gap-3 rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">الحلقة السابقة</p>
                    <p className="mt-0.5 truncate text-sm font-medium group-hover:text-primary transition-colors">
                      {prev.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="flex-1" />
              )}
              {next ? (
                <Link
                  href={`/episodes/${next.slug}`}
                  className="group flex flex-1 items-center justify-end gap-3 rounded-xl border p-4 text-end transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">الحلقة التالية</p>
                    <p className="mt-0.5 truncate text-sm font-medium group-hover:text-primary transition-colors">
                      {next.title}
                    </p>
                  </div>
                  <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </Link>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          )}

          {/* 6. Related Episodes */}
          <EpisodeRecommendations episodes={relatedEpisodes} />
        </div>
      </div>
    </EpisodePlayerProvider>
  )
}
