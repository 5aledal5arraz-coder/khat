/**
 * Server-side read model for the job status card: one job (by id or dedupe key)
 * plus the worker's liveness, from the worker's OWN heartbeat row — the same
 * signal the ops page uses (lib/ops/diagnostics.ts), never inferred from job
 * activity. Never throws for the worker half: an unreadable heartbeat is
 * `alive: null` (unknown), which the card does not paint as dead.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { classifyWorkerHeartbeat } from "@/lib/ops/diagnostics"
import { WORKER_HEARTBEAT_KEY, type WorkerHeartbeatPayload } from "./heartbeat"
import { findAttachableJobByDedupeKey, getJob } from "./queue"
import { toJobSnapshot, type JobSnapshot, type WorkerSnapshot } from "./status-view"

export async function getWorkerSnapshot(): Promise<WorkerSnapshot> {
  if (!db) return { alive: null, lastBeatAgeS: null, busyWith: null, lanes: null, workerId: null }
  try {
    const res = (await db.execute(sql`
      SELECT value,
             EXTRACT(EPOCH FROM (NOW() - updated_at)) * 1000 AS age_ms
        FROM config_store
       WHERE key = ${WORKER_HEARTBEAT_KEY}
    `)) as unknown as { rows: Array<{ value: unknown; age_ms: string | number | null }> }
    const row = res.rows[0]
    // No beat has EVER been written: no worker has run against this DB.
    if (!row) return { alive: false, lastBeatAgeS: null, busyWith: null, lanes: null, workerId: null }
    const ageMs = row.age_ms === null ? null : Number(row.age_ms)
    const hb = classifyWorkerHeartbeat({ ageMs, value: row.value })
    if (hb.state === "unreadable") {
      return { alive: null, lastBeatAgeS: null, busyWith: null, lanes: null, workerId: null }
    }
    const alive = hb.state === "working" || hb.state === "idle"
    const v = (row.value ?? {}) as Partial<WorkerHeartbeatPayload>
    const lanes =
      alive && v.lanes && typeof v.lanes === "object"
        ? {
            heavy: typeof v.lanes.heavy === "string" ? v.lanes.heavy : null,
            interactive: typeof v.lanes.interactive === "string" ? v.lanes.interactive : null,
          }
        : null
    return {
      alive,
      lastBeatAgeS: hb.ageMs === null ? null : Math.round(hb.ageMs / 1000),
      busyWith: alive ? hb.jobType : null,
      lanes,
      workerId: alive ? hb.workerId : null,
    }
  } catch {
    return { alive: null, lastBeatAgeS: null, busyWith: null, lanes: null, workerId: null }
  }
}

export async function getJobSnapshot(opts: {
  jobId?: string | null
  dedupeKey?: string | null
}): Promise<JobSnapshot | null> {
  if (!db) return null
  const row = opts.jobId
    ? await getJob(opts.jobId)
    : opts.dedupeKey
      ? await findAttachableJobByDedupeKey(opts.dedupeKey)
      : null
  if (!row) return null
  // Lease age from the DATABASE clock (the worker stamps locked_at with it).
  let leaseAgeS: number | null = null
  if (row.status === "running") {
    try {
      const res = (await db.execute(sql`
        SELECT EXTRACT(EPOCH FROM (NOW() - locked_at)) AS age FROM jobs WHERE id = ${row.id}
      `)) as unknown as { rows: Array<{ age: string | number | null }> }
      const age = res.rows[0]?.age
      leaseAgeS = age === null || age === undefined ? null : Math.round(Number(age))
    } catch {
      /* unknown — the card falls back to worker liveness */
    }
  }
  return toJobSnapshot(row, leaseAgeS)
}
