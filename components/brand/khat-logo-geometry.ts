import {
  LOCKUP_HORIZONTAL,
  LOCKUP_VERTICAL,
  LOCKUP_VERTICAL_REVERSED,
  MARK,
  MARK_ORANGE,
  MARK_REVERSED,
  SECONDARY_MARK,
  type BrandArt,
} from "./khat-logo-art"

/**
 * Sizing rules for the Khat logo, shared by the React component
 * (`khat-logo.tsx`) and the two self-contained print documents that build raw
 * HTML strings (`lib/pdf/proposal-pdf.ts`, `app/admin/media-kit/page.tsx`).
 *
 * Deliberately free of JSX and React so the print path stays a plain module.
 */

export type KhatLogoVariant =
  | "lockup-horizontal"
  | "lockup-vertical"
  | "lockup-vertical-reversed"
  | "mark"
  | "mark-orange"
  | "mark-reversed"
  | "secondary-mark"

export const ART: Record<KhatLogoVariant, BrandArt> = {
  "lockup-horizontal": LOCKUP_HORIZONTAL,
  "lockup-vertical": LOCKUP_VERTICAL,
  "lockup-vertical-reversed": LOCKUP_VERTICAL_REVERSED,
  mark: MARK,
  "mark-orange": MARK_ORANGE,
  "mark-reversed": MARK_REVERSED,
  "secondary-mark": SECONDARY_MARK,
}

/**
 * Minimum legible heights, in CSS pixels, from the identity file. Below these
 * the lockup's `PODCAST KHAT` line breaks down and the mark's diamond fuses
 * into the bubble.
 */
export const MIN_HEIGHT: Record<KhatLogoVariant, number> = {
  "lockup-horizontal": 40,
  "lockup-vertical": 88,
  "lockup-vertical-reversed": 88,
  mark: 20,
  "mark-orange": 20,
  "mark-reversed": 20,
  "secondary-mark": 20,
}

export const DEFAULT_LABEL: Record<KhatLogoVariant, string> = {
  "lockup-horizontal": "بودكاست خط",
  "lockup-vertical": "بودكاست خط",
  "lockup-vertical-reversed": "بودكاست خط",
  mark: "خط",
  "mark-orange": "خط",
  "mark-reversed": "خط",
  "secondary-mark": "خط",
}

/**
 * Clamp to the minimum instead of throwing: a logo one size too small is a
 * defect, a 500 on the marketing site is an outage. Warns outside production so
 * it surfaces in dev and in the test run rather than shipping unnoticed.
 */
export function resolveHeight(variant: KhatLogoVariant, height: number): number {
  const min = MIN_HEIGHT[variant]
  if (height >= min) return height
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[KhatLogo] "${variant}" was asked for ${height}px; the identity file's ` +
        `minimum is ${min}px. Rendering at ${min}px.`,
    )
  }
  return min
}

export interface KhatLogoGeometry {
  art: BrandArt
  width: number
  height: number
  viewBox: string
}

/**
 * Box and viewBox for a variant at a given logo height.
 *
 * `height` always measures the LOGO. With `clearSpace` the element's box grows
 * by the mandated margin on all four sides — x = ⅙ of the logo's width — so a
 * caller never has to reproduce the rule in a wrapper. The x/3 gap between the
 * mark and the wordmark is already inside the artwork and is never re-derived.
 */
export function khatLogoGeometry(
  variant: KhatLogoVariant,
  height: number,
  clearSpace = false,
): KhatLogoGeometry {
  const art = ART[variant]
  const h = resolveHeight(variant, height)
  const scale = h / art.height
  const pad = clearSpace ? art.width / 6 : 0
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    art,
    width: round((art.width + pad * 2) * scale),
    height: round((art.height + pad * 2) * scale),
    viewBox: `${round(-pad)} ${round(-pad)} ${round(art.width + pad * 2)} ${round(
      art.height + pad * 2,
    )}`,
  }
}

/**
 * The logo as a standalone SVG string, for the two self-contained HTML
 * documents the admin prints to PDF. Those open in a blank window, so a
 * `/brand/*.svg` URL is not guaranteed to resolve before the print dialog runs
 * — the artwork has to travel inside the markup.
 */
export function khatLogoMarkup(
  variant: KhatLogoVariant,
  height: number,
  { clearSpace = false }: { clearSpace?: boolean } = {},
): string {
  const geo = khatLogoGeometry(variant, height, clearSpace)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geo.viewBox}" ` +
    `width="${geo.width}" height="${geo.height}" role="img" ` +
    `aria-label="${DEFAULT_LABEL[variant]}">${geo.art.body}</svg>`
  )
}
