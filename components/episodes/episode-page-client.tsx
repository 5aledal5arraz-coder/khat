"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ChevronRight, ChevronLeft } from "lucide-react"
import { EpisodePlayerProvider, usePlayer } from "./episode-player-context"
import { EpisodeHero } from "./episode-hero"
import { EpisodeSummary } from "./episode-summary"
import { EpisodeIdeas } from "./episode-ideas"
import { EpisodeRecommendations } from "./episode-recommendations"
import { GuestIntroSection } from "./guest-intro-section"
import { ResourcesList } from "./resources-list"
import { QuoteCard } from "@/components/quotes/quote-card"
import { WhyThisConversation } from "./why-this-conversation"
import { CentralQuestion } from "./central-question"
import { BeforeYouWatch } from "./before-you-watch"
import { ConversationMap } from "./conversation-map"
import { ExclusiveClip } from "./exclusive-clip"
import { UnsaidReflections } from "./unsaid-reflections"
import type { EpisodeWithRelations, Episode, Guest, HomeQuote, DailyReflection, PodcastPlatformLink } from "@/types/database"
import type { EpisodeEnrichment } from "@/types/episodes"
import type { EpisodeSponsorData } from "@/lib/queries/episode-sponsors"
import { EpisodeConnections } from "./episode-connections"
import { AudioPlayer } from "./audio-player"
import { EpisodePlatformLinks } from "./episode-platform-links"
import { EpisodeSponsor } from "./episode-sponsor"
import { trackEvent } from "@/lib/personalization/tracker"
import { formatTimeSeconds } from "@/lib/utils"

function TimestampLink({ seconds, title }: { seconds: number; title: string }) {
  const { seekTo } = usePlayer()

  return (
    <button
      onClick={() => seekTo(seconds)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-muted"
    >
      <span className="shrink-0 font-mono text-sm tabular-nums text-primary">
        {formatTimeSeconds(seconds)}
      </span>
      <span className="text-sm">{title}</span>
    </button>
  )
}

interface EpisodePageClientProps {
  episode: EpisodeWithRelations
  relatedEpisodes: (Episode & { guest?: Guest | null })[]
  prev: Episode | null
  next: Episode | null
  homeQuotes?: HomeQuote[]
  reflections?: DailyReflection[]
  enrichment?: EpisodeEnrichment | null
  platformLinks?: PodcastPlatformLink[]
  sponsor?: EpisodeSponsorData | null
  initialStartTime?: number
}

export function EpisodePageClient({
  episode,
  relatedEpisodes,
  prev,
  next,
  homeQuotes = [],
  reflections = [],
  enrichment,
  platformLinks = [],
  sponsor,
  initialStartTime,
}: EpisodePageClientProps) {
  // Track episode view
  const trackedRef = useRef(false)
  useEffect(() => {
    if (trackedRef.current) return
    trackedRef.current = true
    trackEvent("episode_view", episode.id, {
      guest_id: episode.guest_id ?? undefined,
    })
  }, [episode.id, episode.guest_id])

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
          {/* 1. Guest Intro */}
          {episode.guest && (
            <GuestIntroSection
              guest={episode.guest}
              testimonial={episode.guest_testimonial}
              testimonialVideoUrl={episode.guest_video_url}
            />
          )}

          {/* 2. Hero Section */}
          <div id="sec-hero">
          <EpisodeHero
            episode={episode}
            teaser={teaser}
            initialStartTime={initialStartTime}
          />

          </div>

          {/* 2b. Audio Player + Platform Links */}
          {episode.audio_url && (
            <div className="space-y-3">
              <AudioPlayer
                audioUrl={episode.audio_url}
                audioType={episode.audio_type}
                title={episode.title}
                duration={episode.audio_duration}
              />
              {platformLinks.length > 0 && (
                <EpisodePlatformLinks platforms={platformLinks} />
              )}
            </div>
          )}

          {/* 3. Why This Conversation */}
          <div id="sec-why">
          <WhyThisConversation text={enrichment?.why_this_conversation} />
          </div>

          {/* 4. Central Question */}
          <CentralQuestion question={enrichment?.central_question} />

          {/* 5. Before You Watch */}
          <BeforeYouWatch data={enrichment?.before_you_watch} />

          {/* 6. Quick Summary */}
          {summary && <div id="sec-summary"><EpisodeSummary summary={summary} /></div>}

          {/* 7. Conversation Map */}
          <ConversationMap data={enrichment?.conversation_map} />

          {/* 8. Timestamps */}
          {hasDbTimestamps && (
            <div id="sec-timestamps" className="space-y-4">
              <h2 className="text-lg font-semibold">فهرس الحلقة</h2>
              <div className="space-y-1">
                {episode.timestamps.map((ts) => (
                  <TimestampLink
                    key={ts.id}
                    seconds={ts.time_seconds}
                    title={ts.title}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 9. Quotes */}
          {hasDbQuotes && (
            <div id="sec-quotes" className="space-y-3">
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

          {/* 10. Takeaways */}
          <div id="sec-takeaways">
          <EpisodeIdeas takeaways={takeaways} />
          </div>

          {/* 11. Resources */}
          {episode.resources.length > 0 && (
            <div id="sec-resources" className="rounded-lg border p-4">
              <ResourcesList resources={episode.resources} />
            </div>
          )}

          {/* 11b. Sponsor */}
          {sponsor && <EpisodeSponsor sponsor={sponsor} />}

          {/* 12. Exclusive Clip */}
          <ExclusiveClip data={enrichment?.exclusive_clip} />

          {/* 13. Unsaid Reflections */}
          <UnsaidReflections items={enrichment?.unsaid_reflections} />

          {/* 14. Connected Content: quotes, reflections */}
          <EpisodeConnections
            homeQuotes={homeQuotes}
            reflections={reflections}
          />

          {/* 15. Next / Previous Navigation */}
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

          {/* 16. Related Episodes */}
          <div id="sec-related">
          <EpisodeRecommendations episodes={relatedEpisodes} />
          </div>
        </div>
      </div>
    </EpisodePlayerProvider>
  )
}
