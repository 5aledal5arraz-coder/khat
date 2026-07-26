/**
 * Phase 1.5 — retention policy and orchestrator.
 *
 * Pure-function policy + SQL builders + a single I/O orchestrator. The
 * CLI shell (scripts/job-retention-ai-runs.ts) wraps this module with
 * the hostname guard, lock, transaction, and dry-run flag.
 *
 * Policy (mirrors the P1.5 plan exactly):
 *
 *   ai_runs:
 *     • age < 90 days                     →  untouched
 *     • age ≥ 90 days, not stripped       →  strip (null out snapshots),
 *                                             roll into ai_runs_summary,
 *                                             stamp stripped_at = now
 *     • Earliest run per (task_kind,
 *       prompt_version)                   →  PROTECTED — never stripped
 *
 *   jsonb_validation_events:
 *     • age < 30 days                     →  untouched
 *     • age ≥ 30 days, mode='enforce'     →  untouched (real failures)
 *     • age ≥ 30 days, mode IN
 *       ('report','scanner')              →  deleted
 *
 *   ai_rate_limit_events (Phase 1.6 patch):
 *     • age < 30 days                     →  untouched
 *     • age ≥ 30 days, decision='allowed' →  deleted
 *     • age ≥ 30 days, decision LIKE
 *       'blocked_%' or 'bypassed_%'       →  untouched (audit trail)
 *
 *   jobs (2026-07-26):
 *     • status 'succeeded', age ≥ 30 days →  deleted
 *     • status 'dead',      age ≥ 90 days →  deleted (longer ON PURPOSE —
 *                                             dead rows are failure evidence)
 *     • status 'pending' / 'running'      →  NEVER deleted, at any age
 *     • status 'failed' / 'cancelled'     →  never deleted (not in the policy)
 *
 *   Tables explicitly NOT touched:
 *     • eir_phase_transitions  (audit log)
 *     • admin_audit_logs        (compliance)
 *     • khat_map_season_decisions (wizard journal)
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { log } from "@/lib/log"
import type { JobStatus } from "@/lib/db/schema/jobs"

// ─── Constants ────────────────────────────────────────────────────────

export const AI_RUNS_STRIP_DAYS = 90
export const JVE_DELETE_DAYS = 30
/** Phase 1.6 — `ai_rate_limit_events` rows with decision='allowed' are
 *  deleted past this age. Blocked + bypassed rows survive forever. */
export const ARLE_ALLOWED_DELETE_DAYS = 30
export const DEFAULT_MAX_ROWS = 50_000

// ─── jobs retention policy ────────────────────────────────────────────
//
// This is the ONLY destructive rule in this module that can touch the work
// queue, so the safety is structural rather than by convention:
//
//   1. ALLOW-LIST, not deny-list. `JOB_RETENTION_DAYS` names the statuses that
//      may be deleted. A status that isn't a key is unreachable by the DELETE —
//      the default for anything new is "keep".
//   2. The protected statuses are removed from the policy's KEY TYPE, so
//      writing `pending: 30` in the map is a TypeScript error, not a review
//      catch. Try it: the object literal stops compiling.
//   3. Status and age are bound TOGETHER in the SQL. The DELETE joins each row
//      against the policy rows themselves (`USING (VALUES …)`), so a row can
//      only match via a (status, cutoff) PAIR that came out of this map. There
//      is no code path that deletes on age alone or on status alone.
//
// Growth, not history, is the problem being solved: at the time this was added
// the queue held 946 rows, the oldest 15 days old, so the first run deletes
// ZERO. `tests/jobs/retention.test.ts` pins that.

/** Live queue states. A row in one of these is work the system still owns —
 *  deleting it loses a job. Never prunable, at any age. */
export const JOB_PROTECTED_STATUSES = [
  "pending",
  "running",
] as const satisfies readonly JobStatus[]

type ProtectedJobStatus = (typeof JOB_PROTECTED_STATUSES)[number]

