import Link from "next/link"
import { CalendarClock } from "lucide-react"

import { formatArabicDate, truncateOnWord } from "@/lib/shared/formatters"
import type { UpcomingEpisodeCard as UpcomingCard } from "@/lib/queries/upcoming-episodes"

/**
 * «حلقة قادمة» on a guest's page — the reason that page exists before the
 * guest has aired anything.
 *
 * **NO THUMBNAIL, NO 16:9 FRAME.** The same rule as the upcoming episode page
 * itself (`components/episodes/upcoming-episode-page.tsx`): every dark
 * widescreen box on this site is a video, and one on a page with no video
 * produces a tap on a control that cannot do anything. There is nothing to
 * play here, so there is nothing that looks playable.
 *
 * `accent-strong`, not `accent`: the brand orange reaches ~3:1 on this
 * background — enough for a mark, short of the 4.5:1 a 12px label needs. The
 * rule is stated at the token in `app/globals.css`.
 *
 * The whole card is the link. A title-only target is a ~200px hit area inside
 * a card that is 100% of the width on a phone.
 */
export function UpcomingEpisodeGuestCard({ upcoming }: { upcoming: UpcomingCard }) {
  // Trimmed on a word boundary, never mid-word: an Arabic word cut in half
  // reads as a typo, not as an ellipsis.
  const summary = truncateOnWord(upcoming.summary, 160)
  // Null date is a deliberate choice per episode, not missing data — an
  // announced day is a commitment (see the schema note on `expected_date`).
  const dateLabel = upcoming.expected_date ? formatArabicDate(upcoming.expected_date) : "قريباً"

  return (
    <Link
      href={`/episodes/${encodeURIComponent(upcoming.slug)}`}
      className="group block rounded-2xl border border-accent-strong/25 bg-card p-5 transition-colors hover:border-accent-strong/50 hover:bg-accent-strong/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 sm:p-6"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-strong/25 bg-accent-strong/10 px-3 py-1 text-micro font-semibold text-accent-strong">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        حلقة قادمة
      </span>

      {/* `h2`, not `h3`. This block deliberately has NO section heading — the
          card must not announce itself when there is nothing to announce — so
          the title sits directly under the page's `h1` and is the same level
          as «التيزر» and «الحلقات» further down. An `h3` here skipped a level
          for a screen reader walking the outline. Caught by Noura. */}
      <h2 className="mt-3 text-balance text-subhead font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
        {upcoming.title}
      </h2>

      {summary ? (
        <p className="mt-2 max-w-measure text-caption leading-relaxed text-muted-foreground">
          {summary}
        </p>
      ) : null}

      <p className="mt-3 text-caption font-semibold text-foreground">{dateLabel}</p>
    </Link>
  )
}
