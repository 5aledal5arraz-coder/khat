/**
 * Market Intelligence Freshness — operator-facing read model.
 *
 * Aggregates the state of the automatic market-intelligence
 * scheduler so the seasons UI can show whether signals are fresh,
 * stale, or empty, alongside last-update + counts. Pure read — no
 * side effects.
 *
 * Thresholds (per product spec):
 *   • fresh: last successful update at most 48h ago
 *   • aging: older than 48h but under 7 days — NOT «حديثة»
 *   • stale: last successful update 7 days or older
 *   • empty: zero signals in the database
 *
 * 48h–7d used to be reported "fresh" (the badge said «حديثة» and the detail
 * line claimed "updated within the last 48 hours") on data up to a week old.
 * The label must not lie about the data; "aging" is its own state, and the
 * hybrid generator treats anything but "fresh" as old signals and says so.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { isMarketSchedulerEnabled } from "@/lib/jobs/scheduler-bootstrap"

export type MarketFreshnessStatus = "fresh" | "aging" | "stale" | "empty"

export interface MarketFreshness {
  status: MarketFreshnessStatus
  signalCount: number
  clusterCount: number
  /** ISO timestamp of the most recent market signal (raw collection),
   *  null if none. */
  lastSignalAt: string | null
  /** ISO timestamp of the most recent successful `market.collect` job,
   *  null if no job has ever run. */
  lastSuccessfulCollectAt: string | null
  /** True when a refresh is already queued or running. UI uses this
   *  to disable the "تحديث الآن" button. */
  refreshInFlight: boolean
  /** Hours since the reference update (last collect, else last signal);
   *  null when there is nothing to measure. */
  ageHours: number | null
  /** Whether the daily automatic collection is switched on
   *  (KHAT_MARKET_SCHEDULER_ENABLED — off by default since 2026-09-26). */
  autoRefreshEnabled: boolean
}

const FRESH_THRESHOLD_MS = 48 * 60 * 60 * 1000 // 48h
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000 // 7d

/** Pure classification — exported so the thresholds are tested directly. */
export function classifyMarketFreshness(
  signalCount: number,
  referenceIso: string | null,
  now: number = Date.now(),
): { status: MarketFreshnessStatus; ageHours: number | null } {
  if (signalCount === 0) return { status: "empty", ageHours: null }
  const ageMs = referenceIso ? now - new Date(referenceIso).getTime() : Infinity
  const ageHours = Number.isFinite(ageMs) ? Math.max(0, Math.floor(ageMs / 3_600_000)) : null
  if (ageMs <= FRESH_THRESHOLD_MS) return { status: "fresh", ageHours }
  if (ageMs >= STALE_THRESHOLD_MS) return { status: "stale", ageHours }
  return { status: "aging", ageHours }
}

export async function getMarketFreshness(): Promise<MarketFreshness> {
  if (!db) {
    return {
      status: "empty",
      signalCount: 0,
      clusterCount: 0,
      lastSignalAt: null,
      lastSuccessfulCollectAt: null,
      refreshInFlight: false,
      ageHours: null,
      autoRefreshEnabled: isMarketSchedulerEnabled(),
    }
  }

  const [signalRow, clusterRow, lastJobRow, inflightRow] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS n,
        max(collected_at)::text AS latest
      FROM market_topic_signals
    `),
    db.execute(sql`
      SELECT count(*)::int AS n FROM market_topic_clusters
    `),
    db.execute(sql`
      SELECT max(completed_at)::text AS at
      FROM jobs
      WHERE type = 'market.collect' AND status = 'succeeded'
    `),
    db.execute(sql`
      SELECT count(*)::int AS n
      FROM jobs
      WHERE type IN ('market.collect', 'market.extract', 'market.cluster_signals')
        AND status IN ('pending', 'running')
    `),
  ])

  const signalCount = Number(
    (signalRow.rows[0] as { n?: number } | undefined)?.n ?? 0,
  )
  const clusterCount = Number(
    (clusterRow.rows[0] as { n?: number } | undefined)?.n ?? 0,
  )
  const lastSignalAt =
    (signalRow.rows[0] as { latest?: string | null } | undefined)?.latest ?? null
  const lastSuccessfulCollectAt =
    (lastJobRow.rows[0] as { at?: string | null } | undefined)?.at ?? null
  const refreshInFlight =
    Number((inflightRow.rows[0] as { n?: number } | undefined)?.n ?? 0) > 0

  const { status, ageHours } = classifyMarketFreshness(
    signalCount,
    lastSuccessfulCollectAt ?? lastSignalAt,
  )

  return {
    status,
    signalCount,
    clusterCount,
    lastSignalAt,
    lastSuccessfulCollectAt,
    refreshInFlight,
    ageHours,
    autoRefreshEnabled: isMarketSchedulerEnabled(),
  }
}