/** Every status the policy is even ALLOWED to mention. */
export type PrunableJobStatus = Exclude<JobStatus, ProtectedJobStatus>

/**
 * Terminal statuses that age out, and after how many days.
 *
 * Optional per key: a terminal status with no entry here (`failed`,
 * `cancelled`) is never deleted. The key type excludes the protected
 * statuses — adding one is a compile error.
 */
export const JOB_RETENTION_DAYS: { readonly [K in PrunableJobStatus]?: number } = {
  succeeded: 30,
  // Deliberately 3× the succeeded window: dead rows are the evidence trail for
  // outages, and they are rare enough that keeping them costs nothing.
  dead: 90,
}

/** The policy as (status, days) pairs — the single source both the count and
 *  the DELETE are built from. */
export function jobRetentionRules(): Array<{ status: PrunableJobStatus; days: number }> {
  return Object.entries(JOB_RETENTION_DAYS)
    .filter((e): e is [PrunableJobStatus, number] => typeof e[1] === "number")
    .map(([status, days]) => ({ status, days }))
}

/**
 * Classify one job row for the retention pass. Pure — no DB. This is the
 * policy in executable form; the SQL below must agree with it, and the tests
 * assert both directions.
 */
export function classifyJobForRetention(args: {
  now: Date
  status: JobStatus
  createdAt: Date
}): "protected-active" | "protected-status" | "recent" | "delete" {
  if ((JOB_PROTECTED_STATUSES as readonly string[]).includes(args.status)) {
    return "protected-active"
  }
  const days = JOB_RETENTION_DAYS[args.status as PrunableJobStatus]
  if (days === undefined) return "protected-status"
  const cutoff = args.now.getTime() - days * 24 * 60 * 60 * 1000
  return args.createdAt.getTime() < cutoff ? "delete" : "recent"
}

// ─── Types ────────────────────────────────────────────────────────────

export interface RetentionResult {
  dry_run: boolean
  cutoffs: {
    ai_runs_strip_before: string // ISO timestamp
    jve_delete_before: string
    arle_delete_before: string
  }
  ai_runs: {
    candidates: number
    protected_per_version: number
    would_strip: number
    stripped: number
    distinct_versions: number
    earliest_completed_at: string | null
  }
  ai_runs_summary: {
    new_monthly_rows: number
    updated_monthly_rows: number
    aggregated_run_count: number
  }
  jsonb_validation_events: {
    candidates: number
    skipped_enforce: number
    would_delete: number
    deleted: number
  }
  ai_rate_limit_events: {
    candidates: number
    skipped_audit: number
    would_delete: number
    deleted: number
  }
  jobs: {
    /** Rows matching the policy (status + age) — the deletable set. */
    candidates: number
    /** Rows in a live queue state (pending/running), whatever their age. */
    protected_active: number
    /** Terminal rows the policy doesn't name (failed/cancelled). */
    protected_status: number
    would_delete: number
    deleted: number
    /** Per-status breakdown of what would be / was deleted. */
    by_status: Record<string, number>
    /** Oldest row the policy COULD ever delete — the operator's margin check. */
    oldest_prunable_at: string | null
  }
  wall_ms: number
}

export interface RetentionInput {
  /** Default: true. Set false to actually mutate. */
  dryRun?: boolean
  /** Wall-clock anchor. Test seam. Default: new Date(). */
  now?: Date
  /** Max ai_runs rows to strip in one invocation. Default 50_000. */
  maxRows?: number
}

// ─── Pure helpers ─────────────────────────────────────────────────────

export function computeCutoffs(now: Date) {
  const aiRunsCutoff = new Date(now.getTime() - AI_RUNS_STRIP_DAYS * 24 * 60 * 60 * 1000)
  const jveCutoff = new Date(now.getTime() - JVE_DELETE_DAYS * 24 * 60 * 60 * 1000)
  const arleCutoff = new Date(
    now.getTime() - ARLE_ALLOWED_DELETE_DAYS * 24 * 60 * 60 * 1000,
  )
  return { aiRunsCutoff, jveCutoff, arleCutoff }
}

