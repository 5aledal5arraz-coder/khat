import { and, desc, eq, min } from "drizzle-orm"

import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { youtubeAudienceSnapshots } from "@/lib/db/schema/youtube-oauth"
import { getAccessToken, recordFailure, recordSuccess } from "@/lib/youtube/oauth"

/**
 * The YouTube Analytics API — the channel's own numbers, the ones a public
 * API key can never return.
 *
 * ── EVERY RESULT CARRIES ITS WINDOW ───────────────────────────────────────
 * These figures are destined for /partner, where the governing rule is that a
 * number arrives with its source or it does not arrive. «٤٠٪ من السعودية» is
 * not one fact: it is a different fact over 28 days than over the channel's
 * life, and a company that asks "since when?" deserves an answer printed
 * beside it. So no function here returns bare numbers — every one returns the
 * window it measured, and the window is stored with the snapshot.
 */

const API = "https://youtubeanalytics.googleapis.com/v2/reports"

export interface Measured<T> {
  rows: T[]
  periodStart: string
  periodEnd: string
  measuredAt: Date
}

export interface CountryShare {
  /** ISO-3166 alpha-2, as YouTube returns it. */
  code: string
  /** Arabic name where known, otherwise the raw code. */
  label: string
  views: number
  /** Share of the views IN THIS REPORT, to one decimal. */
  percent: number
}

export interface AgeShare {
  /** e.g. "25-34" — YouTube's `age25-34` with the prefix stripped. */
  band: string
  /** Sum of the male and female viewer percentages for the band. */
  percent: number
}

/** YYYY-MM-DD, which is the only date shape the API accepts. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** A window ending yesterday — today's data is always partial. */
export function windowOfDays(
  days: number,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const end = new Date(now)
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { startDate: isoDay(start), endDate: isoDay(end) }
}

/**
 * The whole life of the podcast: the first episode's release date → yesterday.
 *
 * ── WHY THIS IS ALLOWED WHEN "LIFETIME" WAS NOT ───────────────────────────
 * I first refused to offer a lifetime preset, on the grounds that it needs a
 * start date nobody can state, and every figure on /partner has to print the
 * window that produced it. Khalid's answer removed the objection rather than
 * overruling it: «قيس من نزلت اول حلقه بودكاست خط الى اليوم». The date of the
 * first episode is not a guess — it is `min(episodes.release_date)`, a row in
 * our own database (2023-08-01), and it is the most defensible window there
 * is: «منذ أول حلقة» is a sentence a sponsor can check against the archive.
 *
 * Returns null when there is no dated episode at all, so the caller can say
 * so instead of inventing a start.
 */
export async function windowSinceFirstEpisode(): Promise<{
  startDate: string
  endDate: string
} | null> {
  if (!db) return null

  const [row] = await db
    .select({ first: min(episodes.release_date) })
    .from(episodes)

  if (!row?.first) return null

  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  return { startDate: isoDay(new Date(row.first)), endDate: isoDay(end) }
}

interface ApiReport {
  columnHeaders: { name: string }[]
  rows?: (string | number)[][]
}

/**
 * One report call.
 *
 * Errors are RECORDED on the credential row before being rethrown. A grant
 * the owner revoked in their Google account keeps looking healthy from this
 * side — the row is still there, the token still decrypts — and without this
 * the admin screen would show «مربوط» over a connection that has not worked
 * for a month. That is the failure mode this codebase keeps producing, so it
 * is written down at the point where the truth is known.
 */
async function report(params: Record<string, string>): Promise<ApiReport> {
  // A TOKEN failure is recorded too. A revoked or expired refresh token
  // («invalid_grant») throws here, before any report is requested — and it is
  // the most likely way this connection dies. It used to skip the record
  // below entirely, so the screen kept saying «مربوط» over a dead grant.
  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    const message = `YouTube Analytics token: ${e instanceof Error ? e.message : String(e)}`
    await recordFailure(message).catch(() => {})
    throw e
  }
  const url = `${API}?${new URLSearchParams({ ids: "channel==MINE", ...params })}`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.text()
    const message = `YouTube Analytics ${res.status}: ${body.slice(0, 300)}`
    await recordFailure(message).catch(() => {})
    throw new Error(message)
  }

  await recordSuccess().catch(() => {})
  return (await res.json()) as ApiReport
}

