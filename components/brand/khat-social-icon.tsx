import { cn } from "@/lib/utils"
import {
  KHAT_BUBBLE_ART,
  KHAT_SOCIAL_ART,
  KHAT_SOCIAL_NAMES,
  type KhatSocialName,
} from "./khat-social-art"

export { KHAT_SOCIAL_NAMES, type KhatSocialName } from "./khat-social-art"

/**
 * The six platform marks the designer drew in the KHAT identity — the real
 * artwork, not a rebuild of it.
 *
 * TikTok, Spotify, Instagram, YouTube, Podcast and X each carry the orange
 * diamond that signs the logo. Before this, the site drew the stock marks and
 * recoloured them, which is a different thing: a stock Instagram glyph tinted
 * indigo is a stock glyph, and it was sitting in the email footer next to a
 * logo that is not.
 *
 * ONE TONE, TWO GROUNDS. Unlike `<KhatIcon>` there is no mono/accent pair,
 * because the designer drew one version and it already works on both: the ink
 * is `currentColor`, so it is indigo on the ivory site footer and ivory on the
 * indigo email footer, and the diamond stays KHAT Orange on either — which is
 * exactly how the social kit uses the strip.
 *
 * THE SET IS SIX. Platforms the identity does not draw keep their stock mark in
 * `components/icons/`; `getPlatformIcon()` is the one place that decides.
 */

export interface KhatSocialIconProps {
  name: KhatSocialName
  /** Square edge in CSS pixels. */
  size?: number
  /**
   * Accessible name. These marks normally sit inside a link that is already
   * labelled, so the default is decorative — pass a string only when the mark
   * is the only thing naming its control.
   */
  label?: string
  className?: string
}

export function KhatSocialIcon({
  name,
  size = 24,
  label,
  className,
}: KhatSocialIconProps) {
  const art = KHAT_SOCIAL_ART[name]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${art.width} ${art.height}`}
      width={size}
      height={size}
      className={cn("block shrink-0", className)}
      {...(label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const, focusable: false as const })}
      // Static, build-time artwork generated from public/brand/social/*.svg by
      // scripts/build-social-icon-art.ts — no user input reaches this string.
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  )
}

/** Type guard for the places that read a platform name out of data. */
export function isKhatSocialName(value: unknown): value is KhatSocialName {
  return (
    typeof value === "string" &&
    (KHAT_SOCIAL_NAMES as readonly string[]).includes(value)
  )
}

/**
 * The identity's core shape on its own — a speech bubble with a cut corner and
 * a tail, drawn on the same artboard as the six.
 *
 * Always decorative: wherever it appears it sits beside text that already says
 * what the thing is.
 */
export function KhatBubble({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${KHAT_BUBBLE_ART.width} ${KHAT_BUBBLE_ART.height}`}
      width={size}
      height={size}
      className={cn("block shrink-0", className)}
      aria-hidden
      focusable={false}
      dangerouslySetInnerHTML={{ __html: KHAT_BUBBLE_ART.body }}
    />
  )
}
