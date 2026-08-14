import { cn } from "@/lib/utils"
import {
  KHAT_DIAMOND_ART,
  KHAT_ICON_ART,
  KHAT_ICON_NAMES,
  type KhatIconName,
} from "./khat-icon-art"

export { KHAT_ICON_NAMES, type KhatIconName } from "./khat-icon-art"

/**
 * The six glyphs of KHAT ICON SYSTEM — the real artwork, not a rebuild of it.
 *
 * Same rule as `<KhatLogo>`: every glyph is cropped out of the identity file
 * (p.13 and p.15) and inlined verbatim, because these are drawings, not
 * lettering — the diamond that signs each one is the dot of the خ, and no icon
 * library contains it.
 *
 * THE SET IS SIX, AND THAT IS THE WHOLE SET. There is no `plus`, no `chevron`,
 * no `check`. Where the identity has no glyph, `lucide-react` stays — a generic
 * library is the right answer for generic furniture (search, arrows, the 72
 * check marks on /partner), and inventing a seventh glyph in this style would be
 * us drawing the identity rather than applying it.
 *
 * TWO TONES, BOTH THE DESIGNER'S:
 *  · `mono` (default) is p.15, a single ink, so it renders as `currentColor` and
 *    follows the control it sits in. This is what makes it usable in the phone
 *    nav, where an inactive tab is dimmed — a baked orange accent would read as
 *    active on every tab at once.
 *  · `accent` is p.13, Signature Purple with a KHAT Orange accent, fills baked
 *    into the path data. No colour props, for the same reason the logo has
 *    none: a token-derived fill silently breaks the identity the first time a
 *    palette moves.
 *
 * NO MIRRORING IN RTL. The bubbles' tails and the archive's lid are drawn one
 * way in the identity file, and inline SVG geometry ignores `dir`, so this holds
 * without doing anything — `tests/brand/icon-art.test.ts` fails if a transform
 * is ever added.
 */

/**
 * How much of the 196 tile to crop away per side when rendering.
 *
 * WHY THIS EXISTS. The identity file draws each glyph centred on a tile with
 * generous margins — measured across the six, the ink is 67.54% of the tile's
 * height. `lucide-react`, which draws every other icon on this site, fills
 * 83.35% of its 24-unit box. So a KHAT glyph and a lucide glyph asked for the
 * same `size` do not come out the same size: the KHAT one renders 19% smaller,
 * and in a row that mixes them — the phone nav, the contribute picker — it
 * reads as a mistake.
 *
 * The fix is a viewBox crop, NOT a change to the artwork. The files in
 * public/brand/icons keep the designer's full tile, which is what a designer
 * downloading them expects and what keeps the six in proportion to each other.
 * Only the view is inset, by the amount that brings the set's mean ink height
 * onto lucide's: (1 - 67.54/83.35) / 2 = 9.49% per side.
 *
 * NOTHING CLIPS. The tightest margin any of the six has is 13.52% — the bar
 * under the bulb in `idea` — so a 9.49% inset clears the worst glyph by 4
 * points.
 * `tests/brand/icon-art.test.ts` re-derives both numbers from the artwork and
 * fails if a redrawn glyph ever narrows that gap.
 */
const OPTICAL_INSET = 0.0949

export interface KhatIconProps {
  name: KhatIconName
  /** Square edge in CSS pixels. */
  size?: number
  /** `mono` inherits `currentColor`; `accent` carries the artwork's own inks. */
  tone?: "mono" | "accent"
  /**
   * Accessible name. Icons here sit beside their own label almost everywhere,
   * so the default is decorative — pass a string only when the glyph is the
   * only thing naming its control.
   */
  label?: string
  className?: string
}

export function KhatIcon({
  name,
  size = 24,
  tone = "mono",
  label,
  className,
}: KhatIconProps) {
  const art = KHAT_ICON_ART[name][tone]
  const inset = art.width * OPTICAL_INSET
  const side = art.width - inset * 2

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${inset.toFixed(2)} ${inset.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}`}
      width={size}
      height={size}
      className={cn("block shrink-0", className)}
      {...(label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const, focusable: false as const })}
      // Static, build-time artwork generated from public/brand/icons/*.svg by
      // scripts/build-brand-icon-art.ts — no user input reaches this string.
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  )
}

/** Type guard for the places that read an icon name out of data. */
export function isKhatIconName(value: unknown): value is KhatIconName {
  return typeof value === "string" && (KHAT_ICON_NAMES as readonly string[]).includes(value)
}

/**
 * The dot of the خ, on its own.
 *
 * It replaces the `Sparkles` glyph that was marking badges and section eyebrows.
 * A four-pointed sparkle is a perfectly good icon and belongs to no one; this
 * one is the single most repeated shape in the identity — it signs four of the
 * six icons, and it is the only coloured element in the logo.
 *
 * Always decorative: it appears next to text that already says what the badge
 * is, so naming it would make a screen reader announce a shape.
 */
export function KhatDiamond({
  size = 12,
  tone = "mono",
  className,
}: {
  size?: number
  tone?: "mono" | "accent"
  className?: string
}) {
  const art = KHAT_DIAMOND_ART[tone]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${art.width} ${art.height}`}
      width={size}
      height={size}
      className={cn("block shrink-0", className)}
      aria-hidden
      focusable={false}
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  )
}