/**
 * Arabic names for the countries that actually show up for this channel, plus
 * the ones a sponsor is likely to ask about. Anything else falls back to its
 * ISO code — a code is honest; an invented Arabic name is not.
 */
const COUNTRY_AR: Record<string, string> = {
  KW: "الكويت", SA: "السعودية", AE: "الإمارات", QA: "قطر", BH: "البحرين", OM: "عُمان",
  IQ: "العراق", JO: "الأردن", LB: "لبنان", SY: "سوريا", PS: "فلسطين", YE: "اليمن",
  EG: "مصر", SD: "السودان", LY: "ليبيا", TN: "تونس", DZ: "الجزائر", MA: "المغرب",
  US: "الولايات المتحدة", GB: "بريطانيا", CA: "كندا", DE: "ألمانيا", FR: "فرنسا",
  TR: "تركيا", IR: "إيران", IN: "الهند", PK: "باكستان", AU: "أستراليا", SE: "السويد",
}

export function countryLabel(code: string): string {
  return COUNTRY_AR[code.toUpperCase()] ?? code.toUpperCase()
}

export async function fetchCountries(
  startDate: string,
  endDate: string
): Promise<Measured<CountryShare>> {
  const data = await report({
    startDate,
    endDate,
    dimensions: "country",
    metrics: "views",
    sort: "-views",
    maxResults: "50",
  })

  const raw = (data.rows ?? []).map((r) => ({ code: String(r[0]), views: Number(r[1]) || 0 }))
  // The denominator is the sum of THIS report, not the channel's lifetime
  // views. Mixing the two would produce percentages that do not add to 100
  // and cannot be checked by anyone reading the page.
  const total = raw.reduce((s, r) => s + r.views, 0)

  return {
    rows: raw.map((r) => ({
      code: r.code,
      label: countryLabel(r.code),
      views: r.views,
      percent: total > 0 ? Math.round((r.views / total) * 1000) / 10 : 0,
    })),
    periodStart: startDate,
    periodEnd: endDate,
    measuredAt: new Date(),
  }
}

export async function fetchAgeBands(
  startDate: string,
  endDate: string
): Promise<Measured<AgeShare>> {
  const data = await report({
    startDate,
    endDate,
    dimensions: "ageGroup,gender",
    metrics: "viewerPercentage",
    sort: "-viewerPercentage",
  })

  // `viewerPercentage` is split by gender and sums to 100 across the whole
  // grid, so the band's share is the sum of its rows. Summed rather than
  // averaged: averaging halves every figure and quietly makes the audience
  // look half its size in every band.
  const byBand = new Map<string, number>()
  for (const row of data.rows ?? []) {
    // YouTube's open-ended top band is `age65-`. Stripping only the prefix
    // leaves «65-», which in an RTL column renders as «-65» and reads as
    // "minus 65". The band means 65 AND OVER, so it is written that way.
    const band = String(row[0]).replace(/^age/, "").replace(/-$/, "+")
    byBand.set(band, (byBand.get(band) ?? 0) + (Number(row[2]) || 0))
  }

  return {
    rows: [...byBand.entries()]
      .map(([band, percent]) => ({ band, percent: Math.round(percent * 10) / 10 }))
      .sort((a, b) => b.percent - a.percent),
    periodStart: startDate,
    periodEnd: endDate,
    measuredAt: new Date(),
  }
}

// ── Measure (shared by the admin button and the weekly worker tick) ──────

/**
 * Measure both reports over one window and store them. The ONE measure path:
 * `refreshAudienceAction` (the admin button) and the `youtube.audience_refresh`
 * job both call this, so a scheduled snapshot is the same shape, window rule
 * and error recording as a manual one.
 *
 * Sequential, not Promise.all: the two calls share one access token and one
 * rate limit, and firing them together only doubles the chance of a 429.
 */
