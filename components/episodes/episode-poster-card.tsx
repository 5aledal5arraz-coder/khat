import Link from "next/link"
import { EpisodeThumb } from "@/components/media/episode-thumb"
import {
  displayEpisodeTitle,
  episodeDurationLabel,
  formatArabicDate,
} from "@/lib/shared/formatters"
import type { Episode } from "@/types/database"

// `episodeDurationLabel` used to be DEFINED here, which is how the site ended
// up with two duration formats: this copy said «2 س 15 د» and `formatDuration`
// in the formatters module said «2:15» for the same episode. Date/time/duration
// formatting lives in lib/shared/formatters.ts only — import it from there.

/**
 * The episode card. There is one — this one.
 *
 * It absorbed `components/episodes/episode-card.tsx`, which was the same object
 * in a second costume: a `.museum-frame` (black #121110 panel, gold border,
 * square corners, 16px of padding) wrapping a GRAYSCALE thumbnail with the
 * duration stamped over the image. That card rendered on `/guests/[slug]`,
 * `/topics/[slug]` and the recommendation rail while this one rendered on `/`,
 * `/episodes` and `/categories/[slug]`, so the same episode had two frames, two
 * corner radii and two saturation policies depending on which page you reached
 * it from.
 *
 * `showCategory` is opt-in rather than automatic: this card renders on several
 * surfaces, and a badge that leaks onto all of them is noise (on a category
 * page every card would carry the same badge). The badge is a `<span>`, never
 * an `<a>` — the whole card is already a `Link`, and a nested link produces
 * invalid markup that breaks keyboard traversal.
 *
 * `showDate` exists for the same reason and arrived with the merge: the card it
 * replaced printed a release date on the guest and topic pages, where a reader
 * is scanning one person's or one theme's episodes in time order and the date
 * is the thing that orders them. On the homepage grid, under a featured card
 * that already carries the newest date, it is repetition.
 */
export function EpisodePosterCard({
  ep,
  showCategory = false,
  showDate = false,
}: {
  ep: Episode
  showCategory?: boolean
  showDate?: boolean
}) {
  const categoryName = showCategory ? ep.category?.name : null
  const duration = episodeDurationLabel(ep.duration_minutes)
  return (
    <Link
      href={`/episodes/${ep.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-[0_2px_8px_rgba(40,30,90,0.05),0_24px_50px_-26px_rgba(40,30,90,0.3)]"
    >
      {/* Nothing is rendered inside this box except the frame itself. The
          thumbnails are hand-composed 16:9 posters with the episode title
          burned into the artwork — a badge, a gradient or a duration chip lands
          on type we do not control. The hover play button that used to sit here
          is gone for the same reason (and it only ever appeared on a mouse). */}
      <div className="relative aspect-video overflow-hidden bg-secondary">
        <EpisodeThumb
          ep={ep}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        {ep.guest?.name ? (
          <span className="text-micro font-semibold text-accent-strong">{ep.guest.name}</span>
        ) : null}
        {/* `text-lead`, not `text-body`: at `text-body` the card's TITLE sat at
            exactly the body step, so the only thing separating a title from
            running copy was font-weight. One step up restores a size
            difference. */}
        {/* `displayEpisodeTitle`, not `ep.title`: every stored title ends in the
            YouTube brand stamp («… | 019 بودكاست خط»), which on this site's own
            grid prints 41 times down one page and costs a measured 25% of the
            characters on average. Display only — `ep.title` is still what
            search, `og:title` and the JSON-LD name use. */}
        <h3 className="mt-1 line-clamp-2 text-lead font-bold text-foreground">
          {displayEpisodeTitle(ep.title)}
        </h3>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-micro text-muted-foreground">
          {showDate ? <Meta>{formatArabicDate(ep.release_date)}</Meta> : null}
          <Meta>{duration ?? "حلقة"}</Meta>
          {categoryName ? (
            <Meta>
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-medium">
                {categoryName}
              </span>
            </Meta>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

/**
 * One meta item, with the separator that precedes it.
 *
 * The dot belongs to the item that follows it rather than the one before, so a
 * hidden optional item can never leave a dangling separator — which is what a
 * hand-written `{a}{a && b && "•"}{b}` chain does the first time a third
 * optional field is added.
 */
function Meta({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="text-border first:hidden">
        •
      </span>
      <span>{children}</span>
    </>
  )
}
