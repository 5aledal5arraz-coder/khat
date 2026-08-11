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
import { TeaserInline } from "@/components/teaser/teaser-inline"
import { UnsaidReflections } from "./unsaid-reflections"
import type { EpisodeWithRelations, Episode, Guest, HomeQuote, DailyReflection, PodcastPlatformLink } from "@/types/database"
import type { EpisodeEnrichment } from "@/types/episodes"
import type { EpisodeSponsorData } from "@/lib/queries/episode-sponsors"
import type { ActiveTeaserView } from "@/lib/teaser"
import { EpisodeConnections } from "./episode-connections"
import { AudioPlayer } from "./audio-player"
import { EpisodePlatformLinks } from "./episode-platform-links"
import { EpisodeSponsor } from "./episode-sponsor"
import { formatTimeSeconds } from "@/lib/utils"
import { truncateOnWord } from "@/lib/shared/formatters"

function TimestampLink({ seconds, title }: { seconds: number; title: string }) {
  const { seekTo } = usePlayer()

  return (
    <button
      onClick={() => seekTo(seconds)}
      // ص-٨ — `py-2` on a `text-caption` line box measures 40.5px, under the
      // 44px target, and this is the most-tapped control on the page.
      // `min-h-11` (44px) fixes the floor without changing the resting look.
      // The focus ring is the same convention as `episode-hero.tsx` — the
      // global `:focus-visible` rule did draw *a* ring here, but with
      // `ring-ring` rather than the brand `ring-primary/40` every other
      // focusable control on this page uses.
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
    >
      {/* Fixed column. `formatTimeSeconds` returns `M:SS` under the hour and
          `H:MM:SS` over it, so in a list that crosses the hour every title
          below that point started ~35px further in than the ones above it.
          `min-w-16` (64px) holds the widest form at this size. */}
      <span className="min-w-16 shrink-0 font-mono text-caption tabular-nums text-primary">
        {formatTimeSeconds(seconds)}
      </span>
      <span className="text-caption">{title}</span>
    </button>
  )
}

/**
 * "Behind the conversation" — surfaces the previously-orphaned deep analysis
 * (thesis, arc, themes, lessons, open questions) as a collapsible knowledge
 * layer below the takeaways. Unique value even for someone who watched.
 */
