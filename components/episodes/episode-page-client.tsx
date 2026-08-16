"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { EpisodePlayerProvider, usePlayer } from "./episode-player-context"
import { EpisodeHero } from "./episode-hero"
import { EpisodeSummary } from "./episode-summary"
import { EpisodeIdeas } from "./episode-ideas"
import { EpisodeRecommendations } from "./episode-recommendations"
import { GuestIntroSection } from "./guest-intro-section"
import { EpisodeTranscriptSection } from "./episode-transcript-section"
import { EpisodeStoryQuotes, type QuoteItem } from "./episode-story-quotes"
import type { StoryChapter, StoryParagraph } from "@/lib/stories/story"
import { ResourcesList } from "./resources-list"
import { QuoteCard } from "@/components/quotes/quote-card"
import { WhyThisConversation } from "./why-this-conversation"
import { CentralQuestion } from "./central-question"
import { BeforeYouWatch } from "./before-you-watch"
import { ConversationMap } from "./conversation-map"
import { ExclusiveClip } from "./exclusive-clip"
import { TeaserInline } from "@/components/teaser/teaser-inline"
import { UnsaidReflections } from "./unsaid-reflections"
import type { EpisodeWithRelations, Episode, Guest, PodcastPlatformLink } from "@/types/database"
import type { EpisodeEnrichment } from "@/types/episodes"
import type { EpisodeSponsorData } from "@/lib/queries/episode-sponsors"
import type { ActiveTeaserView } from "@/lib/teaser"
import { AudioPlayer } from "./audio-player"
import { EpisodePlatformLinks } from "./episode-platform-links"
import { EpisodeSponsor } from "./episode-sponsor"
import { formatTimeSeconds } from "@/lib/utils"
import { truncateOnWord, episodeDescriptionProse, parseDescriptionChapters } from "@/lib/shared/formatters"

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
  /**
   * The conversation as words — null for the episodes that have no transcript
   * built yet, which is most of them. Absent means the section does not render,
   * never an empty «نص الحلقة» heading.
   */
  transcript: {
    paragraphs: StoryParagraph[]
    chapters: StoryChapter[]
    wordCount: number
  } | null
  /** Verbatim pull-quotes, proved against the transcript. Null when none. */
  storyQuotes: QuoteItem[] | null
  episode: EpisodeWithRelations
  relatedEpisodes: (Episode & { guest?: Guest | null })[]
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
  transcript,
  storyQuotes,
  relatedEpisodes,
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

  // THE PROSE, NOT THE PASTE. `description` is the raw YouTube text and it
  // carries eight bit.ly lines, a channel roster and eleven hashtags after the
  // write-up — visible under «ملخص الحلقة» on the live page until Khaled
  // pointed at it. `episodeDescriptionProse` drops those blocks and nothing
  // else; it never shortens or rewrites what a human wrote.
  const summary = episodeDescriptionProse(episode)
  const takeaways = episode.key_takeaways ?? []
  /*
   * THE INDEX WAS MISSING ON EVERY EPISODE THAT HAS ONE — Khaled: «وين شريط
   * توقيت الحلقة؟ موموجود».
   *
   * This reads the `timestamps` TABLE, which is empty in production. The
   * chapters live in `episode_enrichments.timestamps` instead, and the
   * transcript file carries the same ten. So the page had an index it refused
   * to draw. Fall back to the transcript's chapters when the table has none;
   * the table still wins when an editor has curated it there.
   */
  //
  // PRECEDENCE, AND THE MIDDLE ONE IS THE POINT. `episode_enrichments` is
  // AI-written and on صلاح الغزالي it invented ten chapters at 0/2/5/10/…/40
  // minutes — round numbers ending on «الخاتمة» at 40:00 for an episode that
  // runs 3:18:00. The producer's real fourteen were in the description all
  // along. An editor's curated table still wins; the model comes last, and
  // only because a rough index beats none.
  const producerChapters = parseDescriptionChapters(episode.description)
  const chapterRows =
    episode.timestamps.length > 0
      ? episode.timestamps.map((t) => ({ id: t.id, seconds: t.time_seconds, title: t.title }))
      : producerChapters.length > 0
        ? producerChapters.map((c) => ({ id: `d-${c.seconds}`, seconds: c.seconds, title: c.title }))
        : (transcript?.chapters ?? []).map((c) => ({
            id: `ch-${c.start}`,
            seconds: c.start,
            title: c.title,
          }))
  const hasDbTimestamps = chapterRows.length > 0
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
              testimonialAudioUrl={episode.guest_audio_url}
              testimonialAudioDuration={episode.guest_audio_duration}
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
            <details id="sec-timestamps" className="group rounded-xl border bg-card/40">
              {/* CLOSED BY DEFAULT, and the closed state has to ANNOUNCE
                  itself. A bare chevron does not: on a long episode this list
                  is 16 rows, and collapsing it silently would just look like
                  the index disappeared. So the summary carries three signals —
                  the count, an explicit «اضغط للعرض», and a chevron that turns
                  — and the whole bar is the hit area, not the arrow alone.

                  `<details>` rather than React state on purpose: it opens
                  without JavaScript, it is a real disclosure widget for screen
                  readers, and Ctrl+F inside the page still finds a closed
                  chapter in browsers that search collapsed content. */}
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors marker:content-none hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">
                <span className="flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4 shrink-0 text-primary transition-transform group-open:-rotate-90" />
                  <span className="text-lead font-semibold">فهرس الحلقة</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-micro font-semibold text-primary tabular-nums">
                    {chapterRows.length}
                  </span>
                </span>
                {/* Swaps on open so the bar never tells the reader to press
                    something that is already pressed. */}
                <span className="shrink-0 text-caption text-muted-foreground">
                  <span className="group-open:hidden">اضغط للعرض</span>
                  <span className="hidden group-open:inline">إخفاء</span>
                </span>
              </summary>

              <div className="space-y-1 px-2 pb-3">
                {chapterRows.map((ts) => (
                  <TimestampLink key={ts.id} seconds={ts.seconds} title={ts.title} />
                ))}
              </div>
            </details>
          )}

          {/* 8a. THE EPISODE IN ITS OWN WORDS — six playable lines, placed
              between the index and the text because they are what makes the
              text worth opening. See the component for why verbatim matters. */}
          {storyQuotes && storyQuotes.length > 0 && (
            <EpisodeStoryQuotes quotes={storyQuotes} />
          )}

          {/* 8b. THE FULL TEXT — merged in from the /stories pilot on
              Khaled's call. It sits directly under the chapter index because
              the two are the same tool at two resolutions: the index is ten
              doors into the episode, the transcript is 288. Collapsed by
              default — it is 19,683 words on this episode — but the markup is
              rendered either way, so Google reads it and Ctrl+F finds it. */}
          {transcript && (
            <EpisodeTranscriptSection
              paragraphs={transcript.paragraphs}
              chapters={transcript.chapters}
              hostName="خالد"
              wordCount={transcript.wordCount}
            />
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

          {/* 14. Related Episodes.
              «اكتشف أكثر» AND the previous/next pair used to stand here, above
              this rail. Both are gone, on Khaled's call — and the reasons are
              worth keeping so neither comes back by habit.

              «اكتشف أكثر» promised more and delivered one uneditable card:
              `home_quotes` is empty, and `daily_reflections` has no admin screen
              at all — 41 rows he can neither write, approve nor remove, ending
              in a question that links nowhere. If reflections return, they
              return WITH an editor; content on the site that nobody controls is
              the thing to avoid, not the section.

              Previous/next WORKED — lane-scoped, correct neighbours, verified —
              which is why it went for a design reason rather than a bug: it
              duplicated this rail directly below it and lost the comparison.
              Two truncated titles with no artwork, ordering an archive that is
              not serial. Someone finishing an episode wants one about the same
              thing, not the one that happened to air the week before. */}
          <div id="sec-related">
          <EpisodeRecommendations episodes={relatedEpisodes} />
          </div>
        </div>
      </div>
    </EpisodePlayerProvider>
  )
}
