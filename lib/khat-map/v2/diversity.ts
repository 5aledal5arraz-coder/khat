/**
 * Category diversity — a CONSTRAINT applied after Regional Audience Fit ranking,
 * never the driver of generation.
 *
 * Philosophy (per the editorial brief): pick the strongest episode opportunities
 * first (highest RAF); use categories only to (a) stop one category from
 * dominating a season, and (b) gently prefer breadth when two candidates are
 * close. A genuinely stronger topic always beats a weaker one from a fresher
 * category — diversity caps domination, it does not manufacture it.
 *
 * Pure functions. No I/O.
 */

import { categoryById } from "./categories"

/** No category may exceed this share of a season. */
export const MAX_CATEGORY_SHARE = 0.22
const MIN_CATEGORY_CAP = 2

/** Per-season hard cap on how many episodes one category may claim. */
export function seasonCategoryCap(seasonTarget: number): number {
  return Math.max(MIN_CATEGORY_CAP, Math.ceil(seasonTarget * MAX_CATEGORY_SHARE))
}

/** Categories already at/over their season cap — fed to the prompt as "go fresh". */
export function overRepresentedCategories(
  acceptedByCategory: Record<string, number>,
  cap: number,
): string[] {
  return Object.entries(acceptedByCategory)
    .filter(([, n]) => n >= cap)
    .map(([id]) => id)
}

/**
 * MMR-style penalty subtracted from a candidate's RAF when it shares a category
 * with topics already picked THIS batch. Small for the 2nd, larger for the 3rd+
 * — enough to break ties toward breadth, not enough to bury a standout topic.
 */
export function categoryDiversityPenalty(
  category: string | null,
  pickedCategories: Array<string | null>,
): number {
  if (!category) return 0
  const sameInBatch = pickedCategories.filter((c) => c === category).length
  if (sameInBatch === 0) return 0
  if (sameInBatch === 1) return 0.8
  return 2.5
}

/** Human-readable Arabic label for a category id (for prompt hints / logs). */
export function categoryLabel(id: string | null): string {
  if (!id) return "—"
  return categoryById(id)?.label_ar ?? id
}
