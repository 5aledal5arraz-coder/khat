"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MuseumThinker } from "@/lib/content/museum-data"

/**
 * The guests, as a row of faces you scroll through.
 *
 * WHAT THIS REPLACED. The guests used to be interleaved into the episode grid —
 * «حلقتين وبعدها ضيف», a guest landing on every third cell. Khaled asked for the
 * two to separate: the grid goes back to being episodes only, and the people get
 * their own strip above it. A face in a 3-column poster grid competes with the
 * posters; a row of portraits reads as "who has been on the show".
 *
 * WHY A SCROLLER AND NOT A GRID. The strip is meant to hold everyone, not a
 * curated three — twenty today and more each season. A grid of twenty faces is
 * a wall; a strip is a gesture.
 *
 * RTL. `scrollLeft` is NEGATIVE in a right-to-left container in Firefox/WebKit
 * and positive-but-inverted elsewhere, which is why the arrows do not compute a
 * direction from the sign: «التالي» always means `-CARD_STEP` in the writing
 * direction and the browser resolves it. Reading `Math.abs()` is what makes the
 * end-detection work across engines.
 */

const CARD_STEP = 320

export function GuestStrip({ guests }: { guests: MuseumThinker[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    // See the RTL note above: the sign of scrollLeft is engine-dependent.
    const offset = Math.abs(el.scrollLeft)
    const max = el.scrollWidth - el.clientWidth
    setAtStart(offset < 8)
    setAtEnd(max - offset < 8)
  }, [])

  useEffect(() => {
    sync()
    const el = trackRef.current
    if (!el) return
    el.addEventListener("scroll", sync, { passive: true })
    window.addEventListener("resize", sync)
    return () => {
      el.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
    }
  }, [sync])

  const nudge = (dir: 1 | -1) => {
    trackRef.current?.scrollBy({ left: dir * CARD_STEP, behavior: "smooth" })
  }

  if (guests.length === 0) return null

  return (
    <div className="relative">
      <div
        ref={trackRef}
        // `scrollbar-hide` is THIS project's utility (app/globals.css) — it
        // covers both `scrollbar-width` and the WebKit pseudo-element. Tailwind
        // ships no `scrollbar-none`, so naming it that hid the bar in Firefox
        // and left it drawn in Safari and Chrome.
        // `snap` stops a flick from parking a face half-cut.
        className="scrollbar-hide flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2"
      >
        {guests.map((g) => (
          <GuestFace key={g.id} guest={g} />
        ))}
      </div>

      {/* The arrows are a convenience on top of native scrolling, so they are
          hidden from assistive tech rather than duplicating the list. On touch
          they stay out of the way entirely. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => nudge(1)}
        className={cn(
          "absolute end-0 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur transition-opacity sm:flex",
          atStart ? "pointer-events-none opacity-0" : "opacity-100 hover:bg-muted",
        )}
      >
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => nudge(-1)}
        className={cn(
          "absolute start-0 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur transition-opacity sm:flex",
          atEnd ? "pointer-events-none opacity-0" : "opacity-100 hover:bg-muted",
        )}
      >
        <ChevronLeft className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  )
}

/**
 * One face.
 *
 * An «قريباً» guest is NOT a link. Their episode has not aired, so
 * `/guests/[slug]` renders an empty page — a teaser that leads nowhere is worse
 * than a teaser that stays put. It also reads differently on purpose: a dashed
 * ring and a badge, so the row does not imply there is something to watch.
 */
function GuestFace({ guest }: { guest: MuseumThinker }) {
  const initial = guest.name.trim().charAt(0)

  const portrait = (
    <>
      <div
        className={cn(
          "relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted transition-transform duration-300 sm:h-28 sm:w-28",
          // A DASHED OUTLINE, NOT A DASHED RING: Tailwind has no `ring-dashed`,
          // so the first version of this rendered a plain solid ring and the
          // «قريباً» face was distinguished by the badge alone. `outline-*`
          // carries a real style axis.
          guest.isUpcoming
            ? "outline outline-2 outline-dashed outline-primary/50 outline-offset-2"
            : "ring-1 ring-border group-hover:scale-105 group-hover:ring-primary/50",
        )}
      >
        {guest.imageUrl ? (
          <Image
            src={guest.imageUrl}
            alt={guest.name}
            fill
            sizes="112px"
            className={cn("object-cover", guest.isUpcoming && "opacity-75 saturate-50")}
          />
        ) : (
          // NO YOUTUBE THUMBNAIL AS A FACE — the posters carry burned-in
          // headlines, so a square crop lands on type, not a person. The
          // typographic fallback is the honest answer.
          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-3xl font-bold text-primary">
            {initial}
          </div>
        )}
      </div>

      <div className="mt-3 w-28 text-center">
        <p className="truncate text-caption font-semibold text-foreground">{guest.name}</p>
        {guest.isUpcoming ? (
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-micro font-semibold text-primary">
            قريباً
          </span>
        ) : guest.title ? (
          <p className="mt-0.5 truncate text-micro text-muted-foreground">{guest.title}</p>
        ) : null}
      </div>
    </>
  )

  const shell = "group flex snap-start flex-col items-center"

  if (guest.isUpcoming || !guest.slug) {
    return <div className={shell}>{portrait}</div>
  }

  return (
    <Link
      href={`/guests/${encodeURIComponent(guest.slug)}`}
      className={cn(shell, "rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2")}
    >
      {portrait}
    </Link>
  )
}
