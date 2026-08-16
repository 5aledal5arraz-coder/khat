"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { guestCutoutUrl } from "@/lib/media/guest-cutouts"
import { khatCut } from "@/components/brand/khat-frame"
import { KhatMarkPanel } from "@/components/media/khat-mark-panel"
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
 * SMOOTHNESS. Several things were fighting each other; the fix is all of them.
 *
 * 1. SNAPPING IS OFF ON TOUCH — `snap-none`, with `sm:snap-x sm:snap-proximity`
 *    restoring it only where the arrows exist. Mandatory snapping was the first
 *    culprit (it overrides the browser's momentum outright, grabbing a flick
 *    mid-glide), and proximity fixed the pointer case. But on a phone even
 *    proximity fights the finger: a native list scrolls exactly as far as it was
 *    thrown and decelerates on its own curve, and any snapping re-times the tail
 *    of that gesture. Snapping earns its place on a mouse, where the arrows move
 *    in whole cards and alignment is the point; a thumb wants the row to behave
 *    like every other row on the phone.
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
  // The arrows are `hidden sm:flex`. Below that breakpoint they do not exist,
  // so every scroll measurement taken to fade them in and out is work done for
  // a control nobody can see — and it is done DURING a touch scroll, on the
  // slowest device that will ever run this. The listener is now attached only
  // at the width where the arrows are real.
  const [showArrows, setShowArrows] = useState(false)

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

  // Matches the `sm:` breakpoint the arrows are gated on. `matchMedia` rather
  // than a resize listener reading `innerWidth`: it fires only when the answer
  // actually changes, instead of on every pixel of a drag.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)")
    const apply = () => setShowArrows(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!showArrows) return
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
  }, [measure, sync, showArrows])

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
        // `snap-none` by default and snapping only from `sm:` up — see the
        // note above; a thumb wants the browser's own momentum, untouched.
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
        className="scrollbar-hide flex snap-none gap-6 overflow-x-auto overscroll-x-contain px-[calc(max(0px,(100%-72rem)/2)+1.5rem)] pb-2 sm:snap-x sm:snap-proximity sm:scroll-p-[calc(max(0px,(100%-72rem)/2)+1.5rem)]"
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
 * An «قريباً» guest is not a link BY DEFAULT — their `/guests/[slug]` page is
 * empty until an episode airs, and a teaser that leads nowhere is worse than a
 * teaser that stays put.
 *
 * The exception is `upcomingHref`: when that guest has a PUBLISHED «حلقة
 * قادمة» page, the face leads to `/episodes/<slug>` — the episode's permanent
 * URL, already serving real content. The decision is made on the server
 * (`attachUpcomingHrefs`), because only the server can see `status`; here the
 * href is either present or it isn't.
 *
 * It still reads as upcoming: the dashed outline and the «قريباً» badge stay,
 * and the hover is deliberately a DIFFERENT gesture from a published face.
 * A published face grows (`scale-105`) — this one comes into focus, dropping
 * the `opacity-75 saturate-50` that marks it as not-yet-aired. Same signal
 * either way ("this responds"), but the two never look interchangeable.
 */
