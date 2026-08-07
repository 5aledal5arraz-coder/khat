import type { Episode } from "@/types/database"

/**
 * The audience numbers shown to a prospective sponsor.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `/partner` showed a company four figures. Two of them were literals typed
 * into the page — «15+ دولة» and «18–35 الفئة العمرية» — derived from nothing
 * at all. A third, «77+ حلقة منشورة», was `fetchAllEpisodes().length`: EVERY
 * video on the YouTube channel, shorts included. The site's own archive lists
 * 41 items, of which 19 are خط episodes. And if YouTube were ever unreachable
 * the page fell back to hardcoded "50+" and "100K+".
 *
 * A marketing manager reads «٧٧ حلقة», clicks «الحلقات», and counts 19. That
 * costs the deal before the form is ever reached, and it is the one page on
 * the site where a reader is actively looking for reasons to distrust us.
 *
 * ── THE RULE HERE ──────────────────────────────────────────────────────────
 * Every number is derived, or it is `null` and the caller renders nothing.
 * There are no fallbacks. A missing number is not an emergency — an invented
 * one is.
 *
 * ── AND THE TRUTH IS THE BETTER PITCH ──────────────────────────────────────
 * Measured 2026-08-05 against the live channel: the 19 خط episodes carry
 * 2,091,402 views between them — an average of 110,074 per episode, median
 * 115,311. «١٩ حلقة بمتوسط ١١٠ ألف مشاهدة» is a far stronger claim than
 * «٧٧ حلقة», because it survives being checked, and because average reach per
 * episode is the number a sponsor is actually buying.
 */

export interface AudienceMetric {
  /** Rendered value, already formatted. */
  value: string
  label: string
  /** Where the number comes from, in one line — shown under the tile. */
  source: string
}

export interface AudienceFacts {
  episodeCount: number | null
  totalViews: number | null
  averageViews: number | null
  subscribers: number | null
}

/**
 * Compact Arabic-facing formatting. Latin digits, matching the house style
 * every `lib/shared/formatters.ts` output already uses.
 */
