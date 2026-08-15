import Link from "next/link"
import { CalendarClock, Youtube } from "lucide-react"

import { formatArabicDate } from "@/lib/shared/formatters"
import type { UpcomingEpisodeWithGuest } from "@/lib/queries/upcoming-episodes"
import type { Episode, Guest } from "@/types/database"
import { GuestCard } from "@/components/guests/guest-card"
import { NewsletterSignup } from "@/components/forms/newsletter-signup"
import { EpisodeRecommendations } from "./episode-recommendations"
import { VoiceNote } from "./voice-note"

/**
 * `/episodes/<slug>` BEFORE the episode exists.
 *
 * Same URL, same shell as the published page — this is the earlier era of one
 * address, not a different page. What it must never do is imply there is
 * something to watch:
 *
 *  · **NO 16:9 FRAME, NO `PlayBadge`, NO THUMBNAIL.** Every dark widescreen box
 *    on this site is a video, and the one on a page with no video produced
 *    «ضغطت وما اشتغل» — a tap on a control that cannot do anything. The visual
 *    is the guest's PORTRAIT, which is a person, not a player.
 *  · **ONE SOLID BUTTON on the whole page**, and it belongs to the newsletter.
 *    That is the only thing a visitor can actually do here, so it gets the only
 *    button. YouTube is a text link underneath — a second filled button would
 *    split a page that has exactly one ask.
 *  · **No `PodcastEpisode` JSON-LD** (see the page route): structured data for
 *    an episode that has not aired is a claim we cannot back.
 */
export function UpcomingEpisodePage({
  upcoming,
  youtubeUrl,
  recommendations,
}: {
  upcoming: UpcomingEpisodeWithGuest
  /** From `podcast_platform_links` — null when no active YouTube row exists. */
  youtubeUrl: string | null
  recommendations: (Episode & { guest?: Guest | null })[]
}) {
  const { guest } = upcoming
  const dateLabel = upcoming.expected_date ? formatArabicDate(upcoming.expected_date) : "قريباً"

  return (
    <div className="container mx-auto overflow-x-hidden px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-10">
        {/* ── 1. The badge ────────────────────────────────────────────────
            `text-accent-strong` (KHAT Burnt Orange), NOT `text-accent`. On the
            page background the brand orange reaches ~3:1 — fine for a mark,
            short of the 4.5:1 that a 12px label needs. The rule is stated at
            the token in app/globals.css; this is a small label, so it takes
            the readable orange. */}
        <header className="space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-strong/25 bg-accent-strong/10 px-3 py-1 text-micro font-semibold text-accent-strong">
            <CalendarClock className="h-3.5 w-3.5" />
            حلقة قادمة
          </span>

          {/* ── 2. Guest → title → date → the honest line ───────────────── */}
          {guest ? (
            <p className="text-caption font-semibold text-muted-foreground">
              مع {guest.name}
            </p>
          ) : null}

          <h1 className="text-balance text-heading font-bold leading-tight text-foreground sm:text-title">
            {upcoming.title}
          </h1>

          <p className="text-lead font-semibold text-foreground">{dateLabel}</p>

          {/* Said outright, above the fold, in the page's own voice. A visitor
              who arrived from a newsletter link needs one sentence to know why
              there is no video — not a badge they have to interpret. */}
          <p className="text-body text-muted-foreground">
            الحلقة ما نزلت بعد — هذي صفحتها قبل النزول.
          </p>
        </header>

        {/* ── 3. NO SEPARATE PORTRAIT ANY MORE ────────────────────────────
            A 200px rounded square stood here, and the guest block further down
            showed the same face a second time. The guest card in §7 carries the
            portrait now, so this page shows a person once. */}

        {/* ── 4. What the episode is about ───────────────────────────────── */}
        {upcoming.summary ? (
          <section className="space-y-3">
            <h2 className="text-subhead font-bold text-foreground">عن هذي الحلقة</h2>
            <div className="max-w-measure space-y-4 text-body leading-relaxed text-muted-foreground">
              {upcoming.summary
                .split(/\n{2,}/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
            </div>
          </section>
        ) : null}

        {/* ── 5. The axes ─────────────────────────────────────────────────
            An ordered list because the order is Khaled's — these are the
            conversation's planned movements, not a bag of tags. */}
        {upcoming.axes.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-subhead font-bold text-foreground">محاور نتكلم عنها</h2>
            <ol className="max-w-measure space-y-2.5">
              {upcoming.axes.map((axis, i) => (
                <li key={i} className="flex gap-3 text-body text-foreground">
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 font-mono text-caption tabular-nums text-accent-strong"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-muted-foreground">{axis}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* ── 6. THE ASK ──────────────────────────────────────────────────
            The page's reason to exist: a visitor who cannot watch anything yet
            can still be told when they can. It sits above the guest card on
            purpose — the card is context, this is the action. */}
        <NewsletterSignup variant="upcoming" />

        {/* ── 7. The guest, and their word BEFORE the episode ─────────────
            «قبل النزول», not «بعد تسجيل الحلقة». The published page's card
            carries a testimonial — a recommendation from someone who has seen
            the result. This is an invitation from someone who hasn't. Same
            shape, different speech act; the signature is what tells them
            apart, so it is not shared with the other card. */}
        {guest ? (
          <section className="space-y-4">
            {/* The same card as everywhere else. It already handles the case
                this page has and the episode page does not — a guest with no
                `slug` yet, who becomes a plain box instead of a link. */}
            <GuestCard guest={guest} />

            {upcoming.guest_message || upcoming.guest_message_audio_url ? (
              <div className="relative rounded-3xl border border-border bg-card p-6">
                <h3 className="text-caption font-semibold text-foreground">
                  كلمة من الضيف قبل النزول
                </h3>

                {upcoming.guest_message ? (
                  <p className="mt-2 text-caption italic text-foreground/90">
                    {upcoming.guest_message}
                  </p>
                ) : null}

                {upcoming.guest_message_audio_url ? (
                  <VoiceNote
                    src={upcoming.guest_message_audio_url}
                    durationSeconds={upcoming.guest_message_audio_duration}
                    label={`صوت ${guest.name}`}
                    className="mt-3"
                  />
                ) : null}

                <p className="mt-3 text-micro text-muted-foreground">
                  — {guest.name}، قبل نزول الحلقة
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── 8. YouTube, as a line of text ───────────────────────────────
            The URL comes from `podcast_platform_links`, never a literal: the
            channel address is owned in one place and every surface reads it
            from there. No active row → no line, rather than a guessed link.
            `?sub_confirmation=1` opens the subscribe dialog on arrival, which
            is the only reason to send someone to a channel with nothing new
            on it yet. */}
        {youtubeUrl ? (
          <p className="text-caption text-muted-foreground">
            بتنزل على يوتيوب —{" "}
            <a
              href={withSubConfirmation(youtubeUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              <Youtube className="h-4 w-4" aria-hidden />
              اشترك بالقناة عشان توصلك
            </a>
          </p>
        ) : null}

        {/* ── 9. A way out ────────────────────────────────────────────────
            Without this the page is a dead end: nothing to play, and no route
            back into the archive for someone who came for a link and stayed. */}
        <EpisodeRecommendations episodes={recommendations} />
      </div>
    </div>
  )
}

/**
 * Add `sub_confirmation=1` without assuming the stored URL is bare — several
 * rows in `podcast_platform_links` carry their own query string, and string
 * concatenation would have produced a second `?`.
 */
function withSubConfirmation(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set("sub_confirmation", "1")
    return u.toString()
  } catch {
    return url
  }
}
