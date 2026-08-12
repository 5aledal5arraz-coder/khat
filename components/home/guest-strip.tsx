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
 * direction from the sign: «التالي» always means a negative delta in the writing
 * direction and the browser resolves it. Reading `Math.abs()` is what makes the
 * end-detection work across engines.
 *
 * SMOOTHNESS — three things were fighting each other, and the fix is all three.
 *
 * 1. `snap-mandatory` yanks. Mandatory snapping overrides the browser's own
 *    momentum: a trackpad flick gets grabbed mid-glide and dragged to the
 *    nearest face, which reads as stutter rather than as alignment. `proximity`
 *    only engages when the scroll already ends near a snap point, so a flick
 *    coasts and a small nudge still lands clean.
 * 2. The arrow step was a hardcoded 320px against a card that measures ~136px
 *    (a 112px portrait plus a 24px gap). Every click landed 2.35 cards along —
 *    mid-face — and mandatory snapping then hauled it the rest of the way. The
 *    step is now MEASURED off the rendered card and rounded to a whole number
 *    of cards that fits the viewport, so the motion ends where it aims.
 * 3. `sync` ran on every scroll event and read `scrollWidth`/`clientWidth` each
 *    time — a forced layout on every frame of every scroll, on the busiest
 *    section of the homepage. It is now throttled to one read per animation
 *    frame.
 */

export function GuestStrip({ guests }: { guests: MuseumThinker[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    // See the RTL note above: the sign of scrollLeft is engine-dependent.
    const offset = Math.abs(el.scrollLeft)
    const max = el.scrollWidth - el.clientWidth
    setAtStart(offset < 8)
    setAtEnd(max - offset < 8)
  }, [])

  // One layout read per frame. Without this the two getters above run on every
  // scroll event — the browser must flush layout to answer them, and doing that
  // inside the scroll it is already animating is what makes a strip feel heavy.
  const sync = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      measure()
    })
  }, [measure])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    el.addEventListener("scroll", sync, { passive: true })
    window.addEventListener("resize", sync)
    return () => {
      el.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [measure, sync])

  /**
   * How far one arrow press travels: as many whole cards as the viewport shows,
   * never fewer than one. Measured rather than assumed, so it stays right when
   * the portrait grows at `sm:` or the gap changes.
   */
  const stepFor = (el: HTMLDivElement) => {
    const card = el.firstElementChild
    if (!card) return el.clientWidth
    const cardWidth = card.getBoundingClientRect().width
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const per = cardWidth + gap
    if (!per) return el.clientWidth
    return per * Math.max(1, Math.floor(el.clientWidth / per))
  }

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: dir * stepFor(el), behavior: "smooth" })
  }

  if (guests.length === 0) return null

  return (
    <div className="relative">
      {/* EDGE FADES. Full-bleed means faces are cut by the viewport, and a
          hard-sliced portrait at the border looks like a rendering fault. These
          dissolve the first and last face into the page instead, which also
          says "there is more this way" without an arrow. `pointer-events-none`
          so they never eat a click on the face beneath. Hidden below `sm`,
          where the gutter is small and the fade would cover most of a face. */}
      <div className="pointer-events-none absolute inset-y-0 start-0 z-10 hidden w-[max(1.5rem,calc((100%-72rem)/2))] bg-gradient-to-l from-background to-transparent sm:block" />
      <div className="pointer-events-none absolute inset-y-0 end-0 z-10 hidden w-[max(1.5rem,calc((100%-72rem)/2))] bg-gradient-to-r from-background to-transparent sm:block" />

      <div
        ref={trackRef}
        // `scrollbar-hide` is THIS project's utility (app/globals.css) — it
        // covers both `scrollbar-width` and the WebKit pseudo-element. Tailwind
        // ships no `scrollbar-none`, so naming it that hid the bar in Firefox
        // and left it drawn in Safari and Chrome.
        // `snap-proximity`, NOT `snap-mandatory` — see the note above.
        // `overscroll-x-contain` keeps a flick that reaches the last face from
        // continuing into the page's own scroll, and on a trackpad stops it
        // triggering the browser's horizontal back-swipe.
        //
        // The padding is where full-bleed is actually implemented: the track
        // spans the whole width, and its first face starts exactly under the
        // «الضيوف» label — `(100% - 72rem) / 2` is the container's own inset
        // (`max-w-6xl` = 72rem) and `1.5rem` is its `px-6`, with `max()`
        // collapsing to the plain gutter on narrow screens. `scroll-p-*`
        // repeats it so a snapped face lands on that line rather than flush
        // against the viewport.
        //
        // `100%`, NOT `100vw`: `100vw` includes the vertical scrollbar, which
        // put the first face 4px outside the heading it is meant to line up
        // under. A percentage resolves against this element's own full-width
        // box — the viewport MINUS the scrollbar, which is the number the
        // centred container above is already working from.
        className="scrollbar-hide flex snap-x snap-proximity gap-6 overflow-x-auto overscroll-x-contain px-[calc(max(0px,(100%-72rem)/2)+1.5rem)] pb-2 scroll-p-[calc(max(0px,(100%-72rem)/2)+1.5rem)]"
      >
        {guests.map((g) => (
          <GuestFace key={g.id} guest={g} />
        ))}
      </div>

      {/* The arrows are a convenience on top of native scrolling, so they are
          hidden from assistive tech rather than duplicating the list. On touch
          they stay out of the way entirely.

          Anchored to the CONTAINER edge rather than the viewport: now the
          strip is full-bleed, `end-0` would have parked them in the far
          margin, unattached to anything. `top-[3.5rem]` centres them on the
          portrait — `top-1/2` measured the whole block including the name and
          role beneath, so they sat low, level with the caption. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => nudge(1)}
        className={cn(
          "absolute end-[max(0.5rem,calc((100%-72rem)/2))] top-[3.5rem] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur transition-opacity sm:flex",
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
          "absolute start-[max(0.5rem,calc((100%-72rem)/2))] top-[3.5rem] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur transition-opacity sm:flex",
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
