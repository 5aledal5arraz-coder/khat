/**
 * The number a NEW planning season gets.
 *
 * It used to be `max(khat_map_seasons.season_number) + 1` — the planning
 * table alone. The show's first season aired before the planning system
 * existed, so it has no row there, and on production (no earlier planning
 * seasons) Khaled's SECOND season was created as «الموسم 1» (2026-09-28
 * end-to-end test). The aired archive counts too: its highest
 * `episodes.season`, or 1 when episodes aired but none carries a season
 * number (today's archive — 41 published episodes, `season` null on all).
 *
 * Pure, so the rule is testable without a database.
 */
export function nextSeasonNumberFrom(input: {
  /** `season_number` of every existing planning season (nulls ignored). */
  planned: Array<number | null>
  /** Highest `episodes.season` among published episodes, or null. */
  airedMaxSeason: number | null
  /** How many published episodes exist at all. */
  airedEpisodeCount: number
}): number {
  const plannedMax = input.planned.reduce<number>((m, n) => Math.max(m, n ?? 0), 0)
  const airedMax =
    input.airedMaxSeason != null && input.airedMaxSeason > 0
      ? input.airedMaxSeason
      : input.airedEpisodeCount > 0
        ? 1
        : 0
  return Math.max(plannedMax, airedMax) + 1
}