export function compact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`
  }
  return String(n)
}

/**
 * The facts about **خط's own episodes**, from the two sources that each hold
 * half of them.
 *
 * The count comes from the DATABASE, so the number here and the number a
 * visitor can reach by opening «الحلقات» and counting are the same number.
 * That agreement is the entire point of this module.
 *
 * `subscribers` is passed in rather than fetched, so this stays pure and the
 * page pays for one YouTube round trip.
 */
export function audienceFacts(
  /** خط's own episodes, FROM THE DATABASE — the only source that knows lanes. */
  ownEpisodes: Episode[],
  /** Every video on the channel, from YouTube — the only source with views. */
  youtubeVideos: Episode[],
  subscribers: number | null,
): AudienceFacts {
  /* ── IT TAKES BOTH LISTS, AND THE FIRST VERSION OF THIS TOOK ONE ─────────
     `filterLane(youtubeEpisodes, "khat")` looked right and returned all 77
     videos: `fetchAllEpisodes()` builds its rows from the YouTube API, and
     those carry NO category, so the lane filter had nothing to filter on and
     passed everything through. The page then reported «77 حلقة» and an average
     of 31K — the exact fabrication this module exists to remove, rebuilt by
     accident, and only visible because the rendered number was checked against
     the measured one.

     So the LANE comes from the database (which knows what خط's episodes are)
     and the VIEWS come from YouTube (which knows how often they were watched),
     joined on the video id. */
  const viewsById = new Map<string, number>()
  for (const v of youtubeVideos) {
    const id = youtubeId(v.youtube_url)
    if (id && typeof v.view_count === "number") viewsById.set(id, v.view_count)
  }

  const counted = ownEpisodes
    .map((e) => viewsById.get(youtubeId(e.youtube_url) ?? ""))
    .filter((n): n is number => typeof n === "number" && n > 0)

  const totalViews = counted.reduce((sum, n) => sum + n, 0)

  return {
    episodeCount: ownEpisodes.length > 0 ? ownEpisodes.length : null,
    totalViews: totalViews > 0 ? totalViews : null,
    // Averaged over the episodes YouTube actually reported, not over all of
    // them — dividing by episodes with no view data would quietly deflate it.
    averageViews: counted.length > 0 ? Math.round(totalViews / counted.length) : null,
    subscribers: subscribers && subscribers > 0 ? subscribers : null,
  }
}

/** The `v=` id out of any YouTube URL shape we store. */
function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  return url.match(/[?&]v=([\w-]{6,})/)?.[1] ?? url.match(/youtu\.be\/([\w-]{6,})/)?.[1] ?? null
}

/**
 * The tiles, in the order a sponsor weighs them.
 *
 * AVERAGE REACH LEADS, not the episode count. A sponsor is buying the audience
 * of the episode their name sits in; "how many episodes exist" is context, not
 * the offer. The old page led with the count — and led with the wrong one.
 *
 * Every tile names its own source. A number a company can trace is worth more
 * than a bigger number it cannot.
 */
export function audienceMetrics(f: AudienceFacts): AudienceMetric[] {
  const out: AudienceMetric[] = []
  if (f.averageViews !== null) {
    out.push({
      value: compact(f.averageViews),
      label: "متوسط مشاهدات الحلقة",
      source: "من يوتيوب، محسوبة على حلقات خط",
    })
  }
  if (f.totalViews !== null) {
    out.push({ value: compact(f.totalViews), label: "إجمالي المشاهدات", source: "من يوتيوب" })
  }
  if (f.subscribers !== null) {
    out.push({ value: compact(f.subscribers), label: "مشترك في القناة", source: "من يوتيوب" })
  }
  if (f.episodeCount !== null) {
    out.push({ value: String(f.episodeCount), label: "حلقة منشورة", source: "أرشيف خط" })
  }
  return out
}

// ── Demographics ────────────────────────────────────────────────────────────

/**
 * WHO LISTENS — the two figures this page invented and then had to delete.
 *
 * «١٥+ دولة» and «١٨–٣٥» were literals typed into the page, derived from
 * nothing. They were removed on 2026-08-05 rather than guessed at, because
 * YouTube Analytics needs an OAuth grant the app did not have.
 *
 * It has one now (2026-08-07, /admin/youtube-analytics), and the measurement
 * says something better than the fabrication did:
 *
 *   السعودية 47.3 · الكويت 23.8 — together 71.1% of the audience
 *   25–34 42.1 · 35–44 30.4 — together 72.5%
 *
 * The invented «١٨–٣٥» was not merely unsourced, it was WRONG in the direction
 * that costs money: 18–24 is 10.7%. This audience is older, and older is what
 * a sponsor is paying to reach.
 *
 * ── THE WINDOW TRAVELS WITH THE NUMBER ────────────────────────────────────
 * A share is not a fact on its own — «47% من السعودية» over 28 days is a
 * different claim from the same figure over three years. Every row here
 * carries the window that produced it and the page prints it, so a company
 * that asks "since when?" gets an answer instead of a shrug.
 */
export interface DemographicRow {
  label: string
  percent: number
}

export interface Demographics {
  countries: DemographicRow[]
  ages: DemographicRow[]
  /** Inclusive, as measured. Both reports share one window in practice. */
  periodStart: string
  periodEnd: string
}

/**
 * Shape the stored snapshots for the page, or return null.
 *
 * Null when a report has never been measured — the page then renders nothing,
 * exactly as it does for every other missing figure. No placeholder, no "soon".
 *
 * `topN` because a sponsor reads the shape of an audience, not a table of
 * fifty countries with a long tail below one percent. The dropped rows are not
 * hidden: the page states how many countries the measurement covered.
 */
export function buildDemographics(
  countries: { rows: DemographicRow[]; periodStart: string; periodEnd: string } | null,
  ages: { rows: DemographicRow[]; periodStart: string; periodEnd: string } | null,
  topN = 6
): Demographics | null {
  if (!countries?.rows.length && !ages?.rows.length) return null

  const source = countries ?? ages!
  return {
    countries: (countries?.rows ?? []).filter((r) => r.percent > 0).slice(0, topN),
    ages: (ages?.rows ?? []).filter((r) => r.percent > 0).slice(0, topN),
    periodStart: source.periodStart,
    periodEnd: source.periodEnd,
  }
}
