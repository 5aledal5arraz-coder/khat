/**
 * «تشغيل الآن» — one operator-triggered market-intelligence run.
 *
 * Since 2026-09-26 the daily schedule is off by default (see
 * `isMarketSchedulerEnabled` in lib/jobs/scheduler-bootstrap.ts); a run
 * starts when the operator asks for one. This enqueues the SAME job the
 * schedule used (`market.collect`, which chains extract → cluster/score), so
 * there is one code path, not two. The work runs in the job worker — never
 * in the request.
 *
 * Dedup: no new run while any collect/extract/cluster stage is pending or
 * running — the same set `getMarketFreshness().refreshInFlight` reports, so
 * the button's disabled state and this guard cannot disagree. The check and
 * the insert are two statements, so two clicks landing within the same few
 * milliseconds from two tabs could still both enqueue; the button disables
 * itself on the first click, which covers the realistic case.
 *
 * Taste decay: the disabled schedule also ran the daily `market.taste_decay`
 * (a soft fade on editorial_taste_weights so old preferences fade unless
 * reinforced). With the schedule off nothing ran it, so the weights stopped
 * fading. A manual run now enqueues it too, through the SAME daily gate the
 * scheduler used (`enqueueTasteDecayIfDue`, shared by both) — at most once
 * per 24h, never stacked — so pressing the button twice cannot decay twice.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { enqueueJob } from "@/lib/jobs/queue"

export const MARKET_RUN_STAGES = [
  "market.collect",
  "market.extract",
  "market.cluster_signals",
] as const

const DAILY_MS = 24 * 60 * 60 * 1000

/**
 * Enqueue the daily taste-decay job unless one succeeded in the last 24h or
 * one is already pending/running. The one gate for both the scheduler tick
 * and a manual run. Returns whether a job was enqueued.
 */
export async function enqueueTasteDecayIfDue(): Promise<boolean> {
  if (!db) throw new Error("DB unavailable")
  const recentDecay = await db.execute(sql`
    SELECT
      (SELECT max(completed_at) FROM jobs WHERE type='market.taste_decay' AND status='succeeded') AS last_ok,
      (SELECT count(*)::int FROM jobs WHERE type='market.taste_decay' AND status IN ('pending','running')) AS inflight
  `)
  const row = (recentDecay.rows[0] ?? {}) as { last_ok?: string | null; inflight?: number }
  const lastDecayOk = row.last_ok ?? null
  const decayInflight = Number(row.inflight ?? 0)
  const decayStale = !lastDecayOk || Date.now() - new Date(lastDecayOk).getTime() >= DAILY_MS
  if (!decayStale || decayInflight > 0) return false
  await enqueueJob("market.taste_decay", { scheduled: true }, { priority: 2, maxAttempts: 1 })
  return true
}

export type MarketRunNowResult = (
  | { status: "enqueued"; jobId: string }
  | { status: "already_in_flight" }
) & {
  /** the daily taste-decay job was enqueued alongside (gate: once per 24h) */
  decayEnqueued: boolean
}

export async function enqueueMarketRunNow(): Promise<MarketRunNowResult> {
  if (!db) throw new Error("DB unavailable")
  // Independent of the collect dedup below: decay has its own daily gate.
  const decayEnqueued = await enqueueTasteDecayIfDue()
  const inflight = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM jobs
    WHERE type IN (${sql.join(
      MARKET_RUN_STAGES.map((t) => sql`${t}`),
      sql`, `,
    )})
      AND status IN ('pending', 'running')
  `)
  const n = Number((inflight.rows[0] as { n?: number } | undefined)?.n ?? 0)
  if (n > 0) return { status: "already_in_flight", decayEnqueued }

  const job = await enqueueJob(
    "market.collect",
    // Same payload the season card's «تحديث الآن» always sent; collect hands
    // off to extract → cluster/score on its own, so the run completes
    // end-to-end. `trigger` only labels the row for whoever reads the queue.
    { scheduled: true, trigger: "manual" },
    { priority: 8, maxAttempts: 1 },
  )
  return { status: "enqueued", jobId: job.id, decayEnqueued }
}
