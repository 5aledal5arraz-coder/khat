import { cache } from "react"
import { getSiteSettings } from "@/lib/site-settings"
import type { SiteSettingsConfig } from "@/types/site-settings"

/**
 * The site-wide Open Graph card, resolved from admin Settings.
 *
 * A page that declares its own `openGraph` block REPLACES the root layout's —
 * it does not merge — so any page with an `openGraph` key and no `images`
 * silently ships a `summary_large_image` card with no image. `/partner` and the
 * guest pages both did. They now call this, so there is one definition of the
 * default card instead of three hardcoded copies.
 */

/** Shipped when Settings has no explicit value. `public/og-image.png` — see scripts/generate-og-image.ts. */
export const FALLBACK_OG_IMAGE = "/og-image.png"

/**
 * Intrinsic sizes of the brand assets we ship. Declaring width/height lets
 * scrapers lay the card out before fetching the bytes. An admin-supplied URL is
 * an unknown asset, so it is emitted without dimensions.
 */
const KNOWN_SIZES: Record<string, { width: number; height: number }> = {
  "/og-image.png": { width: 1200, height: 630 },
  // `/logo-wide.jpg` used to be listed here as a brand asset. It is not one: it
  // is a retired SLOGAN graphic in an off-palette purple, nothing points at it
  // any more, and leaving it in a table headed "brand assets we ship" is how a
  // dead asset gets picked up again. An admin URL that is not in this table is
  // emitted without dimensions, which is the documented fallback.
}

export interface OgImageEntry {
  url: string
  alt: string
  width?: number
  height?: number
}

/**
 * `getSiteSettings()` is an uncached SELECT. Every page render resolves metadata
 * for BOTH the root layout and the page, so without this the card costs an extra
 * round-trip per request. React `cache()` dedupes it within a single request.
 */
const readSettings = cache(
  async (): Promise<SiteSettingsConfig | null> => getSiteSettings().catch(() => null),
)

/**
 * `preloaded` lets a caller that ALREADY read Settings hand them over — the root
 * layout does — so resolving the card costs no extra query there.
 */
export async function resolveDefaultOgImage(
  preloaded?: SiteSettingsConfig | null,
): Promise<OgImageEntry> {
  const settings = preloaded !== undefined ? preloaded : await readSettings()
  const name = settings?.metadata.name?.trim() || "خط"
  const url = settings?.seo.defaultOgImage?.trim() || FALLBACK_OG_IMAGE

  return { url, alt: `بودكاست ${name}`, ...KNOWN_SIZES[url] }
}