function GuestFace({ guest }: { guest: MuseumThinker }) {
  const upcomingLinked = Boolean(guest.isUpcoming && guest.upcomingHref)
  // The background-free portrait when one exists — the same file the guest card
  // uses. `imageUrl` can also be an admin-set `custom_image`, which has no
  // cut-out and falls through to being cropped as before.
  const cutout = guestCutoutUrl(guest.imageUrl)

  const portrait = (
    <>
      {/* THE CUT, at the smallest size the page uses it.
          It is the same rule as the episode frame and the episode cards —
          `KHAT_CUT` — so a face here and an episode below are the same object
          seen at two scales. No tail and no diamond: on a 96px tile a tail is
          three pixels of noise, and the diamond belongs to the surfaces where
          it has ground to sit on.

          The container has to be OUTSIDE the tile: an element does not
          establish a container for its own properties, so `cqw` on the tile
          itself would resolve against the viewport. */}
      {/* THE WRAPPER CARRIES THE TILE'S WIDTH, and it has to.
          `container-type: inline-size` means the element's inline size may not
          depend on its contents — so a shrink-wrapping wrapper in this flex row
          collapsed to 0x0 and took the tile with it, and `10cqw` fell back to
          10% of the VIEWPORT (measured: 84.1px on an 841px window, against a
          112px tile). Stating the width here is what makes the container legal
          and the cut 11px instead of 84. */}
      <div style={{ containerType: "inline-size" }} className="w-24 shrink-0 sm:w-28">
      <div
        className={cn(
          // A ROUNDED SQUARE ON INDIGO, NOT A CIRCLE ON GREY — the same tile the
          // guest card draws, so a face is the same object here as it is on the
          // list, the episode page and the guest's own page.
          //
          // The circle was the odd one out twice over. `GuestPortrait` states
          // the rule in its own header — the wordmark is built from
          // parallelograms, so a circle contradicts the one shape the identity
          // owns — and this strip was the only place still drawing one. The
          // ground is Deep Indigo because the portrait is now a cut-out with no
          // background of its own.
          "relative h-24 w-24 overflow-hidden rounded-2xl bg-primary transition-transform duration-300 sm:h-28 sm:w-28",
          // A DASHED OUTLINE, NOT A DASHED RING: Tailwind has no `ring-dashed`,
          // so the first version of this rendered a plain solid ring and the
          // «قريباً» face was distinguished by the badge alone. `outline-*`
          // carries a real style axis.
          guest.isUpcoming
            ? "outline outline-2 outline-dashed outline-primary/50 outline-offset-2"
            // The hover grow is gated behind a real hover device. On a phone
            // `:hover` latches after a tap and stays, so the transform ran
            // during the scroll that followed — animating a face while the row
            // it sits in is moving.
            // NO RING. A 1px border cannot survive the clip — the diagonal edge
            // would be unstroked while the other three are outlined, which
            // reads as a rendering fault. The indigo tile is its own edge.
            : "[@media(hover:hover)]:group-hover:scale-105",
        )}
        style={{ clipPath: khatCut() }}
      >
        {guest.imageUrl ? (
          <Image
            src={cutout ?? guest.imageUrl}
            alt={guest.name}
            fill
            sizes="112px"
            // EAGER, on purpose, against the usual advice.
            //
            // `next/image` lazy-loads by default, so a face entered the
            // viewport as the thumb dragged it in and only THEN started
            // fetching and decoding. Decoding on the same thread that is
            // animating the scroll is the classic phone stutter, and it fires
            // once per face — the row stuttered exactly as often as it moved.
            //
            // Lazy loading is the right default when the cost is real. Here it
            // is not: these are 112px circles, the whole roster is a few tens
            // of kilobytes, and they sit near the top of the homepage where
            // they will almost all be seen anyway.
            loading="eager"
            className={cn(
              // A cut-out has to STAND on the tile, not fill it: cropping one
              // to cover would cut the head off at the top, which is the whole
              // reason the original photo was cropped square in the first place.
              cutout ? "object-contain object-bottom" : "object-cover",
              guest.isUpcoming && "opacity-75 saturate-50",
              // The hover for a LINKED upcoming face: the dimming lifts instead
              // of the portrait growing. Gated behind a real hover device for
              // the same reason `scale-105` is — on a phone `:hover` latches
              // after a tap and the face would stay lit through the scroll.
              upcomingLinked &&
                "transition-[opacity,filter] duration-300 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:saturate-100",
            )}
          />
        ) : (
          // NO YOUTUBE THUMBNAIL AS A FACE — the posters carry burned-in
          // headlines, so a square crop lands on type, not a person.
          //
          // AND NO INITIAL EITHER. This drew `{name.charAt(0)}` in
          // `text-primary` on `bg-primary/10`; the moment the tile became Deep
          // Indigo that was indigo on indigo — measured at rgb(54,46,109) on
          // rgb(54,46,109), a contrast ratio of 1. It was also the exact
          // mechanism `GuestPortrait` documents as broken for Arabic: three of
          // the faces in this strip rendered «ا», because family names begin
          // with «ال». The shared empty panel is the site's one answer for an
          // image that has not arrived, and it says nothing about who the
          // person is — which is the truth.
          //
          // IT KEEPS ITS OWN `bg-secondary`. The first version passed
          // `bg-transparent` so the indigo tile showed through — and «ط» is
          // `text-primary/25`, i.e. Deep Indigo at a quarter on Deep Indigo.
          // Same invisibility as the initial it replaced, one step later. The
          // panel is a tested pairing; let it bring its own ground.
          <KhatMarkPanel markClassName="text-subhead" />
        )}
      </div>
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
  // Both link branches carry it: a keyboard user tabbing the strip must be able
  // to see where they are, and an upcoming face is now tabbable too.
  const focusRing =
    "rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"

  // The server already decided this face has a live page — go straight to the
  // episode's permanent URL, not to the still-empty guest page.
  if (upcomingLinked) {
    return (
      <Link href={guest.upcomingHref as string} className={cn(shell, focusRing)}>
        {portrait}
      </Link>
    )
  }

  if (guest.isUpcoming || !guest.slug) {
    return <div className={shell}>{portrait}</div>
  }

  return (
    <Link href={`/guests/${encodeURIComponent(guest.slug)}`} className={cn(shell, focusRing)}>
      {portrait}
    </Link>
  )
}