function BehindTheConversation({ analysis }: { analysis: EpisodeDeepAnalysisView }) {
  return (
    <details id="sec-behind" className="group rounded-xl border bg-card/40 p-5">
      <summary className="cursor-pointer list-none text-lead font-semibold marker:content-none">
        <span className="inline-flex items-center gap-2">
          <ChevronLeft className="h-4 w-4 transition-transform group-open:-rotate-90" />
          خلف المحادثة — قراءة أعمق
        </span>
      </summary>

      <div className="mt-4 space-y-5">
        {analysis.thesis && (
          <div>
            <h3 className="mb-1 text-caption font-medium text-primary">الأطروحة الرئيسية</h3>
            <p className="max-w-measure text-muted-foreground">{analysis.thesis}</p>
          </div>
        )}

        {analysis.conversation_arc && (
          <div>
            <h3 className="mb-1 text-caption font-medium text-primary">مسار المحادثة</h3>
            <p className="max-w-measure text-muted-foreground">{analysis.conversation_arc}</p>
          </div>
        )}

        {analysis.themes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-caption font-medium text-primary">المحاور</h3>
            {analysis.themes.map((t, i) => (
              <div key={i}>
                <p className="text-caption font-medium">{t.name}</p>
                {t.description && <p className="text-caption text-muted-foreground">{t.description}</p>}
              </div>
            ))}
          </div>
        )}

        {analysis.lessons.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-caption font-medium text-primary">دروس مستفادة</h3>
            {analysis.lessons.map((l, i) => (
              <div key={i}>
                <p className="text-caption font-medium">{l.title}</p>
                {l.explanation && <p className="text-caption text-muted-foreground">{l.explanation}</p>}
              </div>
            ))}
          </div>
        )}

        {analysis.open_questions.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-caption font-medium text-primary">أسئلة مفتوحة</h3>
            <ul className="space-y-1">
              {analysis.open_questions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-caption text-muted-foreground">
                  <span className="mt-0.5 shrink-0 text-primary">؟</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

export interface EpisodeTopicChip {
  id: string
  name: string
  slug: string
}

export interface EpisodeDeepAnalysisView {
  thesis: string | null
  conversation_arc: string | null
  themes: { name: string; description: string }[]
  lessons: { title: string; explanation: string }[]
  open_questions: string[]
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
  topics?: EpisodeTopicChip[]
  deepAnalysis?: EpisodeDeepAnalysisView | null
  episodeTeaser?: ActiveTeaserView | null
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
  topics = [],
  deepAnalysis = null,
  episodeTeaser = null,
  initialStartTime,
}: EpisodePageClientProps) {
  // Track episode view
  const trackedRef = useRef(false)
  useEffect(() => {
    if (trackedRef.current) return
    trackedRef.current = true
  }, [episode.id, episode.guest_id])

  const summary = episode.summary || episode.description || null
  const takeaways = episode.key_takeaways ?? []
  const hasDbTimestamps = episode.timestamps.length > 0
  const hasDbQuotes = episode.quotes.length > 0

  // ص-٨ — the hero teaser.
  //
  // `hero_summary` is written for this exact slot (two sentences, under
  // 200 chars, explicitly forbidden from opening with "في هذه الحلقة") and
  // was generated on 7/7 enriched episodes without ever being read by any
  // public surface. The slot was instead filled by the first 153
  // characters of `full_summary` — cut mid-word, and rendered again in
  // full about 500px further down the same page.
  //
  // The slice stays only as the fallback for episodes that have no
  // enrichment yet, and it now cuts on a word boundary.
  const teaser = enrichment?.hero_summary?.trim() || truncateOnWord(summary, 150)

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

          {/* 3. Why This Conversation — the anchor only exists when the
              section does. `WhyThisConversation` returns null without text,
              so the unconditional wrapper left `<div id="sec-why"></div>` in
              the markup and any index link pointing at it jumped to nothing.
              Same shape as `sec-summary` below. */}
          {enrichment?.why_this_conversation && (
            <div id="sec-why">
              <WhyThisConversation text={enrichment.why_this_conversation} />
            </div>
          )}

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
              <h2 className="text-lead font-semibold">فهرس الحلقة</h2>
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
              <h2 className="text-lead font-semibold">اقتباسات من الحلقة</h2>
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

          {/* 10. Takeaways — the anchor only exists when the section does.
              `EpisodeIdeas` returns null without takeaways, and the wrapper was
              unconditional, so all 41 episodes shipped a bare
              `<div id="sec-takeaways"></div>`: an anchor that scrolls a reader
              to nothing. Exactly the shape already fixed for `sec-why` above,
              which is why it is worth stating twice — the pattern recurs
              whenever a nullable section gets an id. */}
          {takeaways.length > 0 && (
            <div id="sec-takeaways">
              <EpisodeIdeas takeaways={takeaways} />
            </div>
          )}

          {/* 10b. Behind the conversation — surfaced deep analysis */}
          {deepAnalysis && <BehindTheConversation analysis={deepAnalysis} />}

          {/* 10c. Topics */}
          {topics.length > 0 && (
            <div id="sec-topics" className="space-y-3">
              <h2 className="text-lead font-semibold">موضوعات الحلقة</h2>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <Link
                    key={t.id}
                    href={`/topics/${encodeURIComponent(t.slug)}`}
                    className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-caption font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 11. Resources */}
          {episode.resources.length > 0 && (
            <div id="sec-resources" className="rounded-lg border p-4">
              <ResourcesList resources={episode.resources} />
            </div>
          )}

          {/* 11b. Sponsor */}
          {sponsor && <EpisodeSponsor sponsor={sponsor} />}

          {/* 11c. Teaser — the pre-release teaser, now archived on the
              published episode (compact inline block; Sara note 3/5). */}
          {episodeTeaser && (
            <div id="sec-teaser" className="space-y-3">
              <h2 className="text-lead font-semibold">التيزر</h2>
              <TeaserInline teaser={episodeTeaser} />
            </div>
          )}

          {/* 12. Exclusive Clip */}
          <ExclusiveClip data={enrichment?.exclusive_clip} />

          {/* 13. Unsaid Reflections */}
          <UnsaidReflections items={enrichment?.unsaid_reflections} />

          {/* 14. Connected Content: quotes, reflections */}
          <EpisodeConnections
            homeQuotes={homeQuotes}
            reflections={reflections}
          />

          {/* 15. Next / Previous Navigation.
              `min-w-0` on each card is load-bearing: `truncate` sets
              white-space:nowrap, so the card's automatic minimum size became
              the full untruncated title and `flex-1` could not shrink it. On a
              375px viewport that pushed «الحلقة التالية» right off the page,
              behind the container's overflow-x-hidden. */}
          {(prev || next) && (
            <div className="flex items-stretch gap-4 pt-8 border-t">
              {prev ? (
                <Link
                  href={`/episodes/${prev.slug}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <div className="min-w-0">
                    <p className="text-micro text-muted-foreground">الحلقة السابقة</p>
                    <p className="mt-0.5 truncate text-caption font-medium group-hover:text-primary transition-colors">
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
                  className="group flex min-w-0 flex-1 items-center justify-end gap-3 rounded-xl border p-4 text-end transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="text-micro text-muted-foreground">الحلقة التالية</p>
                    <p className="mt-0.5 truncate text-caption font-medium group-hover:text-primary transition-colors">
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
