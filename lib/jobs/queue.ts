/**
 * Khat Brain — enqueue API.
 *
 * Single function callers use to push work into the queue. Returns the
 * job id so callers can correlate with logs / poll for completion if
 * they need to.
 */

import { eq, and, sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { jobs } from "@/lib/db/schema/jobs"
import type { EnqueueOptions, JobRow, JobStatus } from "./types"

function mapRow(r: typeof jobs.$inferSelect): JobRow {
  return {
    id: r.id,
    type: r.type,
    status: r.status as JobStatus,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    result: (r.result ?? null) as Record<string, unknown> | null,
    error_message: r.error_message,
    priority: r.priority,
    attempts: r.attempts,
    max_attempts: r.max_attempts,
    run_after: r.run_after.toISOString(),
    locked_by: r.locked_by,
    locked_at: r.locked_at ? r.locked_at.toISOString() : null,
    started_at: r.started_at ? r.started_at.toISOString() : null,
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }
}

export async function enqueueJob(
  type: string,
  payload: Record<string, unknown> = {},
  options: EnqueueOptions = {},
): Promise<JobRow> {
  const [row] = await db!
    .insert(jobs)
    .values({
      type,
      payload,
      priority: options.priority ?? 0,
      run_after: options.runAfter ?? new Date(),
      max_attempts: options.maxAttempts ?? 3,
    })
    .returning()
  return mapRow(row)
}

export async function getJob(id: string): Promise<JobRow | null> {
  const rows = await db!.select().from(jobs).where(eq(jobs.id, id)).limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

export interface ListJobsOptions {
  status?: JobStatus
  type?: string
  limit?: number
}

export async function listJobs(opts: ListJobsOptions = {}): Promise<JobRow[]> {
  const conditions = []
  if (opts.status) conditions.push(eq(jobs.status, opts.status))
  if (opts.type) conditions.push(eq(jobs.type, opts.type))
  const rows = await db!
    .select()
    .from(jobs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(jobs.created_at))
    .limit(opts.limit ?? 50)
  return rows.map(mapRow)
}

/**
 * Atomically claim the next eligible job. Returns null when nothing is
 * ready. Uses `FOR UPDATE SKIP LOCKED` so multiple worker processes can
 * run in parallel without racing.
 */
export async function claimNextJob(workerId: string): Promise<JobRow | null> {
  // Two-step: select the candidate id under a row lock, then update it
  // by id. Drizzle's pg adapter doesn't expose `RETURNING ... FOR UPDATE`
  // on UPDATE, so we use raw SQL for the select.
  return await db!.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND run_after <= NOW()
      ORDER BY priority DESC, run_after ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `)) as unknown as { rows: Array<{ id: string }> }
    const candidate = rows.rows?.[0]
    if (!candidate) return null

    const [claimed] = await tx
      .update(jobs)
      .set({
        status: "running",
        locked_by: workerId,
        locked_at: new Date(),
        started_at: new Date(),
        attempts: sql`${jobs.attempts} + 1`,
        updated_at: new Date(),
      })
      .where(eq(jobs.id, candidate.id))
      .returning()
    return mapRow(claimed)
  })
}

/** Mark a claimed job as completed with its result. */
export async function completeJob(
  id: string,
  result: Record<string, unknown> | null,
): Promise<void> {
  await db!
    .update(jobs)
    .set({
      status: "succeeded",
      result: result ?? null,
      completed_at: new Date(),
      locked_by: null,
      locked_at: null,
      error_message: null,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, id))
}

/**
 * Mark a claimed job as failed. If attempts < max_attempts, the job is
 * returned to the pending pool for retry; otherwise it's marked dead.
 *
 * Returns the resolved status plus the attempts counters so callers
 * (worker.ts in P2.3.c) can emit the right system-events variant —
 * `jobs.failed` (will retry) or `jobs.dead` (terminal) — without an
 * extra round-trip to the DB.
 *
 * If the row is not found (race against deletion), returns
 * `{ status: 'dead', attempts: 0, max_attempts: 0 }` as a defensive
 * default. Callers can treat a not-found job as terminal.
 */
export async function failJob(
  id: string,
  errorMessage: string,
  retryAfter?: Date,
): Promise<{
  status: "pending" | "dead"
  attempts: number
  max_attempts: number
}> {
  const rows = await db!
    .select({ attempts: jobs.attempts, max_attempts: jobs.max_attempts })
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1)
  const job = rows[0]
  if (!job) return { status: "dead", attempts: 0, max_attempts: 0 }

  const isDead = job.attempts >= job.max_attempts
  await db!
    .update(jobs)
    .set({
      status: isDead ? "dead" : "pending",
      error_message: errorMessage,
      run_after: retryAfter ?? new Date(),
      locked_by: null,
      locked_at: null,
      completed_at: isDead ? new Date() : null,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, id))

  return {
    status: isDead ? "dead" : "pending",
    attempts: job.attempts,
    max_attempts: job.max_attempts,
  }
}

/**
 * Reclaim jobs whose worker died mid-execution.
 *
 * Returns one entry per reclaimed row so callers can emit per-row
 * `jobs.reclaimed` events (P2.3.c). The `previous_locked_by` field
 * carries the worker-id that was holding the stale lease — handy for
 * the dashboard when correlating crash recovery to specific workers.
 *
 * Uses a CTE to capture the pre-UPDATE `locked_by` value (UPDATE …
 * RETURNING in Postgres always returns post-update values, which
 * would be NULL since we null out `locked_by` as part of the reclaim).
 */
export async function reclaimStaleJobs(staleAfterMs: number): Promise<
  Array<{ id: string; type: string; previous_locked_by: string | null }>
> {
  const cutoff = new Date(Date.now() - staleAfterMs)
  const result = (await db!.execute(sql`
    WITH stale AS (
      SELECT id, type, locked_by
        FROM jobs
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < ${cutoff.toISOString()}
    ),
    updated AS (
      UPDATE jobs
         SET status = 'pending',
             locked_by = NULL,
             locked_at = NULL,
             updated_at = NOW()
       WHERE id IN (SELECT id FROM stale)
       RETURNING id
    )
    SELECT s.id, s.type, s.locked_by AS previous_locked_by
      FROM stale s
      JOIN updated u ON u.id = s.id
  `)) as unknown as {
    rows: Array<{ id: string; type: string; previous_locked_by: string | null }>
  }
  return result.rows ?? []
}
