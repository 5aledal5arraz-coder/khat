/**
 * Khat Brain — enqueue API.
 *
 * Single function callers use to push work into the queue. Returns the
 * job id so callers can correlate with logs / poll for completion if
 * they need to.
 */

import { eq, and, sql, desc, inArray, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { jobs } from "@/lib/db/schema/jobs"
import type { EnqueueOptions, JobRow, JobStatus } from "./types"
import {
  HEAVY_TYPE_PREFIXES,
  HEAVY_TYPES,
  type WorkerLane,
} from "./lanes"
import { REQUEUED_MESSAGE, REQUEUE_EXHAUSTED_MESSAGE } from "./lease"

function mapRow(r: typeof jobs.$inferSelect): JobRow {
  return {
    id: r.id,
    type: r.type,
    status: r.status as JobStatus,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    result: (r.result ?? null) as Record<string, unknown> | null,
    progress: (r.progress ?? null) as Record<string, unknown> | null,
    error_message: r.error_message,
    dedupe_key: r.dedupe_key ?? null,
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

export interface EnqueueOnceOptions extends EnqueueOptions {
  /** See `jobs.dedupe_key`. Required — this is the whole point of the call. */
  dedupeKey: string
}

export interface EnqueueOnceResult {
  job: JobRow
  /** True when a pending/running job with this key already existed and was returned instead. */
  alreadyRunning: boolean
}

/**
 * Enqueue `type` unless a pending/running job with the same `dedupeKey`
 * already exists — in which case that job is returned with
 * `alreadyRunning: true`.
 *
 * Race-free by construction: the partial unique index `jobs_dedupe_inflight`
 * (dedupe_key WHERE status IN ('pending','running')) makes the INSERT itself
 * the arbiter, so two concurrent callers (a double-click, two tabs) produce ONE
 * row — no read-then-write window like `findInFlightJobByPayload` + `enqueueJob`
 * had. The loser's INSERT hits ON CONFLICT DO NOTHING and reads the winner.
 *
 * The loop covers one real interleaving: the in-flight job finishes between our
 * conflicting INSERT and the read-back, so there is nothing to read — the next
 * INSERT then simply succeeds. Bounded so a pathological flap can't spin.
 */
export async function enqueueJobOnce(
  type: string,
  payload: Record<string, unknown>,
  options: EnqueueOnceOptions,
): Promise<EnqueueOnceResult> {
  for (let i = 0; i < 3; i++) {
    const inserted = await db!
      .insert(jobs)
      .values({
        type,
        payload,
        dedupe_key: options.dedupeKey,
        priority: options.priority ?? 0,
        run_after: options.runAfter ?? new Date(),
        max_attempts: options.maxAttempts ?? 3,
      })
      .onConflictDoNothing({
        target: jobs.dedupe_key,
        where: sql`status IN ('pending', 'running')`,
      })
      .returning()
    if (inserted[0]) return { job: mapRow(inserted[0]), alreadyRunning: false }

    const existing = await findInFlightJobByDedupeKey(options.dedupeKey)
    if (existing) return { job: existing, alreadyRunning: true }
  }
  throw new Error(`enqueueJobOnce: could not enqueue or attach for "${options.dedupeKey}"`)
}

/** The pending/running job carrying `dedupeKey`, or null. At most one exists (unique index). */
export async function findInFlightJobByDedupeKey(dedupeKey: string): Promise<JobRow | null> {
  const rows = await db!
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.dedupe_key, dedupeKey),
        inArray(jobs.status, ["pending", "running"]),
      ),
    )
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

/**
 * The job a page should RE-ATTACH its status card to after a reload: the
 * in-flight job for `dedupeKey` if there is one, otherwise the most recent job
 * with that key that finished within `recentMs` (so a failure or a warning the
 * operator hasn't read yet survives a reload instead of vanishing). Older
 * history is ignored — the persisted data is the source of truth for "done".
 */
export async function findAttachableJobByDedupeKey(
  dedupeKey: string,
  recentMs = 30 * 60_000,
): Promise<JobRow | null> {
  const inflight = await findInFlightJobByDedupeKey(dedupeKey)
  if (inflight) return inflight
  const cutoff = new Date(Date.now() - recentMs)
  const rows = await db!
    .select()
    .from(jobs)
    .where(and(eq(jobs.dedupe_key, dedupeKey), gte(jobs.updated_at, cutoff)))
    .orderBy(desc(jobs.created_at))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

/**
 * Attachable jobs (see above) for every key starting with `prefix` — e.g. every
 * `season_batch:<seasonId>:` run. One row per key: the newest.
 */
export async function listAttachableJobsByDedupePrefix(
  prefix: string,
  recentMs = 30 * 60_000,
): Promise<JobRow[]> {
  const cutoff = new Date(Date.now() - recentMs)
  const rows = await db!
    .select()
    .from(jobs)
    .where(
      and(
        sql`${jobs.dedupe_key} LIKE ${escapeLike(prefix) + "%"}`,
        sql`(${jobs.status} IN ('pending', 'running') OR ${jobs.updated_at} >= ${cutoff.toISOString()})`,
      ),
    )
    .orderBy(desc(jobs.created_at))
    .limit(50)
  const seen = new Set<string>()
  const out: JobRow[] = []
  for (const r of rows) {
    const key = r.dedupe_key ?? r.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(mapRow(r))
  }
  return out
}

/** Attachable jobs (see findAttachableJobByDedupeKey) for a set of exact keys, newest per key. */
export async function listAttachableJobsByDedupeKeys(
  keys: string[],
  recentMs = 30 * 60_000,
): Promise<Map<string, JobRow>> {
  const out = new Map<string, JobRow>()
  if (keys.length === 0) return out
  const cutoff = new Date(Date.now() - recentMs)
  const rows = await db!
    .select()
    .from(jobs)
    .where(
      and(
        inArray(jobs.dedupe_key, keys),
        sql`(${jobs.status} IN ('pending', 'running') OR ${jobs.updated_at} >= ${cutoff.toISOString()})`,
      ),
    )
    .orderBy(desc(jobs.created_at))
  for (const r of rows) {
    if (r.dedupe_key && !out.has(r.dedupe_key)) out.set(r.dedupe_key, mapRow(r))
  }
  return out
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * Idempotent recurring-tick enqueue: enqueue the NEXT tick of `type` unless a
 * future (`pending`) tick already exists. Self-re-enqueueing schedulers MUST
 * use this instead of `enqueueJob` — otherwise a worker restart or a
 * lease-reclaim re-run compounds into parallel schedule chains.
 *
 * ── WHY ONLY `pending` (2026-10-03, noura) ────────────────────────────────
 * This used to skip when a `running` job of the type existed. But the caller
 * IS a running job of that type — every self-rescheduling tick saw itself,
 * skipped, and the schedule died after one tick; it only came back when a
 * worker restart re-ran the boot bootstrap. Four schedulers were affected
 * (podcast.weekly_sync, partner.task_reminder, market.source_feedback,
 * youtube.audience_refresh) plus market.scheduler.
 *
 * The dedupe that matters is "at most one FUTURE tick": a reclaimed re-run of
 * the same tick finds the pending tick it already queued and adds nothing.
 * The check-then-insert runs under a per-type advisory lock, so two ticks (or
 * a tick and a bootstrap) racing still produce one pending row.
 * Returns the new job, or null when a future tick was already queued.
 */
export async function enqueueRecurringTick(
  type: string,
  payload: Record<string, unknown> = {},
  options: EnqueueOptions = {},
): Promise<JobRow | null> {
  return db!.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"recurring-tick:" + type}))`)
    const existing = await tx.execute(sql`
      SELECT id FROM jobs
      WHERE type = ${type} AND status = 'pending'
      LIMIT 1
    `)
    if (existing.rows.length > 0) return null
    const [row] = await tx
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
  })
}

export async function getJob(id: string): Promise<JobRow | null> {
  const rows = await db!.select().from(jobs).where(eq(jobs.id, id)).limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

/**
 * Find the latest NON-terminal (pending or running) job of `type` whose payload
 * field `payloadKey` equals `payloadValue`.
 *
 * Two callers, one contract — "is a run already in flight for this session?":
 *   • the Studio status endpoints use it to RE-ATTACH the UI to an in-flight
 *     transcription after a page refresh (the jobId lives only in React state
 *     and is lost on reload) — so the progress bar resumes instead of the UI
 *     falling back to idle and inviting a duplicate trigger;
 *   • the Studio POST endpoints use it to DEDUP a second enqueue against a run
 *     already going for the same session.
 *
 * This is the per-payload sibling of `enqueueRecurringTick`'s per-type guard:
 * schedulers dedup on `type` alone, but a Studio job must dedup on
 * `type + sessionId` (two different sessions can transcribe concurrently).
 *
 * "latest" = most recently created, so a refresh re-attaches to the newest run.
 * Terminal jobs (succeeded / failed / dead / cancelled) are deliberately
 * excluded: a finished run must never hold the UI in a running state — the
 * persisted map/review is the source of truth for "done".
 */
export async function findInFlightJobByPayload(
  type: string,
  payloadKey: string,
  payloadValue: string,
): Promise<JobRow | null> {
  const rows = await db!
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.type, type),
        inArray(jobs.status, ["pending", "running"]),
        sql`${jobs.payload} ->> ${payloadKey} = ${payloadValue}`,
      ),
    )
    .orderBy(desc(jobs.created_at))
    .limit(1)
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
export async function claimNextJob(
  workerId: string,
  lane?: WorkerLane,
): Promise<JobRow | null> {
  // Two-step: select the candidate id under a row lock, then update it
  // by id. Drizzle's pg adapter doesn't expose `RETURNING ... FOR UPDATE`
  // on UPDATE, so we use raw SQL for the select.
  //
  // `lane` restricts the claim to that lane's job types (lib/jobs/lanes.ts);
  // omitted = any type (the single-loop behaviour, kept for callers/tests).
  const laneFilter = lane ? laneCondition(lane) : sql`TRUE`
  return await db!.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND run_after <= NOW()
        AND ${laneFilter}
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

/** SQL predicate: this row's `type` belongs to `lane`. Mirrors laneForJobType. */
function laneCondition(lane: WorkerLane) {
  const prefixConds = HEAVY_TYPE_PREFIXES.map(
    (p) => sql`type LIKE ${escapeLike(p) + "%"}`,
  )
  const heavy = sql`(${sql.join(
    [...prefixConds, sql`type IN (${sql.join(HEAVY_TYPES.map((t) => sql`${t}`), sql`, `)})`],
    sql` OR `,
  )})`
  return lane === "heavy" ? heavy : sql`NOT ${heavy}`
}

/**
 * Write a live-progress heartbeat onto a RUNNING job AND refresh its lease.
 * Called mid-execution by the handler (via `ctx.reportProgress`) so a status
 * poller can surface stage / % / ETA during a minutes-long job.
 *
 * As of Wave 2 this ALSO stamps `locked_at = NOW()`. A live handler pulses every
 * chunk (~1–3 min), so its lease stays fresh and the stale-lease reaper
 * (`reclaimStaleJobs`) can't reclaim a still-running long job out from under it —
 * which caused DOUBLE execution whenever the lease (5 min default) was shorter
 * than a handler's own budget (studio.* map/review = 30 min). A worker that has
 * actually DIED stops pulsing, so its lease still ages out and gets reclaimed as
 * intended.
 *
 * The write is FENCED on `attempts` as well as `status = 'running'`. `status`
 * alone is not enough: an attempt that timed out and was returned to the pool can
 * be re-claimed as a NEW running attempt (same id, `attempts + 1`). The orphaned
 * handler from the old attempt may still be alive and pulsing — under a
 * `status='running'`-only guard it would match the re-claimed row and stamp STALE
 * progress over the fresh run while reviving a lease it no longer owns. `claimNextJob`
 * bumps `attempts` on every claim, so fencing on the CLAIMED attempts value makes
 * an orphaned pulse (older `attempts`) a no-op against the re-claimed row
 * (`attempts + 1`); only the current attempt's own pulses match. Deliberately does
 * NOT bump `updated_at`: progress + lease refresh are soft signals, not a lifecycle
 * change, and leaving `updated_at` for real transitions keeps the stale-lease
 * reaper's accounting honest.
 *
 * This CAN throw (DB error) like the other queue writers; resilience — the
 * contract that a progress-write never fails the job — lives one layer up in
 * `createProgressReporter`, which wraps this and swallows.
 */
export async function reportJobProgress(
  id: string,
  progress: Record<string, unknown>,
  attempts: number,
): Promise<void> {
  await db!
    .update(jobs)
    .set({ progress, locked_at: new Date() })
    .where(
      and(
        eq(jobs.id, id),
        eq(jobs.status, "running"),
        eq(jobs.attempts, attempts),
      ),
    )
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
  opts?: { terminal?: boolean },
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

  // `terminal` forces a dead-letter regardless of the attempt count — used for
  // failures where retrying can't help (e.g. OpenAI out of quota). Otherwise a
  // job is dead only once it has exhausted its attempts.
  const isDead = opts?.terminal === true || job.attempts >= job.max_attempts
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
 * Renew the lease of a job THIS worker is running (`locked_at = NOW()`).
 * Called from the worker's renewal timer for each busy lane — independent of
 * the handler, so a quiet handler never looks orphaned (lib/jobs/lease.ts).
 * Fenced on owner + attempt: a stale timer can never revive a lease on a row
 * that was reclaimed and re-claimed by someone else.
 */
export async function renewJobLease(
  id: string,
  attempts: number,
  workerId: string,
): Promise<void> {
  await db!
    .update(jobs)
    .set({ locked_at: new Date() })
    .where(
      and(
        eq(jobs.id, id),
        eq(jobs.status, "running"),
        eq(jobs.attempts, attempts),
        eq(jobs.locked_by, workerId),
      ),
    )
}

export interface ReclaimedJob {
  id: string
  type: string
  previous_locked_by: string | null
  /** "pending" = back in the queue; "dead" = its one automatic re-run was spent. */
  outcome?: "pending" | "dead"
}

/**
 * Reclaim jobs whose worker died mid-execution.
 *
 * Default: every `running` job whose lease was not renewed for `staleAfterMs`.
 * With `lockedBy`: every running job held by that worker id, regardless of age
 * — for the boot path, when the previous worker is PROVEN dead (same host, its
 * pid is gone), so its jobs need not wait out the window.
 *
 * RE-RUN CAP (lib/jobs/lease.ts): a job gets back to `pending` only while
 * `attempts <= max_attempts` — i.e. one run beyond its budget. Past that it is
 * dead-lettered with REQUEUE_EXHAUSTED_MESSAGE, which frees its dedupe key so
 * the operator can press «أعد المحاولة».
 *
 * One entry per row so callers can emit per-row events; `previous_locked_by`
 * is captured by the CTE (RETURNING only sees post-update values).
 */
export async function reclaimStaleJobs(
  staleAfterMs: number,
  opts: { lockedBy?: string } = {},
): Promise<ReclaimedJob[]> {
  const cutoff = new Date(Date.now() - staleAfterMs)
  const ownerFilter = opts.lockedBy ? sql`AND locked_by = ${opts.lockedBy}` : sql``
  const result = (await db!.execute(sql`
    WITH stale AS (
      SELECT id, type, locked_by, attempts, max_attempts
        FROM jobs
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < ${cutoff.toISOString()}
         ${ownerFilter}
    ),
    requeued AS (
      UPDATE jobs
         SET status = 'pending',
             locked_by = NULL,
             locked_at = NULL,
             error_message = ${REQUEUED_MESSAGE},
             updated_at = NOW()
       WHERE id IN (SELECT id FROM stale WHERE attempts <= max_attempts)
       RETURNING id
    ),
    exhausted AS (
      UPDATE jobs
         SET status = 'dead',
             locked_by = NULL,
             locked_at = NULL,
             error_message = ${REQUEUE_EXHAUSTED_MESSAGE},
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id IN (SELECT id FROM stale WHERE attempts > max_attempts)
       RETURNING id
    )
    SELECT s.id, s.type, s.locked_by AS previous_locked_by,
           CASE WHEN e.id IS NOT NULL THEN 'dead' ELSE 'pending' END AS outcome
      FROM stale s
      LEFT JOIN requeued r ON r.id = s.id
      LEFT JOIN exhausted e ON e.id = s.id
     WHERE r.id IS NOT NULL OR e.id IS NOT NULL
  `)) as unknown as { rows: ReclaimedJob[] }
  return result.rows ?? []
}
