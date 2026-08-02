import { cn } from "@/lib/utils"
import {
  ART_SRC,
  DEFAULT_LABEL,
  khatLogoGeometry,
  type KhatLogoVariant,
} from "./khat-logo-geometry"

export {
  khatLogoMarkup,
  khatLogoGeometry,
  MIN_HEIGHT,
  type KhatLogoVariant,
} from "./khat-logo-geometry"

/**
 * The Khat logo — the real artwork, not a rebuild of it.
 *
 * Every variant is the official vector cropped out of the identity file and
 * inlined verbatim (see `scripts/build-brand-art.ts`). What that buys us is the
 * one thing a CSS reconstruction can never have: the خ is a custom drawing
 * shaped like a speech bubble, so no font produces it, and the previous
 * component — a rotated square over the word "خط" set in the UI font, on a
 * gradient, with two glows — was a lookalike in invented colours (#3a2d70 /
 * #ee6a2c, neither of which is in the palette).
 *
 * Consequences of "the artwork is the artwork", all deliberate:
 *  · **No colour props.** The fills live in the path data. The identity file
 *    forbids recolouring, and deriving them from theme tokens would break that
 *    silently the first time a palette moves. The reversed / single-colour
 *    variants are the sanctioned exceptions, and they are their own assets
 *    rather than a runtime override.
 *  · **No mirroring in RTL.** The approved horizontal lockup puts the mark on
 *    the left and the name on the right, and the bubble's tail points one way.
 *    Inline SVG geometry ignores `dir`, so this holds for free — and
 *    `tests/brand/logo-art.test.ts` fails if anyone adds a transform.
 *  · **No effects.** No gradient, no shadow, no glow: four of the six formal
 *    "don'ts" were being broken at once.
 */

export interface KhatLogoProps {
  variant?: KhatLogoVariant
  /** Height of the logo itself, in CSS pixels. Clamped to `MIN_HEIGHT`. */
  height: number
  /** Reserve the mandated clear space (x = ⅙ of the logo's width) around it. */
  clearSpace?: boolean
  /**
   * Accessible name. Pass `null` when an ancestor already names the control —
   * a link labelled "خط — الرئيسية" wrapping a logo labelled "خط" is announced
   * twice.
   */
  label?: string | null
  className?: string
}

export function KhatLogo({
  variant = "lockup-horizontal",
  height,
  clearSpace = false,
  label,
  className,
}: KhatLogoProps) {
  const geo = khatLogoGeometry(variant, height, clearSpace)
  const name = label === undefined ? DEFAULT_LABEL[variant] : label

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={geo.viewBox}
      width={geo.width}
      height={geo.height}
      className={cn("block shrink-0", className)}
      {...(name === null
        ? { "aria-hidden": true as const, focusable: false as const }
        : { role: "img", "aria-label": name })}
      // Static, build-time artwork generated from public/brand/*.svg — no user
      // input reaches this string. Inlined rather than <img src> so the mark
      // never flashes, never 404s, and is one code path with the two print
      // documents, which cannot resolve a URL at "Save as PDF" time.
      dangerouslySetInnerHTML={{ __html: geo.art.body }}
    />
  )
}

export interface KhatLogoSwapProps {
  /** What to show below `breakpoint`. */
  compact: { variant: KhatLogoVariant; height: number }
  /** What to show at or above `breakpoint`. */
  full: { variant: KhatLogoVariant; height: number }
  /** CSS length the swap happens at, e.g. `"1024px"` for Tailwind's `lg`. */
  breakpoint: string
  /**
   * Tailwind height utilities matching `compact.height` and `full.height`.
   * Passed in rather than generated because Tailwind cannot see a class name
   * built at runtime — e.g. `"h-[32px] lg:h-[44px]"`.
   */
  heightClassName: string
  label?: string | null
  className?: string
}

/**
 * Two logo variants at two viewport sizes, shipping only ONE of them.
 *
 * WHY THIS EXISTS. The header needs the mark on narrow screens and the full
 * horizontal lockup on wide ones — a real requirement, since `PODCAST KHAT` is
 * unreadable squeezed into a phone header. The obvious way to do that is two
 * `<KhatLogo>` elements with `lg:hidden` / `hidden lg:block`, and that is what
 * the header did. But `display:none` hides bytes, it does not save them: the
 * lockup's geometry is 14,163 B of inlined path data (~5 KB gzipped) and it was
 * in the markup of every page, on every viewport, including phones that never
 * render it — and because it is inlined it is re-sent on every navigation
 * instead of being cached once.
 *
 * `<picture>` with a `media` source is the mechanism built for this: the
 * browser evaluates the query BEFORE fetching and requests exactly one file. A
 * phone downloads the 498 B mark and never learns the lockup exists; a desktop
 * downloads the lockup once and reuses it from cache forever. The inline cost
 * drops from ~14.4 KB to a couple of hundred bytes of markup.
 *
 * The trade is a network round trip for an asset that used to arrive inline, so
 * this is deliberately NOT the default `<KhatLogo>` — it is for the one place
 * that pays for two variants. Sizes still resolve through `khatLogoGeometry`,
 * so this path is held to the same `MIN_HEIGHT` guard as every other caller.
 */
export function KhatLogoSwap({
  compact,
  full,
  breakpoint,
  heightClassName,
  label,
  className,
}: KhatLogoSwapProps) {
  // Both go through the clamp, so neither breakpoint can ask for a size below
  // MIN_HEIGHT without being caught — the guard follows the artwork here too.
  const compactGeo = khatLogoGeometry(compact.variant, compact.height)
  khatLogoGeometry(full.variant, full.height)
  const name = label === undefined ? DEFAULT_LABEL[full.variant] : label

  return (
    <picture>
      <source media={`(min-width: ${breakpoint})`} srcSet={ART_SRC[full.variant]} />
      {/* eslint-disable-next-line @next/next/no-img-element -- <picture> media
          selection is the point; next/image has no equivalent, and these are
          already-optimal hand-cropped SVGs. */}
      <img
        src={ART_SRC[compact.variant]}
        // Intrinsic box of the DEFAULT source, so there is no layout shift
        // before the file arrives; the CSS below is what resizes it at the
        // breakpoint. Both numbers come from the clamped geometry.
        width={compactGeo.width}
        height={compactGeo.height}
        // Above the fold on every page — worth jumping the queue.
        fetchPriority="high"
        alt={name === null ? "" : name}
        // `w-auto` + a CSS height lets each source keep its OWN aspect ratio —
        // the mark is 1.4:1 and the lockup 4.2:1, so a fixed aspect-ratio here
        // would squash one of them.
        className={cn("block w-auto shrink-0", heightClassName, className)}
      />
    </picture>
  )
}
