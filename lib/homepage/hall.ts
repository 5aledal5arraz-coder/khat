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
 * How many episodes manual mode can pin. Was hardcoded to 3 when the tab was a
 * three-card showcase; manual mode now drives the whole grid.
 */
export const MANUAL_SLOTS = 12

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
 * Guest cards sit at every Nth cell of the merged grid. 3 → ep, ep, guest.
 */
export const GUEST_EVERY = 3

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
