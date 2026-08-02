import { cn } from "@/lib/utils"
import {
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
