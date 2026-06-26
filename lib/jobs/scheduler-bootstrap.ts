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

// ─── Partnership CRM — overdue/due-soon task reminder ────────────────

/**
 * Guarantee a pending `partner.task_reminder` tick exists. The handler
 * self-re-enqueues daily (like market.scheduler); this only seeds the
 * first tick at startup. Idempotent — no-op if one is already queued.
 *
 * Seeded with a short initial delay so a freshly-started worker doesn't
 * email the moment it boots; steady-state cadence is
 * KHAT_PARTNER_REMINDER_INTERVAL_MS (default 24h).
 */
export async function ensurePartnerTaskReminderSchedule(): Promise<{
  status: "already_scheduled" | "bootstrapped"
  jobId: string | null
}> {
  if (!db) return { status: "already_scheduled", jobId: null }
  const existing = await db.execute(sql`
    SELECT id FROM jobs
    WHERE type = 'partner.task_reminder'
      AND status IN ('pending', 'running')
    LIMIT 1
  `)
  if (existing.rows.length > 0) {
    return {
      status: "already_scheduled",
      jobId: String((existing.rows[0] as { id: string }).id),
    }
  }
  const runAfter = new Date(Date.now() + 5 * 60 * 1000)
  const job = await enqueueJob(
    "partner.task_reminder",
    {},
    { priority: 2, maxAttempts: 1, runAfter },
  )
  return { status: "bootstrapped", jobId: job.id }
}
