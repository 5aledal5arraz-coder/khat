/**
 * «قاعة الحلقات» — the pure part: constants, the filter type, and its
 * string encoding. No DB, no `fs`, no imports at all.
 *
 * IT LIVES ALONE FOR A REASON. The admin tab is a client component and needs
 * `MANUAL_SLOTS`; when that constant sat in `lib/queries/homepage-episodes.ts`
 * the import dragged the whole server chain behind it —
 * homepage-episodes → queries/episodes → cache/episode-cache → config-store →
 * `fs` — and the production build died on module-not-found while `tsc`, lint
 * and all 2900 tests stayed green. Type-checking does not know about the
 * client/server boundary; only `next build` does.
 *
 * Keep this file dependency-free.
 */

/** `homepage_settings` row that stores the auto-mode filter. */
export const HOMEPAGE_FILTER_KEY = "featured_filter"

/**
 * How many episodes the homepage grid shows, in EVERY mode and filter.
 *
 * Khaled's call, 2026-08-08. Removing the old hardcoded `slice(1, 7)` so a topic
 * filter could show «كل حلقات الغزو» also removed it from the default view, and
 * the homepage silently went from 7 episodes to 19 — tripling the page he had
 * just asked to make *less* episode-heavy. One cap for all modes; «كل الحلقات»
 * (or the topic's own page) carries the rest.
 *
 * SIX, not five or eight, because of the interleave: three guests at every
 * third cell gives 6 + 3 = 9 cards, which is exactly three full rows of the
 * 3-column grid and reads as «حلقتين ثم ضيف» on a phone.
 */
export const HOMEPAGE_EPISODE_CAP = 6

/**
 * How many episodes manual mode can pin.
 *
 * **DERIVED, never a second number.** It was literally `12` while the cap below
 * was `6`, and both were added the same afternoon: the tab offered twelve slots,
 * the save action accepted twelve, the UI said «بلغت الحد الأقصى (12 حلقة)» —
 * and the manual branch runs through the same `finish()` that slices to the cap,
 * so positions 7–12 saved and never appeared. The operator would have pinned an
 * episode and watched the homepage ignore it, with the admin insisting it was
 * saved.
 *
 * Khaled chose one cap for every mode. Deriving it here is what makes that true
 * instead of merely intended.
 */
export const MANUAL_SLOTS = HOMEPAGE_EPISODE_CAP



/**
 * Where guest cards sit in the merged grid: cells 3, 5, 7 (1-indexed).
 *
 * IT WAS "every 3rd cell", AND THAT PUT THEM ALL IN ONE COLUMN. On `lg` the
 * grid is 3 columns, so cells 3, 6 and 9 are the third column every time — the
 * page rendered as two columns of episodes and one column of guests. That is
 * the two-separate-strips layout the merge existed to get rid of, rotated 90°.
 *
 * The fix is arithmetic, not taste: any step that is a multiple of the column
 * count lands on the same column forever. A step of 2 starting at 3 gives
 * 3 → 5 → 7, i.e. columns 3 → 2 → 1 — a clean diagonal across the three rows,
 * unmistakably mixed. On a phone (one column) it reads «حلقتين ثم ضيف» and then
 * «حلقة ثم ضيف», which are the two rhythms Khaled asked for.
 */
export const GUEST_FIRST_SLOT = 3
export const GUEST_STEP = 2

export type HomepageEpisodeFilter =
  | { kind: "newest" }
  | { kind: "most_viewed" }
  | { kind: "program"; slug: string }
  | { kind: "topic"; slug: string }

/** Unknown or malformed values fall back to «الأحدث» rather than throwing. */
export function parseHomepageFilter(raw: string | null): HomepageEpisodeFilter {
  if (!raw) return { kind: "newest" }
  if (raw === "most_viewed") return { kind: "most_viewed" }
  if (raw.startsWith("program:")) {
    const slug = raw.slice(8)
    return slug ? { kind: "program", slug } : { kind: "newest" }
  }
  if (raw.startsWith("topic:")) {
    const slug = raw.slice(6)
    return slug ? { kind: "topic", slug } : { kind: "newest" }
  }
  return { kind: "newest" }
}

export function serializeHomepageFilter(f: HomepageEpisodeFilter): string {
  switch (f.kind) {
    case "most_viewed": return "most_viewed"
    case "program": return `program:${f.slug}`
    case "topic": return `topic:${f.slug}`
    default: return "newest"
  }
}

/**
 * How many faces the homepage guest strip shows.
 *
 * These live HERE, not beside the setting that stores them: the admin's stepper
 * is a client component, and `lib/queries/homepage-settings.ts` imports
 * `lib/db`. Importing the constants from there pulled the database driver into
 * the browser bundle — a build failure `tsc` cannot see, because the types are
 * perfectly valid either way. This module is already the client-safe home for
 * `MANUAL_SLOTS` and `HOMEPAGE_EPISODE_CAP`.
 */
export const GUEST_STRIP_LIMIT_DEFAULT = 12
export const GUEST_STRIP_LIMIT_MIN = 1
export const GUEST_STRIP_LIMIT_MAX = 40

/** Clamp a stored or typed count into range. Pure — safe on both sides. */
export function clampGuestStripLimit(n: number): number {
  if (!Number.isFinite(n)) return GUEST_STRIP_LIMIT_DEFAULT
  return Math.min(GUEST_STRIP_LIMIT_MAX, Math.max(GUEST_STRIP_LIMIT_MIN, Math.floor(n)))
}