export async function measureAudience(window: { startDate: string; endDate: string }): Promise<{
  countries: Measured<CountryShare>
  ages: Measured<AgeShare>
}> {
  const { startDate, endDate } = window
  const countries = await fetchCountries(startDate, endDate)
  await saveSnapshot("countries", countries)

  const ages = await fetchAgeBands(startDate, endDate)
  await saveSnapshot("age_gender", ages)

  return { countries, ages }
}

/** A snapshot older than this gets a staleness hint on the admin page. */
export const AUDIENCE_STALE_DAYS = 14

export function isSnapshotStale(measuredAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!measuredAt) return false
  return now.getTime() - new Date(measuredAt).getTime() > AUDIENCE_STALE_DAYS * 24 * 60 * 60 * 1000
}

// ── Snapshots ──────────────────────────────────────────────────────────────

export type ReportKind = "countries" | "age_gender"

export async function saveSnapshot(
  report: ReportKind,
  measured: Measured<CountryShare | AgeShare>
): Promise<void> {
  await db!.insert(youtubeAudienceSnapshots).values({
    report,
    period_start: measured.periodStart,
    period_end: measured.periodEnd,
    data: measured.rows,
  })
}

/**
 * The newest measurement for a report, or null.
 *
 * `/partner` reads THIS, never the live API: a sponsorship page must not be
 * one Google hiccup away from a blank section, and a stored row can say when
 * it was true. Refreshed by the admin button and by a weekly worker tick
 * (`youtube.audience_refresh`, last 28 days).
 */
export async function latestSnapshot<T>(
  report: ReportKind,
  opts: { periodStart?: string } = {},
): Promise<Measured<T> | null> {
  if (!db) return null
  const [row] = await db
    .select()
    .from(youtubeAudienceSnapshots)
    .where(
      opts.periodStart
        ? and(
            eq(youtubeAudienceSnapshots.report, report),
            eq(youtubeAudienceSnapshots.period_start, opts.periodStart),
          )
        : eq(youtubeAudienceSnapshots.report, report),
    )
    .orderBy(desc(youtubeAudienceSnapshots.measured_at))
    .limit(1)

  if (!row) return null
  return {
    rows: (row.data ?? []) as T[],
    periodStart: row.period_start,
    periodEnd: row.period_end,
    measuredAt: row.measured_at ?? new Date(),
  }
}

/**
 * The snapshot a PUBLIC reader shows: the lifetime window («منذ أول حلقة»,
 * period_start = the first episode's release date) when one exists, else the
 * newest of any window.
 *
 * "Newest row" alone is not a choice of window: once the weekly worker tick
 * started storing last-28-days rows, it would have silently replaced the
 * lifetime figures /partner quotes to sponsors. The window is now explicit.
 * `deps` is a test seam.
 */
export async function latestPreferredSnapshot<T>(
  report: ReportKind,
  deps: {
    lifetimeStart: () => Promise<string | null>
    latest: (report: ReportKind, opts?: { periodStart?: string }) => Promise<Measured<T> | null>
  } = {
    lifetimeStart: async () => (await windowSinceFirstEpisode())?.startDate ?? null,
    latest: (r, o) => latestSnapshot<T>(r, o),
  },
): Promise<Measured<T> | null> {
  const start = await deps.lifetimeStart().catch(() => null)
  if (start) {
    const lifetime = await deps.latest(report, { periodStart: start })
    if (lifetime) return lifetime
  }
  return deps.latest(report)
}

/**
 * Name a stored window the way the admin's measure buttons name it, so the
 * operator can see WHICH window a snapshot is — «منذ أول حلقة», «آخر ٢٨ يومًا»…
 * Pure. `lifetimeStart` = the first episode's release day, or null.
 */
const DAY_WINDOW_LABEL: Record<number, string> = {
  28: "آخر ٢٨ يومًا",
  90: "آخر ٩٠ يومًا",
  365: "آخر سنة",
  1095: "آخر ٣ سنوات",
}
export function snapshotWindowLabel(
  periodStart: string,
  periodEnd: string,
  lifetimeStart: string | null,
): string {
  if (lifetimeStart && periodStart === lifetimeStart) return "منذ أول حلقة"
  const days = Math.round((Date.parse(periodEnd) - Date.parse(periodStart)) / 86_400_000) + 1
  return DAY_WINDOW_LABEL[days] ?? "فترة مخصّصة"
}
