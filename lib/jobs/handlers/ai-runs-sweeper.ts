/**
 * Phase 2.1 (P2.1.b) — Stale-running ai_runs sweeper.
 *
 * Reclaims `ai_runs` rows that got stuck in status='running' because
 * the Node process was killed mid-call before its `finally` block could
 * flip the status. These leaked rows count against the rate-limiter's
 * tier-concurrency cap forever, so they need bounded cleanup.
 *
 * Trigger pattern (handler):
 *   - Registered for job type "ai-runs-sweeper".
 *   - Reusable from the manual CLI (`scripts/job-ai-runs-sweep.ts`) and
 *     from the worker daemon (queue payload routes here once
 *     P2.1.f wires the bootstrap).
 *
 * Policy:
 *   - Stale threshold: `started_at < NOW() - 15 min` AND status='running'.
 *   - Default mode: dry-run (counts only).
 *   - Confirmed run: UPDATE status='timed_out', completed_at=NOW(),
 *     error_class='stale_sweep', error_message='reclaimed by stale-
 *     running sweeper'. Same row, distinguishable from real timeouts.
 *   - Batch cap: 5000 rows per invocation (env-overridable).
 *   - Lock: `pg_advisory_xact_lock(hashtext('khat-ai-runs-sweep'))`
 *     inside one transaction → prevents concurrent sweeps.
 *   - Orphan subject locks: delete from ai_subject_locks where
 *     `acquired_at < NOW() - 15 min` in the same transaction. Mirrors
 *     the predicate P1.6's `acquireRateLimitPermit` already uses at
 *     acquire-time pre-cleanup; belt-and-suspenders.
 *
 * Telemetry: returns a structured `SweepResult` (no new DB schema).
 *
 * NOT in P2.1.b:
 *   - Tests (P2.1.c).
 *   - Worker bootstrap (P2.1.f).
 *   - Observation extension (P2.1.f).
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { registerHandler } from "../registry"
import type { JobHandler } from "../types"
// Phase 2.3.c — unified event log. Fire-and-forget per emit contract.
// Wet-path only — dry-run sweeps do NOT emit (operator §6 Q2). This
// keeps CLI dry-runs from spamming the event log; the dashboard cares
// about real sweeps.
import { emitSystemEvent } from "@/lib/system-events/emit"
import { buildSweeperSummaryEvent } from "@/lib/system-events/builders"

// ─── Constants ────────────────────────────────────────────────────────

/** Default stale window: 15 min. Router default timeout is 120s, so
 *  anything older than 15 min is presumed orphaned. Tunable via env. */
export const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000

/** Default per-invocation cap. Mirrors P1.5 retention's 50k cap shape;
 *  smaller here because sweeps should be small in steady state. */
export const DEFAULT_MAX_ROWS = 5_000

/** The `error_class` stamped on reclaimed rows so they're forensically
 *  distinguishable from real timeouts. */
export const SWEEP_ERROR_CLASS = "stale_sweep"

/** The fixed `error_message` on reclaimed rows. */
export const SWEEP_ERROR_MESSAGE = "reclaimed by stale-running sweeper"

/** Subject-lock orphan threshold. Matches the predicate already in
 *  `lib/ai-router/rate-limit.ts`. */
const SUBJECT_LOCK_STALE_MS = 10 * 60 * 1000

// ─── Types ────────────────────────────────────────────────────────────

export type SweepClassification = "reclaim" | "keep" | "skip"

export interface SweepInput {
  /** Default: true. Set false to actually mutate. */
  dryRun?: boolean
  /** Wall-clock anchor. Test seam. Default: new Date(). */
  now?: Date
  /** Max rows to reclaim per invocation. Default DEFAULT_MAX_ROWS. */
  maxRows?: number
  /** Stale threshold in ms. Default DEFAULT_STALE_AFTER_MS. */
  staleAfterMs?: number
}

export interface SweepResult {
  dry_run: boolean
  cutoff: string // ISO timestamp
  ai_runs: {
    candidates: number
    would_reclaim: number
    reclaimed: number
    earliest_started_at: string | null
  }
  ai_subject_locks: {
    candidates: number
    deleted: number
  }
  wall_ms: number
}

/** Read tunables from env with safe defaults. */
export function readSweepEnv(): {
  staleAfterMs: number
  maxRows: number
} {
  const stale = Number(process.env.KHAT_AI_RUNS_STALE_AFTER_MS)
  const max = Number(process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS)
  return {
    staleAfterMs:
      Number.isFinite(stale) && stale > 0 ? stale : DEFAULT_STALE_AFTER_MS,
    maxRows: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_MAX_ROWS,
  }
}

// ─── Pure classifier (testable without DB) ────────────────────────────

/**
 * Decide what to do with a single `ai_runs` row given the current
 * wall-clock and policy thresholds. Pure: no DB, no I/O, no side
 * effects. Designed for P2.1.c unit tests.
 *
 *   "reclaim" — status='running' AND started_at older than threshold
 *   "skip"    — status='running' AND started_at IS NULL (defensive;
 *               can't compute age)
 *   "keep"    — status='running' AND not yet stale
 *   "skip"    — any other status (already terminal)
 */
