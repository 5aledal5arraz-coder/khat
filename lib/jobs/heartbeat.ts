/**
 * Worker liveness heartbeat — the worker's own proof of life.
 *
 * WHY THIS EXISTS
 * ---------------
 * The ops home used to infer "is the worker alive?" from
 * `MAX(jobs.updated_at)`: the worker stamps that column when it claims or
 * completes a job, so recent job activity implied a live worker. That
 * inference is only valid on a BUSY system. KHAT processes a handful of jobs
 * a day, so ten quiet minutes — the normal state of this queue — made a
 * perfectly healthy worker indistinguishable from a dead one, and the home
 * band declared «الإنتاج متوقف — عامل المهام ميت» while the worker was
 * happily polling. A dashboard that cries wolf is worse than no dashboard:
 * it teaches the operator to ignore red.
 *
 * The fix is to stop inferring. The worker now states its own liveness on a
 * fixed cadence that is INDEPENDENT of whether it has work:
 *
 *   • Written from a `setInterval`, NOT from the claim loop. `processOne()`
 *     awaits its handler, and a `studio.*` handler can hold that await for 30
 *     minutes — a beat written inside the loop would report the busiest
 *     worker as the deadest one. The timer fires from the event loop, which
 *     stays free while a handler waits on network I/O.
 *   • A handler that wedges the event loop (a real CPU spin, not an await)
 *     DOES stop the beat, and that is correct: such a worker is genuinely
 *     processing nothing.
 *
 * STORAGE — `config_store`, deliberately
 * --------------------------------------
 * One mutable row, upserted in place. `config_store` is already the runtime
 * key/value home for exactly this class of state (`rss_sync`, the AI-router
 * runtime override, model selection, benchmark thresholds), every consumer
 * reads it by explicit key, and it needs NO schema change — so this lands
 * without a migration.
 *
 * `system_events` was the other candidate and was rejected: it is an
 * append-only log with no retention, so a 30-second beat would add ~2,880
 * rows/day, swamp the 20-row activity feed the ops page renders, and distort
 * every source/severity count on the page. A heartbeat is current state, not
 * history — it belongs in a row that is overwritten, not appended.
 *
 * CLOCKS
 * ------
 * Freshness is measured entirely against the DATABASE clock: the writer
 * stamps `updated_at = NOW()` (server-side) and the reader computes the age
 * in SQL. The worker and the Next.js server are separate processes and may be
 * separate hosts; comparing a worker-supplied timestamp against the web
 * host's `Date.now()` would let clock skew manufacture liveness (or fake a
 * death). Only `booted_at` inside the payload is worker-supplied, and it is
 * display context, never a health input.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { configStore } from "@/lib/db/schema/system"

/** The single `config_store` row every worker upserts. */
export const WORKER_HEARTBEAT_KEY = "worker.heartbeat"

/** How often the worker writes a beat. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000

/**
 * A beat older than this means the worker is NOT responding.
 *
 * Three missed beats. Tight enough that a real death surfaces in ~1.5
 * minutes instead of the old 10, generous enough that one slow write, a GC
 * pause, or a brief DB blip doesn't flash red at an operator. The margin is
 * what keeps this signal trustworthy — see the file header.
 */
export const WORKER_HEARTBEAT_STALE_MS = 90_000

/**
 * What the worker says about itself. Stored as the row's JSONB `value`.
 *
 * `busy` is the difference between the two HEALTHY states: a worker chewing
 * through a job and a worker sitting idle with an empty queue are both fine,
 * and the ops page must never paint the second one red.
 */
export interface WorkerHeartbeatPayload {
  /** Which worker wrote this beat (`WORKER_ID`). */
  worker_id: string
  /** True while a handler is executing. */
  busy: boolean
  /** Job type in flight; null when idle. */
  job_type: string | null
  /** ISO — when this worker process booted. Display context only. */
  booted_at: string
}

/**
 * Upsert one beat. NEVER throws.
 *
 * A failed heartbeat write must not kill the worker or interrupt a job — the
 * beat is telemetry about the work, not the work. A write that keeps failing
 * simply lets the row age out, and the ops page reports "not responding",
 * which is the honest read of a worker that can't reach its database.
 *
 * `updated_at` is set to the DB's `NOW()`, never the caller's clock.
 */
export async function writeWorkerHeartbeat(
  payload: WorkerHeartbeatPayload,
  onError?: (err: unknown) => void,
): Promise<void> {
  if (!db) return
  try {
    await db
      .insert(configStore)
      .values({ key: WORKER_HEARTBEAT_KEY, value: payload })
      .onConflictDoUpdate({
        target: configStore.key,
        set: { value: payload, updated_at: sql`NOW()` },
      })
  } catch (err) {
    onError?.(err)
  }
}

export interface WorkerHeartbeatHandle {
  /**
   * Write a beat right now. Call this on every busy↔idle TRANSITION.
   *
   * The interval alone is a liveness signal but a poor busy/idle signal: most
   * KHAT jobs finish in well under one interval, so a purely timer-driven beat
   * would almost never catch the worker mid-job and «يعمل» would be a state
   * the operator effectively never sees. Beating on the transition makes the
   * reported state exact for the price of two tiny upserts per job — cheap on
   * a queue whose whole problem is that it is quiet.
   */
  beat: () => void
  stop: () => void
}

/**
 * Start beating on `WORKER_HEARTBEAT_INTERVAL_MS`.
 *
 * `describe()` is called at every beat rather than captured once, so the beat
 * always carries the worker's CURRENT busy/idle state instead of whatever was
 * true when the timer was armed.
 *
 * The first beat fires immediately: a worker that just booted should be
 * visible as alive at once, not after one interval of looking dead.
 *
 * The interval is `unref`'d to match the other timers in `worker.ts` — the
 * claim loop is what keeps the process alive, and a heartbeat alone must
 * never be the reason a shutting-down worker lingers.
 */
export function startWorkerHeartbeat(
  describe: () => WorkerHeartbeatPayload,
  onError?: (err: unknown) => void,
): WorkerHeartbeatHandle {
  const beat = () => void writeWorkerHeartbeat(describe(), onError)
  beat()
  const handle = setInterval(beat, WORKER_HEARTBEAT_INTERVAL_MS)
  handle.unref?.()
  return { beat, stop: () => clearInterval(handle) }
}
