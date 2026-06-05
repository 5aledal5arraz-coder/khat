/**
 * Market Intelligence Freshness — operator-facing read model.
 *
 * Aggregates the state of the automatic market-intelligence
 * scheduler so the seasons UI can show whether signals are fresh,
 * stale, or empty, alongside last-update + counts. Pure read — no
 * side effects.
 *
 * Thresholds (per product spec):
 *   • fresh: last successful update less than 48h ago
 *   • stale: last successful update older than 7 days
 *   • empty: zero signals in the database
 *
 * Anything between 48h and 7d falls into "fresh" — we don't surface
 * an "aging" bucket to keep the operator UX binary actionable.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export type MarketFreshnessStatus = "fresh" | "stale" | "empty"

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
}

const FRESH_THRESHOLD_MS = 48 * 60 * 60 * 1000 // 48h
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000 // 7d

export async function getMarketFreshness(): Promise<MarketFreshness> {
  if (!db) {
    return {
      status: "empty",
      signalCount: 0,
      clusterCount: 0,
      lastSignalAt: null,
      lastSuccessfulCollectAt: null,
      refreshInFlight: false,
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

  let status: MarketFreshnessStatus
  if (signalCount === 0) {
    status = "empty"
  } else {
    const referenceTime = lastSuccessfulCollectAt ?? lastSignalAt
    const ageMs = referenceTime
      ? Date.now() - new Date(referenceTime).getTime()
      : Infinity
    if (ageMs <= FRESH_THRESHOLD_MS) status = "fresh"
    else if (ageMs >= STALE_THRESHOLD_MS) status = "stale"
    else status = "fresh"
  }

  return {
    status,
    signalCount,
    clusterCount,
    lastSignalAt,
    lastSuccessfulCollectAt,
    refreshInFlight,
  }
}
