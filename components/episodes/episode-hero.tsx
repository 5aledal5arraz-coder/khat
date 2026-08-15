"use client"

import Link from "next/link"
import { YouTubeEmbed } from "./youtube-embed"
import { KhatFrame } from "@/components/brand/khat-frame"
import { ShareButtons } from "./share-buttons"
import { Calendar, Clock } from "lucide-react"
import { formatDate, formatDuration } from "@/lib/utils"
import { displayEpisodeTitle } from "@/lib/shared/formatters"

interface EpisodeHeroProps {
  episode: {
    id: string
    title: string
    slug: string
    youtube_url: string
    duration_minutes: number
    release_date: string
    season?: number | null
    category?: {
      name: string
      slug: string
    } | null
    guest?: {
      name: string
      slug: string
    } | null
  }
  teaser?: string
  initialStartTime?: number
  /** Trial flag — see the note at the render. */
  khatFrame?: boolean
}

export function EpisodeHero({
  episode,
  teaser,
  initialStartTime,
  khatFrame = false,
}: EpisodeHeroProps) {
  const player = (
    <YouTubeEmbed
      url={episode.youtube_url}
      title={episode.title}
      startTime={initialStartTime}
      episodeId={episode.id}
      episodeSlug={episode.slug}
      durationMinutes={episode.duration_minutes}
    />
  )

  return (
    <div>
      {/* THE KHAT FRAME IS A TRIAL, ON ONE EPISODE, BEHIND `?frame=khat`.
          Khaled asked to see the identity's frame around a video before it goes
          on all of them — «اريد تجربة على حلقه وحده». A query flag rather than a
          column: nothing is written to the database for an experiment that may
          be reverted, and every other episode is untouched while it runs.
          Remove the flag and this branch together when the answer is known. */}
      {khatFrame ? (
        <KhatFrame>{player}</KhatFrame>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_8px_hsl(var(--primary)/0.05),0_28px_64px_-32px_hsl(var(--primary)/0.3)]">
          {player}
        </div>
      )}

      {/* Title block */}
      <div className="mt-7">
        {episode.guest && (
          <Link
            href={`/guests/${episode.guest.slug}`}
            className="text-caption font-bold text-accent transition-opacity hover:opacity-80"
          >
            {episode.guest.name}
          </Link>
        )}

        {/* The <h1> reads the clean title so the card the visitor clicked and
            the page they land on say the same thing. Everything that LEAVES the
            site keeps the full one: the `<title>`/`og:title` in
            app/episodes/[slug]/page.tsx, the JSON-LD `PodcastEpisode.name`, the
            player's iframe title, and the ShareButtons text below. */}
        <h1 className="mt-2 text-pretty text-heading font-bold text-foreground sm:text-title">
          {displayEpisodeTitle(episode.title)}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {formatDate(episode.release_date)}
          </span>
          <span className="text-border">•</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatDuration(episode.duration_minutes)}
          </span>
          {episode.season ? (
            <>
              <span className="text-border">•</span>
              <span>الموسم {episode.season}</span>
            </>
          ) : null}
          {episode.category ? (
            <>
              <span className="text-border">•</span>
              {/* `/categories/…`, not `/episodes?category=…`, and the reason
                  has changed since this was written. The old one was "the
                  archive ignores the param and returns all 41 episodes" —
                  no longer true, /episodes reads `?category=` now. The reason
                  today is that this is the CANONICAL url for a category: both
                  /episodes variants that render the same list point their
                  canonical here, and the sitemap submits this one. Linking to
                  a page that canonicalises somewhere else would be the site
                  disagreeing with its own <head>.
                  Encode the slug — ours are Arabic. */}
              <Link
                href={`/categories/${encodeURIComponent(episode.category.slug)}`}
                className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-micro font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                {episode.category.name}
              </Link>
            </>
          ) : null}
        </div>

        {teaser ? (
          <p className="mt-5 max-w-measure text-pretty text-body text-muted-foreground">
            {teaser}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <span className="text-caption font-medium text-muted-foreground">شارك الحلقة</span>
          <ShareButtons
            url={`/episodes/${episode.slug}`}
            title={episode.title}
            size="default"
          />
        </div>
      </div>
    </div>
  )
}