/**
 * Classify a single ai_runs row for the retention pass.
 * Pure — no DB. Used by tests to pin policy edges.
 */
export function classifyAiRunForRetention(args: {
  now: Date
  completedAt: Date | null
  strippedAt: Date | null
}): "recent" | "no-op-already-stripped" | "no-op-uncompleted" | "strip" {
  if (args.completedAt === null) return "no-op-uncompleted"
  if (args.strippedAt !== null) return "no-op-already-stripped"
  const cutoffs = computeCutoffs(args.now)
  if (args.completedAt.getTime() >= cutoffs.aiRunsCutoff.getTime()) return "recent"
  return "strip"
}

/**
 * `(task_kind, COALESCE(prompt_version, '')` → composite key for the
 * earliest-per-version protection rule.
 */
export function versionKey(taskKind: string, promptVersion: string | null): string {
  return `${taskKind}\x00${promptVersion ?? ""}`
}

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Run the retention pass. Returns a structured report. Mutates the DB
 * only when `dryRun === false`. Wraps the wet path in a single
 * transaction and a pg_advisory_lock.
 *
 * Lock key chosen by hashtext('khat-retention'); released on disconnect.
 */
export async function runRetentionJob(input: RetentionInput = {}): Promise<RetentionResult> {
  if (!db) throw new Error("DB not available")

  const wallStart = Date.now()
  const dryRun = input.dryRun ?? true
  const now = input.now ?? new Date()
  const maxRows = input.maxRows ?? DEFAULT_MAX_ROWS
  const { aiRunsCutoff, jveCutoff, arleCutoff } = computeCutoffs(now)

  const result: RetentionResult = {
    dry_run: dryRun,
    cutoffs: {
      ai_runs_strip_before: aiRunsCutoff.toISOString(),
      jve_delete_before: jveCutoff.toISOString(),
      arle_delete_before: arleCutoff.toISOString(),
    },
    ai_runs: {
      candidates: 0,
      protected_per_version: 0,
      would_strip: 0,
      stripped: 0,
      distinct_versions: 0,
      earliest_completed_at: null,
    },
    ai_runs_summary: {
      new_monthly_rows: 0,
      updated_monthly_rows: 0,
      aggregated_run_count: 0,
    },
    jsonb_validation_events: {
      candidates: 0,
      skipped_enforce: 0,
      would_delete: 0,
      deleted: 0,
    },
    ai_rate_limit_events: {
      candidates: 0,
      skipped_audit: 0,
      would_delete: 0,
      deleted: 0,
    },
    jobs: {
      candidates: 0,
      protected_active: 0,
      protected_status: 0,
      would_delete: 0,
      deleted: 0,
      by_status: {},
      oldest_prunable_at: null,
    },
    wall_ms: 0,
  }

  // ─── COUNT PHASE (runs in both dry-run and wet) ────────────────────

  const aiCandidatesRes = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS candidates,
      COUNT(DISTINCT (task_kind, COALESCE(prompt_version, '')))::int AS distinct_versions,
      MIN(completed_at) AS earliest
    FROM ai_runs
    WHERE stripped_at IS NULL
      AND completed_at IS NOT NULL
      AND completed_at < ${aiRunsCutoff.toISOString()}
  `)) as unknown as {
    rows: Array<{ candidates: number; distinct_versions: number; earliest: Date | null }>
  }
  const aiCount = aiCandidatesRes.rows[0] ?? {
    candidates: 0,
    distinct_versions: 0,
    earliest: null,
  }
  result.ai_runs.candidates = aiCount.candidates
  result.ai_runs.distinct_versions = aiCount.distinct_versions
  result.ai_runs.earliest_completed_at = aiCount.earliest
    ? new Date(aiCount.earliest).toISOString()
    : null

  // Protected set: the EARLIEST candidate (by completed_at) per
  // (task_kind, prompt_version) is never stripped. That count equals the
  // number of distinct (task_kind, prompt_version) combos in the candidate
  // set, i.e. `distinct_versions` — no extra query needed.
  result.ai_runs.protected_per_version = aiCount.distinct_versions
  result.ai_runs.would_strip = Math.max(
    0,
    aiCount.candidates - aiCount.distinct_versions,
  )

  const jveCountsRes = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE mode IN ('report','scanner'))::int AS deletable,
      COUNT(*) FILTER (WHERE mode = 'enforce')::int AS skipped_enforce
    FROM jsonb_validation_events
    WHERE created_at < ${jveCutoff.toISOString()}
  `)) as unknown as {
    rows: Array<{ deletable: number; skipped_enforce: number }>
  }
  const jveCount = jveCountsRes.rows[0] ?? { deletable: 0, skipped_enforce: 0 }
  result.jsonb_validation_events.candidates =
    jveCount.deletable + jveCount.skipped_enforce
  result.jsonb_validation_events.skipped_enforce = jveCount.skipped_enforce
  result.jsonb_validation_events.would_delete = jveCount.deletable

  // Phase 1.6 patch — `ai_rate_limit_events` retention.
  // Only `decision='allowed'` rows past the 30-day cutoff are deletable;
  // every `blocked_*` and `bypassed_*` row stays forever (audit trail).
  const arleCountsRes = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE decision = 'allowed')::int                  AS deletable,
      COUNT(*) FILTER (WHERE decision <> 'allowed')::int                 AS skipped_audit
    FROM ai_rate_limit_events
    WHERE created_at < ${arleCutoff.toISOString()}
  `)) as unknown as {
    rows: Array<{ deletable: number; skipped_audit: number }>
  }
  const arleCount = arleCountsRes.rows[0] ?? { deletable: 0, skipped_audit: 0 }
  result.ai_rate_limit_events.candidates =
    arleCount.deletable + arleCount.skipped_audit
  result.ai_rate_limit_events.skipped_audit = arleCount.skipped_audit
  result.ai_rate_limit_events.would_delete = arleCount.deletable

  // ─── jobs: unbounded-growth prune ──────────────────────────────────
  //
  // `jobPolicyValues` is the ONLY place a (status, cutoff) pair is produced,
  // and both the count below and the DELETE in the wet phase join against it.
  // A row is therefore unreachable unless its status is a policy key AND it is
  // older than that key's own cutoff — the two conditions can't drift apart
  // because they arrive on the same joined row.
  const jobRules = jobRetentionRules()
  if (jobRules.length > 0) {
    const jobPolicyValues = sql`(VALUES ${sql.join(
      jobRules.map(
        (r) =>
          sql`(${r.status}::text, ${new Date(
            now.getTime() - r.days * 24 * 60 * 60 * 1000,
          ).toISOString()}::timestamptz)`,
      ),
      sql`, `,
    )}) AS policy(status, cutoff)`

    const protectedArr = sql`ARRAY[${sql.join(
      JOB_PROTECTED_STATUSES.map((s) => sql`${s}`),
      sql`, `,
    )}]::text[]`
    const prunableArr = sql`ARRAY[${sql.join(
      jobRules.map((r) => sql`${r.status}`),
      sql`, `,
    )}]::text[]`

    const jobCandidatesRes = (await db.execute(sql`
      SELECT j.status, COUNT(*)::int AS n
      FROM jobs j
      JOIN ${jobPolicyValues}
        ON j.status = policy.status
       AND j.created_at < policy.cutoff
      GROUP BY j.status
    `)) as unknown as { rows: Array<{ status: string; n: number }> }
    for (const row of jobCandidatesRes.rows) {
      result.jobs.by_status[row.status] = row.n
      result.jobs.candidates += row.n
    }
    result.jobs.would_delete = result.jobs.candidates

    const jobProtectedRes = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = ANY(${protectedArr}))::int          AS protected_active,
        COUNT(*) FILTER (WHERE status <> ALL(${protectedArr})
                           AND status <> ALL(${prunableArr}))::int          AS protected_status,
        MIN(created_at) FILTER (WHERE status = ANY(${prunableArr}))         AS oldest_prunable
      FROM jobs
    `)) as unknown as {
      rows: Array<{
        protected_active: number
        protected_status: number
        oldest_prunable: Date | null
      }>
    }
    const jp = jobProtectedRes.rows[0]
    if (jp) {
      result.jobs.protected_active = jp.protected_active
      result.jobs.protected_status = jp.protected_status
      result.jobs.oldest_prunable_at = jp.oldest_prunable
        ? new Date(jp.oldest_prunable).toISOString()
        : null
    }
  }

  if (dryRun) {
    log.info(
      `[retention] dry-run: jobs would delete ${result.jobs.would_delete} row(s) ` +
        `(${formatByStatus(result.jobs.by_status)}); ` +
        `${result.jobs.protected_active} active row(s) protected`,
    )
    result.wall_ms = Date.now() - wallStart
    return result
  }

  // ─── WET PHASE (single transaction + advisory lock) ────────────────

  await db.transaction(async (tx) => {
    // Advisory lock prevents concurrent retention runs. Released on
    // transaction commit/rollback.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('khat-retention'))`)

    // 1. Roll-up: insert/update ai_runs_summary from the candidates
    //    that are NOT protected (i.e., not the earliest of their version).
    //
    //    The "protected" filter uses ROW_NUMBER() OVER (PARTITION BY ...)
    //    so the earliest per version sits at rn=1 and is excluded.
    const rollupRes = (await tx.execute(sql`
      WITH ranked AS (
        SELECT
          id,
          completed_at,
          to_char(completed_at, 'YYYY-MM')          AS year_month,
          task_kind,
          provider,
          model_name,
          prompt_version,
          status,
          tokens_in,
          tokens_out,
          cost_usd,
          latency_ms,
          error_class,
          ROW_NUMBER() OVER (
            PARTITION BY task_kind, COALESCE(prompt_version, '')
            ORDER BY completed_at ASC, id ASC
          ) AS rn
        FROM ai_runs
        WHERE stripped_at IS NULL
          AND completed_at IS NOT NULL
          AND completed_at < ${aiRunsCutoff.toISOString()}
      ),
      sliced AS (
        SELECT *
        FROM ranked
        WHERE rn > 1                            -- protect rn=1
        LIMIT ${maxRows}
      ),
      agg AS (
        SELECT
          year_month,
          task_kind,
          provider,
          model_name,
          prompt_version,
          COUNT(*)::int                                            AS total_runs,
          COUNT(*) FILTER (WHERE status = 'succeeded')::int        AS succeeded,
          COUNT(*) FILTER (WHERE status = 'failed')::int           AS failed,
          COUNT(*) FILTER (WHERE status = 'timed_out')::int        AS timed_out,
          COALESCE(SUM(tokens_in), 0)::bigint                      AS total_tokens_in,
          COALESCE(SUM(tokens_out), 0)::bigint                     AS total_tokens_out,
          COALESCE(SUM(cost_usd), 0)::numeric(12,4)                AS total_cost_usd,
          -- mean latency as integer ms; null when no latencies recorded
          CAST(AVG(latency_ms) AS integer)                         AS mean_latency_ms,
          COALESCE(
            jsonb_object_agg(error_class, cnt)
              FILTER (WHERE error_class IS NOT NULL),
            '{}'::jsonb
          )                                                        AS error_class_counts
        FROM (
          SELECT *, COUNT(*) OVER (
            PARTITION BY year_month, task_kind, provider, model_name,
                         COALESCE(prompt_version,''), error_class
          ) AS cnt
          FROM sliced
        ) s
        GROUP BY year_month, task_kind, provider, model_name, prompt_version
      ),
      upserted AS (
        INSERT INTO ai_runs_summary (
          year_month, task_kind, provider, model_name, prompt_version,
          total_runs, succeeded, failed, timed_out,
          total_tokens_in, total_tokens_out, total_cost_usd,
          mean_latency_ms, error_class_counts, computed_at, id
        )
        SELECT
          a.year_month, a.task_kind, a.provider, a.model_name, a.prompt_version,
          a.total_runs, a.succeeded, a.failed, a.timed_out,
          a.total_tokens_in, a.total_tokens_out, a.total_cost_usd,
          a.mean_latency_ms, a.error_class_counts, NOW(),
          gen_random_uuid()::text
        FROM agg a
        ON CONFLICT (
          year_month, task_kind, provider, model_name,
          COALESCE(prompt_version, '')
        )
        DO UPDATE SET
          total_runs       = ai_runs_summary.total_runs + EXCLUDED.total_runs,
          succeeded        = ai_runs_summary.succeeded  + EXCLUDED.succeeded,
          failed           = ai_runs_summary.failed     + EXCLUDED.failed,
          timed_out        = ai_runs_summary.timed_out  + EXCLUDED.timed_out,
          total_tokens_in  = ai_runs_summary.total_tokens_in  + EXCLUDED.total_tokens_in,
          total_tokens_out = ai_runs_summary.total_tokens_out + EXCLUDED.total_tokens_out,
          total_cost_usd   = ai_runs_summary.total_cost_usd   + EXCLUDED.total_cost_usd,
          mean_latency_ms  = CASE
              WHEN ai_runs_summary.mean_latency_ms IS NULL THEN EXCLUDED.mean_latency_ms
              WHEN EXCLUDED.mean_latency_ms IS NULL        THEN ai_runs_summary.mean_latency_ms
              ELSE (
                (ai_runs_summary.mean_latency_ms * ai_runs_summary.total_runs
                   + EXCLUDED.mean_latency_ms * EXCLUDED.total_runs)
                / (ai_runs_summary.total_runs + EXCLUDED.total_runs)
              )
            END,
          -- merge per-error counts: keys present in both sides sum;
          -- keys present in only one side carry through.
          error_class_counts = (
            SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
            FROM (
              SELECT k,
                     (COALESCE((ai_runs_summary.error_class_counts ->> k)::int, 0)
                      + COALESCE((EXCLUDED.error_class_counts ->> k)::int, 0)) AS v
              FROM (
                SELECT jsonb_object_keys(ai_runs_summary.error_class_counts) AS k
                UNION
                SELECT jsonb_object_keys(EXCLUDED.error_class_counts) AS k
              ) keys
            ) merged
          ),
          computed_at      = NOW()
        RETURNING (xmax = 0) AS inserted
      )
      SELECT
        COUNT(*) FILTER (WHERE inserted)::int AS new_rows,
        COUNT(*) FILTER (WHERE NOT inserted)::int AS updated_rows,
        (SELECT COUNT(*)::int FROM sliced) AS aggregated_runs
      FROM upserted
    `)) as unknown as {
      rows: Array<{ new_rows: number; updated_rows: number; aggregated_runs: number }>
    }
    const rollupRow = rollupRes.rows[0] ?? {
      new_rows: 0,
      updated_rows: 0,
      aggregated_runs: 0,
    }
    result.ai_runs_summary.new_monthly_rows = rollupRow.new_rows
    result.ai_runs_summary.updated_monthly_rows = rollupRow.updated_rows
    result.ai_runs_summary.aggregated_run_count = rollupRow.aggregated_runs

    // 2. Strip: null out snapshots on the same protected-excluded set
    //    and stamp stripped_at = NOW(). Same row predicate as the roll-up
    //    so we strip exactly what we summarised.
    const stripRes = (await tx.execute(sql`
      WITH candidates AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY task_kind, COALESCE(prompt_version, '')
          ORDER BY completed_at ASC, id ASC
        ) AS rn
        FROM ai_runs
        WHERE stripped_at IS NULL
          AND completed_at IS NOT NULL
          AND completed_at < ${aiRunsCutoff.toISOString()}
      ),
      to_strip AS (
        SELECT id FROM candidates WHERE rn > 1 LIMIT ${maxRows}
      )
      UPDATE ai_runs
      SET
        input_snapshot  = NULL,
        output_snapshot = NULL,
        prompt_hash     = NULL,
        error_message   = NULL,
        stripped_at     = NOW()
      WHERE id IN (SELECT id FROM to_strip)
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> }
    result.ai_runs.stripped = stripRes.rows.length

    // 3. JVE delete: only report/scanner rows older than cutoff. Enforce
    //    mode rows are kept forever.
    const jveDelRes = (await tx.execute(sql`
      DELETE FROM jsonb_validation_events
      WHERE created_at < ${jveCutoff.toISOString()}
        AND mode IN ('report', 'scanner')
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> }
    result.jsonb_validation_events.deleted = jveDelRes.rows.length

    // 4. Phase 1.6 patch — `ai_rate_limit_events` delete:
    //    `decision='allowed'` rows past the cutoff. Every `blocked_*`
    //    and `bypassed_*` row stays as a permanent audit record.
    const arleDelRes = (await tx.execute(sql`
      DELETE FROM ai_rate_limit_events
      WHERE created_at < ${arleCutoff.toISOString()}
        AND decision = 'allowed'
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string }> }
    result.ai_rate_limit_events.deleted = arleDelRes.rows.length

    // 5. jobs prune — bound the queue table's growth.
    //
    //    The join to the policy VALUES list is the guard: a row is deleted
    //    only when it matches a (status, cutoff) PAIR emitted by
    //    `jobRetentionRules()`. `pending` and `running` are not keys of
    //    JOB_RETENTION_DAYS — and cannot be added, the key type excludes
    //    them — so no cutoff exists for them and the join can never produce
    //    a live row. Age alone deletes nothing; status alone deletes nothing.
    if (jobRules.length > 0) {
      const jobPolicyValues = sql`(VALUES ${sql.join(
        jobRules.map(
          (r) =>
            sql`(${r.status}::text, ${new Date(
              now.getTime() - r.days * 24 * 60 * 60 * 1000,
            ).toISOString()}::timestamptz)`,
        ),
        sql`, `,
      )}) AS policy(status, cutoff)`

      const jobDelRes = (await tx.execute(sql`
        DELETE FROM jobs AS j
        USING ${jobPolicyValues}
        WHERE j.status = policy.status
          AND j.created_at < policy.cutoff
        RETURNING j.status
      `)) as unknown as { rows: Array<{ status: string }> }
      result.jobs.deleted = jobDelRes.rows.length
      // Recompute the breakdown from what was ACTUALLY removed, not from the
      // earlier count — rows can complete between the count and the delete.
      result.jobs.by_status = {}
      for (const row of jobDelRes.rows) {
        result.jobs.by_status[row.status] =
          (result.jobs.by_status[row.status] ?? 0) + 1
      }
    }
  })

  // Never silent: every wet run states what it removed from the queue, even
  // when that is zero.
  log.info(
    `[retention] jobs pruned ${result.jobs.deleted} row(s) ` +
      `(${formatByStatus(result.jobs.by_status)}); ` +
      `${result.jobs.protected_active} active row(s) protected`,
  )

  result.wall_ms = Date.now() - wallStart
  return result
}

/** "succeeded=12, dead=3" — or "none" for an empty breakdown. */
function formatByStatus(byStatus: Record<string, number>): string {
  const parts = Object.entries(byStatus).map(([k, v]) => `${k}=${v}`)
  return parts.length > 0 ? parts.join(", ") : "none"
}
