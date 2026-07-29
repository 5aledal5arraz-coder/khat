/**
 * Resolving a `category` slug coming from a URL.
 *
 * The behaviour this exists to enforce: an unknown category and an empty
 * category are DIFFERENT ANSWERS and must never render the same. Filtering
 * alone cannot tell them apart — both produce zero episodes — so a typo, a
 * renamed category, or a stale bookmark used to render an empty archive that
 * looked like a truthful, successful result.
 *
 * Pure and synchronous on purpose: the caller already holds the category list
 * (it renders the filter chips from it), so resolving costs no extra query.
 */

import type { EpisodeCategory } from "@/types/database"

export type CategoryResolution =
  /** No `category` in the URL — show the whole archive. */
  | { state: "none" }
  /** A real category. Filter by `category.slug`. */
  | { state: "known"; category: EpisodeCategory }
  /** No category has this slug. Say so, then show the whole archive. */
  | { state: "unknown"; slug: string }

/**
 * Map a raw URL slug onto one of the three states above.
 *
 * `raw` is decoded here because the KHAT category slugs are Arabic
 * (`سالفة`, `مقاطع-خط`, `الموسم-الاول`) and therefore percent-encoded in every
 * real request. Comparing the encoded form against the stored slug would make
 * every valid category look unknown.
 */
export function resolveCategorySlug(
  categories: EpisodeCategory[],
  raw: string | undefined | null,
): CategoryResolution {
  if (!raw) return { state: "none" }

  let slug = raw.trim()
  if (!slug) return { state: "none" }

  try {
    slug = decodeURIComponent(slug).trim()
  } catch {
    // A malformed escape sequence ("%") is not decodable — it is also not a
    // slug we have, so it falls through to "unknown" with the raw text.
  }
  if (!slug) return { state: "none" }

  const category = categories.find((c) => c.slug === slug)
  return category ? { state: "known", category } : { state: "unknown", slug }
}