export function classifyAiRunForSweep(args: {
  now: Date
  status: string
  startedAt: Date | null
  staleAfterMs: number
}): SweepClassification {
  if (args.status !== "running") return "skip"
  if (args.startedAt === null) return "skip"
  const age = args.now.getTime() - args.startedAt.getTime()
  if (age >= args.staleAfterMs) return "reclaim"
  return "keep"
}

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Run one sweep. Returns a structured report. Mutates the DB only when
 * `dryRun === false`. Wraps the wet path in a single transaction and a
 * `pg_advisory_xact_lock(hashtext('khat-ai-runs-sweep'))`.
 */
export async function runAiRunsSweep(
  input: SweepInput = {},
): Promise<SweepResult> {
  if (!db) throw new Error("DB not available")

  const env = readSweepEnv()
  const wallStart = Date.now()
  const dryRun = input.dryRun ?? true
  const now = input.now ?? new Date()
  const staleAfterMs = input.staleAfterMs ?? env.staleAfterMs
  const maxRows = input.maxRows ?? env.maxRows
  const cutoff = new Date(now.getTime() - staleAfterMs)
  const subjectLockCutoff = new Date(now.getTime() - SUBJECT_LOCK_STALE_MS)

  const result: SweepResult = {
    dry_run: dryRun,
    cutoff: cutoff.toISOString(),
    ai_runs: {
      candidates: 0,
      would_reclaim: 0,
      reclaimed: 0,
      earliest_started_at: null,
    },
    ai_subject_locks: {
      candidates: 0,
      deleted: 0,
    },
    wall_ms: 0,
  }

  // ─── COUNT PHASE (both modes) ────────────────────────────────────────

  const aiCounts = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS candidates,
      MIN(started_at) AS earliest
    FROM ai_runs
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < ${cutoff.toISOString()}
  `)) as unknown as {
    rows: Array<{ candidates: number; earliest: Date | null }>
  }
  const aiRow = aiCounts.rows[0] ?? { candidates: 0, earliest: null }
  result.ai_runs.candidates = aiRow.candidates
  result.ai_runs.earliest_started_at = aiRow.earliest
    ? new Date(aiRow.earliest).toISOString()
    : null
  result.ai_runs.would_reclaim = Math.min(aiRow.candidates, maxRows)

  const lockCounts = (await db.execute(sql`
    SELECT COUNT(*)::int AS candidates
    FROM ai_subject_locks
    WHERE acquired_at < ${subjectLockCutoff.toISOString()}
  `)) as unknown as { rows: Array<{ candidates: number }> }
  result.ai_subject_locks.candidates = lockCounts.rows[0]?.candidates ?? 0

  if (dryRun) {
    result.wall_ms = Date.now() - wallStart
    return result
  }

  // ─── WET PHASE (single transaction + advisory lock) ──────────────────

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('khat-ai-runs-sweep'))`,
    )

    // 1. Reclaim ai_runs.
    const reclaimRes = (await tx.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM ai_runs
        WHERE status = 'running'
          AND started_at IS NOT NULL
          AND started_at < ${cutoff.toISOString()}
        ORDER BY started_at ASC
        LIMIT ${maxRows}
      )
      UPDATE ai_runs
      SET
        status = 'timed_out',
        completed_at = NOW(),
        error_class = ${SWEEP_ERROR_CLASS},
        error_message = ${SWEEP_ERROR_MESSAGE}
      WHERE id IN (SELECT id FROM candidates)
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> }
    result.ai_runs.reclaimed = reclaimRes.rows.length

    // 2. Sweep orphan subject locks.
    const lockDelRes = (await tx.execute(sql`
      DELETE FROM ai_subject_locks
      WHERE acquired_at < ${subjectLockCutoff.toISOString()}
      RETURNING subject_table, subject_id
    `)) as unknown as { rows: Array<{ subject_table: string; subject_id: string }> }
    result.ai_subject_locks.deleted = lockDelRes.rows.length
  })

  result.wall_ms = Date.now() - wallStart

  // P2.3.c — mirror summary to unified event log. Wet path only;
  // dry-run takes the early return above. `skipped` is the count of
  // rows that were eligible but truncated by the maxRows cap.
  void emitSystemEvent(
    buildSweeperSummaryEvent({
      scanned: result.ai_runs.candidates,
      reclaimed: result.ai_runs.reclaimed,
      skipped: result.ai_runs.candidates - result.ai_runs.reclaimed,
      duration_ms: result.wall_ms,
      stale_after_ms: staleAfterMs,
      actor: "sweeper",
    }),
  )

  return result
}

// ─── Job-queue handler ────────────────────────────────────────────────

/**
 * Handler registered for job type "ai-runs-sweeper". Payload accepts
 * the same shape as the function input (excluding the `now` test seam).
 * Used by the worker daemon once P2.1.f wires the recurring tick.
 */
const aiRunsSweeperHandler: JobHandler<
  { dryRun?: boolean; maxRows?: number; staleAfterMs?: number },
  SweepResult
> = async (payload) => {
  return runAiRunsSweep({
    dryRun: payload.dryRun,
    maxRows: payload.maxRows,
    staleAfterMs: payload.staleAfterMs,
  })
}

registerHandler("ai-runs-sweeper", aiRunsSweeperHandler)

export { aiRunsSweeperHandler }
