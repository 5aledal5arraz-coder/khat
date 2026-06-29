/**
 * Market source-feedback sweep — the batch safety net for the third learning
 * loop. The per-EIR hook in analyzeEirPerformance credits sources the moment a
 * performance signal is computed; this daily sweep catches any EIR that has a
 * score but wasn't credited (backfill, missed hooks, seeded data).
 *
 * Self-re-enqueues like market.scheduler; bootstrapped at worker startup.
 */

import { backfillSourceFeedback } from "@/lib/market-intelligence/source-feedback"
import { registerHandler } from "../registry"
import { enqueueRecurringTick } from "../queue"

const DAY_MS = 24 * 60 * 60 * 1000

export function sourceFeedbackIntervalMs(): number {
  const v = Number(process.env.KHAT_SOURCE_FEEDBACK_INTERVAL_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DAY_MS
}

registerHandler<{ limit?: number }, { scanned: number; credited: number }>(
  "market.source_feedback",
  async (payload) => {
    // Queue the next tick first so a failing sweep can't break the schedule.
    // Idempotent — a reclaim/restart re-run won't spawn a second chain.
    const runAfter = new Date(Date.now() + sourceFeedbackIntervalMs())
    await enqueueRecurringTick("market.source_feedback", {}, { priority: 1, maxAttempts: 1, runAfter })
    return backfillSourceFeedback({ limit: payload?.limit ?? 200 })
  },
)
