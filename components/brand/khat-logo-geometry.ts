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

/** Public URL of each variant's standalone SVG, for the `<img>`-based path. */
export const ART_SRC: Record<KhatLogoVariant, string> = {
  "lockup-horizontal": "/brand/khat-lockup-horizontal.svg",
  "lockup-vertical": "/brand/khat-lockup-vertical.svg",
  "lockup-vertical-reversed": "/brand/khat-lockup-vertical-reversed.svg",
  mark: "/brand/khat-mark.svg",
  "mark-orange": "/brand/khat-mark-orange.svg",
  "mark-reversed": "/brand/khat-mark-reversed.svg",
  "secondary-mark": "/brand/khat-secondary-mark.svg",
}

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
 * Minimum legible heights, in CSS pixels.
 *
 * PROVENANCE — these are OURS, not the identity file's. The file states no
 * minimum size: it was searched for `minimum` / `min` / `حد أدنى` / `أصغر` and
 * has none. An earlier version of this comment, the console warning below, and
 * a commit message all attributed the numbers to it. They are an engineering
 * judgement, reasoned as follows and open to being overruled by the designer:
 *
 *  · lockup 40 — below this the `PODCAST KHAT` line, which is ~7% of the
 *    lockup's height, falls under 3px and stops resolving as letterforms.
 *  · vertical 88 — the same line, in a lockup that is 2.2x taller than wide.
 *  · mark 20 — below this the orange diamond (the dot of the خ) is under 2px
 *    and merges into the bubble it sits above.
 *
 * `scripts/build-brand-icons.ts` declares the one exemption: browser tab slots,
 * whose size the browser dictates and where clamping is not an option.
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

/**
 * Display height of the lockup in email, in CSS pixels.
 *
 * Email is the one surface that gets the artwork as a PNG rather than the
 * vector — Gmail strips inline `<svg>` and refuses `<img src="*.svg">`, and
 * Outlook's Word rendering engine handles neither. The raster is built at 2x
 * this by `scripts/build-brand-icons.ts`, and `lib/email/templates.ts` sizes
 * the `<img>` through `khatLogoGeometry()` like every other caller, so the
 * email path is held to the same `MIN_HEIGHT` guard as the app.
 */
export const EMAIL_LOCKUP_HEIGHT = 40

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
 * Seen clamps, so a repeated render warns once instead of on every frame.
 * Keyed by variant+height; the set of call sites is tiny and fixed.
 */
const warned = new Set<string>()

/**
 * Clamp to the minimum instead of throwing: a logo one size too small is a
 * defect, a 500 on the marketing site is an outage.
 *
 * IT WARNS IN PRODUCTION TOO. It used to be gated behind
 * `NODE_ENV !== "production"`, which meant a request for 12px was silently
 * rounded up to 40 on the live site with nothing anywhere saying so — the clamp
 * went quiet at exactly the point where a wrong size is actually shipping. This
 * codebase has a documented history of features failing in silence, and a guard
 * that only speaks in dev is one of them. Deduplicated so it is a signal rather
 * than log noise.
 */
export function resolveHeight(variant: KhatLogoVariant, height: number): number {
  const min = MIN_HEIGHT[variant]
  if (height >= min) return height
  const key = `${variant}@${height}`
  if (!warned.has(key)) {
    warned.add(key)
    console.warn(
      `[KhatLogo] "${variant}" was asked for ${height}px; our minimum legible ` +
        `height for it is ${min}px (see MIN_HEIGHT — this is our number, not the ` +
        `identity file's). Rendering at ${min}px.`,
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
