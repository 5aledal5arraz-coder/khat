/**
 * Application-side YouTube quota counters (Decision 13 / B4).
 *
 * Podcast Universe may spend at most PU_DAILY_READ_UNITS_CAP read units and
 * PU_DAILY_SEARCH_CALLS_CAP search.list calls per YouTube quota day; the rest
 * of the project's Google quota stays with existing Khat features. We do NOT
 * wait for Google to reject us: every call reserves its units here first.
 *
 * The reservation is ONE conditional UPSERT on `podcast_quota_usage`
 * (quota_day, kind): the row lock serialises concurrent crawls, and the
 * `WHERE units + n <= cap` makes "would exceed" return no row instead of
 * incrementing. No advisory lock, no read-then-write window.
 *
 * Units are reserved BEFORE the call and not refunded on failure — Google
 * charges failed requests too, and over-counting is the safe direction.
 */
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { PU_DAILY_READ_UNITS_CAP, PU_DAILY_SEARCH_CALLS_CAP } from "./constants"

export type QuotaKind = "read" | "search"

/** Thrown when the APPLICATION cap (not Google) would be exceeded. */
export class PodcastQuotaExhaustedError extends Error {
  readonly kind: QuotaKind | "google"
  /** When the next quota day starts — a stopped job reschedules itself to it. */
  readonly resetAt: Date
  constructor(kind: QuotaKind | "google", resetAt: Date, detail?: string) {
    super(
      kind === "google"
        ? `YouTube quota exhausted at Google${detail ? ` (${detail})` : ""} — paused until ${resetAt.toISOString()}`
        : `Podcast Universe daily YouTube ${kind} cap reached — paused until ${resetAt.toISOString()}`,
    )
    this.name = "PodcastQuotaExhaustedError"
    this.kind = kind
    this.resetAt = resetAt
  }
}

const QUOTA_TZ = "America/Los_Angeles"

/** The YouTube quota day (Pacific calendar date, `YYYY-MM-DD`) for `now`. */
export function quotaDay(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/**
 * The instant the NEXT quota day starts (next Pacific midnight), plus a small
 * margin so a resumed job never lands a few seconds early. Pure.
 */
export function nextQuotaReset(now: Date = new Date(), marginMs = 5 * 60_000): Date {
  const today = quotaDay(now)
  // Step forward in 15-minute increments until the Pacific date changes —
  // DST-safe without a tz library, at most ~100 iterations.
  let t = now.getTime()
  const step = 15 * 60_000
  for (let i = 0; i < 200; i++) {
    t += step
    if (quotaDay(new Date(t)) !== today) break
  }
  // Walk back to the exact minute the date flipped.
  let lo = t - step
  let hi = t
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (quotaDay(new Date(mid)) === today) lo = mid
    else hi = mid
  }
  return new Date(hi + marginMs)
}

export function capFor(kind: QuotaKind): number {
  return kind === "read" ? PU_DAILY_READ_UNITS_CAP : PU_DAILY_SEARCH_CALLS_CAP
}

/**
 * Reserve `units` of `kind` for today, or throw PodcastQuotaExhaustedError.
 * Returns the day's total AFTER this reservation.
 */
export async function reserveQuota(kind: QuotaKind, units: number, now: Date = new Date()): Promise<number> {
  if (!db) throw new Error("Database not configured")
  const day = quotaDay(now)
  const cap = capFor(kind)
  if (units > cap) throw new PodcastQuotaExhaustedError(kind, nextQuotaReset(now))
  const res = await db.execute(sql`
    INSERT INTO podcast_quota_usage (quota_day, kind, units, updated_at)
    VALUES (${day}, ${kind}, ${units}, now())
    ON CONFLICT (quota_day, kind) DO UPDATE
      SET units = podcast_quota_usage.units + EXCLUDED.units, updated_at = now()
      WHERE podcast_quota_usage.units + EXCLUDED.units <= ${cap}
    RETURNING units
  `)
  const row = res.rows[0] as { units: number } | undefined
  if (!row) throw new PodcastQuotaExhaustedError(kind, nextQuotaReset(now))
  return Number(row.units)
}

/** Today's usage, for the admin screen. */
export async function quotaUsageToday(now: Date = new Date()): Promise<{ read: number; search: number }> {
  if (!db) return { read: 0, search: 0 }
  const res = await db.execute(sql`
    SELECT kind, units FROM podcast_quota_usage WHERE quota_day = ${quotaDay(now)}
  `)
  const out = { read: 0, search: 0 }
  for (const r of res.rows as Array<{ kind: string; units: number }>) {
    if (r.kind === "read") out.read = Number(r.units)
    if (r.kind === "search") out.search = Number(r.units)
  }
  return out
}
