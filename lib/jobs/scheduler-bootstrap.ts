/**
 * Scheduler bootstrap.
 *
 * Called once at worker startup to guarantee recurring system ticks
 * exist in the queue. Idempotent — if a tick is already pending or
 * running, this is a no-op.
 *
 * Wired from `lib/jobs/worker.ts`. No operator action required.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { enqueueJob } from "./queue"

export async function ensureMarketScheduler(): Promise<{
  status: "already_scheduled" | "bootstrapped"
  jobId: string | null
}> {
  if (!db) return { status: "already_scheduled", jobId: null }
  const existing = await db.execute(sql`
    SELECT id FROM jobs
    WHERE type = 'market.scheduler'
      AND status IN ('pending', 'running')
    LIMIT 1
  `)
  if (existing.rows.length > 0) {
    return {
      status: "already_scheduled",
      jobId: String((existing.rows[0] as { id: string }).id),
    }
  }
  const job = await enqueueJob(
    "market.scheduler",
    { initial: true },
    { priority: 2, maxAttempts: 1 },
  )
  return { status: "bootstrapped", jobId: job.id }
}

// ─── Phase 2.1 (P2.1.f) — ai-runs-sweeper schedule ───────────────────

/** Default tick interval — 30 min. Tunable via env. */
const DEFAULT_AI_RUNS_SWEEP_INTERVAL_MS = 30 * 60 * 1000

function readSweepIntervalMs(): number {
  const v = Number(process.env.KHAT_AI_RUNS_SWEEP_INTERVAL_MS)
  return Number.isFinite(v) && v > 0
    ? Math.floor(v)
    : DEFAULT_AI_RUNS_SWEEP_INTERVAL_MS
}

/**
 * Guarantee a pending `ai-runs-sweeper` tick exists in the queue.
 *
 * Returns:
 *   • "already_scheduled" — a pending or running ai-runs-sweeper job
 *     is already queued; no-op.
 *   • "bootstrapped" — no future tick existed, so this call enqueued
 *     one with run_after = NOW() + KHAT_AI_RUNS_SWEEP_INTERVAL_MS
 *     (default 30 min).
 *
 * Idempotency contract is "at most one future ai-runs-sweeper job",
 * not exact-spacing — the worker's poll-loop re-check ensures the
 * next tick is enqueued shortly after the previous one finishes.
 *
 * The handler from P2.1.b is FROZEN; it does NOT self-re-enqueue.
 * The worker calls this function at startup AND periodically inside
 * its main loop (see lib/jobs/worker.ts).
 */
export async function ensureAiRunsSweeperSchedule(): Promise<{
  status: "already_scheduled" | "bootstrapped"
  jobId: string | null
}> {
  if (!db) return { status: "already_scheduled", jobId: null }
  const existing = await db.execute(sql`
    SELECT id FROM jobs
    WHERE type = 'ai-runs-sweeper'
      AND status IN ('pending', 'running')
    LIMIT 1
  `)
  if (existing.rows.length > 0) {
    return {
      status: "already_scheduled",
      jobId: String((existing.rows[0] as { id: string }).id),
    }
  }
  const intervalMs = readSweepIntervalMs()
  const runAfter = new Date(Date.now() + intervalMs)
  const job = await enqueueJob(
    "ai-runs-sweeper",
    { dryRun: false, maxRows: 5000 },
    { priority: 1, maxAttempts: 1, runAfter },
  )
  return { status: "bootstrapped", jobId: job.id }
}
