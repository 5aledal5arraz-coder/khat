/**
 * Phase 2.5 (P2.5.a) — Operational dashboard data layer.
 *
 * Pure async data layer for the future `/admin/ops` page. Returns one
 * typed shape per section. No React, no JSX, no I/O beyond DB reads.
 * No mutations anywhere.
 *
 * Design:
 *   • `takeOpsSnapshot()` fans out 5 section fetchers via Promise.allSettled
 *     so one slow / failing section never blanks the whole page.
 *   • Each section wrapped in a `SectionResult<T>` discriminated union —
 *     the UI must check `ok` before reading `data`.
 *   • All time windows hard-coded to 24h in v1 (operator §11 Q4).
 *   • All hard ceilings inherited from lib/system-events/queries.ts.
 *   • Dates returned as `Date` (not ISO strings). Server-component-direct
 *     render handles serialization.
 *
 * v1 sections:
 *   1. Queue & Worker Health     — direct SQL on `jobs`
 *   2. System Events Overview    — lib/system-events/queries.ts
 *   3. AI Router & Rate-limit    — `ai_runs` + readMode/readLimits + queries
 *   4. EIR Pipeline              — lib/eir/service.ts + audit table + queries
 *   5. Recent Activity Feed      — lib/system-events/queries.ts listEvents
 *
 * Out of scope (P2.5.b or later):
 *   • Formatting / display helpers — UI concern.
 *   • Per-subject drill-down queries — future P2.5.c.
 *   • Time-window selector — fixed 24h in v1.
 */

import { createHash } from "crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  EPISODE_PHASES,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import { JOB_STATUSES, type JobStatus } from "@/lib/db/schema/jobs"
import { AI_RUN_STATUSES, type AiRunStatus } from "@/lib/db/schema/ai-runs"
import type {
  RateLimitMode,
  RateLimitTier,
} from "@/lib/db/schema/ai-rate-limit-events"
import type {
  SystemEventSource,
  SystemEventSeverity,
} from "@/lib/db/schema/system-events"
import {
  type SystemEventRow,
  listEvents,
  countBySourceSeverity,
  topErrors,
} from "@/lib/system-events/queries"
import { TASK_TIER } from "@/lib/ai-router/rate-limit"
import { getEffectiveLimits, getEffectiveMode } from "@/lib/ai-router/runtime-config"
import {
  PROVIDER_BLOCKED_ERROR_CLASSES,
  UNCLASSIFIED_ERROR_CLASS,
} from "@/lib/ai-router/errors"
import { getAiModelsDiagnostics } from "@/lib/ai-router/model-selection"
import { findEolRisks, type EolRisk } from "@/lib/ai-router/model-lifecycle"
import { GEMINI_REASONING_MODEL, GEMINI_RETRIEVAL_MODEL } from "@/lib/ai/gemini"
import { countByPhase } from "@/lib/eir/service"
import {
  getGuestIdentitySnapshot,
  type GuestIdentitySnapshot,
} from "@/lib/guest-identity/integrity"
import { probeWorkerHeartbeat, type WorkerHeartbeat } from "@/lib/ops/diagnostics"

// ─── Public types ────────────────────────────────────────────────────

/**
 * Caller-facing discriminated union. The UI MUST check `ok` before
 * accessing `data`; on failure the section renders an unavailable state
 * with the generic message + `errorRef` (and nothing else from this
 * section).
 *
 * `error` is a FIXED Arabic sentence — never the underlying failure.
 * The raw reason is infrastructure detail (DB hostnames, column names,
 * server file paths) and this object is plain data rendered into the
 * page, so Next.js never sanitizes it the way it sanitizes a thrown
 * server error. `errorRef` is the only link to the real cause, which is
 * logged server-side under the same ref.
 */
export type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorRef: string }

/**
 * The payload each section resolves to. This map is the single source of
 * truth for "which sections exist" — `OpsSection`, the fetcher table, and
 * every snapshot type below are derived from it, so a new section cannot
 * be added in one place and forgotten in another.
 */
interface OpsSectionData {
  queue: QueueHealth
  systemEvents: SystemEventsOverview
  aiRouter: AiRouterSnapshot
  eirPipeline: EirPipelineSnapshot
  recentActivity: RecentActivity
  /** P2.4.e.1 — guest-identity integrity counters. Rendered as a
   *  compact section by the dashboard (P2.4.e.2). */
  guestIdentity: GuestIdentitySnapshot
  /**
   * Proof-of-life for the job worker. Every other section only proves that
   * a QUERY returned — a dead worker enqueues nothing, so the queue looks
   * empty and calm. This is the one signal that says the system is alive,
   * not merely reachable. Reused from `lib/ops/diagnostics.ts` so the home
   * band and the Settings hub can never disagree about "is the worker up".
   */
  worker: WorkerHeartbeat
  /**
   * AI model configuration health — catalog freshness, silent fallbacks,
   * and end-of-life exposure. Every other AI signal answers "did the calls
   * work"; this one answers "which model actually produced the output, and
   * is it about to be switched off".
   */
  aiModels: AiModelHealth
}

export type OpsSection = keyof OpsSectionData

/** Every section, in fan-out order. Also the default for `takeOpsSnapshot`. */
export const OPS_SECTIONS = [
  "queue",
  "systemEvents",
  "aiRouter",
  "eirPipeline",
  "recentActivity",
  "guestIdentity",
  "worker",
  "aiModels",
] as const satisfies readonly OpsSection[]

/**
 * The sections `/admin/ops` renders — and therefore the only ones it pays
 * for. Excluded deliberately:
 *   • `systemEvents` + `recentActivity` — rendered only on the details page.
 *   • `guestIdentity` — rendered NOWHERE. Its nine counters have no consumer
 *     in `app/`; the only thing that ever read the section was the
 *     `allSectionsOk` roll-up, i.e. six Postgres queries per page load to
 *     compute one boolean. Kept as a section (a planned P2.4.e.2 panel is
 *     referenced in `lib/guest-identity/integrity.ts`) rather than deleted,
 *     so re-enabling it is one entry in this list.
 */
export const OPS_HOME_SECTIONS = [
  "queue",
  "aiRouter",
  "eirPipeline",
  "worker",
  "aiModels",
] as const satisfies readonly OpsSection[]

/**
 * The five sections `/admin/ops/details` renders. `worker` and `aiModels`
 * feed the home's health band only, and `guestIdentity` renders nowhere —
 * see `OPS_HOME_SECTIONS`.
 */
export const OPS_DETAILS_SECTIONS = [
  "queue",
  "systemEvents",
  "aiRouter",
  "eirPipeline",
  "recentActivity",
] as const satisfies readonly OpsSection[]

interface OpsSnapshotMeta {
  /** Wall-clock at the start of takeOpsSnapshot(). */
  taken_at: Date
  /** Total ms inside Promise.allSettled. Smoke perf gate reads this. */
  duration_ms: number
}

/**
 * A snapshot of exactly the sections `S` that were REQUESTED.
 *
 * The sections that were not requested are typed `?: undefined` rather
 * than omitted, which is the whole point of this shape: reading
 * `snap.systemEvents.ok` on a snapshot that never fetched system events
 * is a compile error, not a runtime crash — and, more importantly, a
 * not-fetched section is statically distinguishable from a fetched one
 * that failed. Those two must never collapse into the same value, or
 * "we didn't ask" starts rendering as "it's broken" (or worse, as "it's
 * fine").
 */
export type OpsSnapshotFor<S extends OpsSection> = OpsSnapshotMeta & {
  [K in S]: SectionResult<OpsSectionData[K]>
} & { [K in Exclude<OpsSection, S>]?: undefined }

/** The full 8-section snapshot — what `takeOpsSnapshot()` returns by default. */
export type OpsSnapshot = OpsSnapshotFor<OpsSection>

/**
 * Any snapshot, whatever subset it carries. Derivation helpers
 * (`lib/ops/home-metrics.ts`) accept THIS, not `OpsSnapshot`: they must
 * work on a page that deliberately fetched five sections instead of eight.
 */
export type OpsSnapshotPartial = OpsSnapshotMeta & {
  [K in OpsSection]?: SectionResult<OpsSectionData[K]>
}

// ─── Section 1: Queue & Worker Health ────────────────────────────────

export interface QueueHealth {
  /** Always all 6 JobStatus keys present, zero-filled. */
  countsByStatus: Record<JobStatus, number>
  oldestPending: {
    id: string
    type: string
    run_after: Date
    age_ms: number
  } | null
  oldestRunning: {
    id: string
    type: string
    started_at: Date | null
    locked_by: string | null
    locked_at: Date | null
    age_ms: number | null
  } | null
  staleLeaseCount: number
  /** Last 5 dead jobs whose completed_at (or updated_at) is in the 24h window. */
  recentDead: Array<{
    id: string
    type: string
    attempts: number
    max_attempts: number
    completed_at: Date | null
    error_message: string | null
  }>
  /**
   * TRUE count of dead jobs in the same 24h window as `recentDead`.
   * `recentDead` is capped at 5 rows for display; callers that need a
   * COUNT must read THIS field — `recentDead.length` silently saturates
   * at 5 and under-reports a pile-up as "5".
   */
  deadCount24h: number
  /** pending AND run_after <= NOW() — work that is actually due now. */
  duePendingCount: number
  /**
   * pending AND run_after > NOW() — deliberately scheduled for later.
   * Not a backlog; separated so "active jobs" doesn't inflate with
   * future-dated retries/schedules.
   */
  scheduledPendingCount: number
}

// ─── Section 2: System Events Overview ───────────────────────────────

export interface SystemEventsOverview {
  /** Hard-coded 24h in v1. Reified so UI can label it without recomputing. */
  window_since_ms: number
  /** Sparse: only (source, severity) pairs with non-zero counts. */
  matrix: Array<{
    source: SystemEventSource
    severity: SystemEventSeverity
    count: number
  }>
  grand_total: number
  /** Last 5 non-info events. */
  topErrors: SystemEventRow[]
}

// ─── Section 3: AI Router & Rate-limit ───────────────────────────────

export interface TierSnapshot {
  current_concurrency: number
  concurrency_limit: number
  daily_cost_usd: number
  daily_cost_limit_usd: number
}

export interface AiRouterSnapshot {
  rate_limit_mode: RateLimitMode
  tiers: Record<RateLimitTier, TierSnapshot>
  /** All 5 AiRunStatus keys present, zero-filled. */
  ai_runs_status_counts_24h: Record<AiRunStatus, number>
  /**
   * Today's TOTAL AI spend across every `ai_runs` row — **no task_kind
   * filter**. `tiers[*].daily_cost_usd` only covers the 6 registry-routed
   * kinds in `TASK_TIER`; the 5 telemetry-only kinds (transcription,
   * embedding, research_retrieval, research_reasoning, guest_identify)
   * write to the same table and are real money. This is the honest number.
   */
  daily_cost_usd_total: number
  /**
   * Today's runs with `cost_usd IS NULL` (failed / timed_out runs never
   * get a price stamped). They enter every SUM as zero, so any cost
   * total is a LOWER BOUND whenever this is > 0.
   */
  unpriced_runs_today: number
  /**
   * The DB server's TimeZone — the timezone `date_trunc('day', NOW())`
   * resolves against. Deliberately NOT pinned to Asia/Kuwait: this must
   * stay the exact same day boundary the rate limiter uses
   * (`rate-limit.ts` daily-cost check), otherwise "% of cap" would
   * measure a different window than the one actually enforced. We
   * surface the zone instead of silently changing it.
   *
   * `null` when the server didn't report one. We do NOT default to "UTC":
   * printing a guessed zone next to a money figure states as fact something
   * we never read.
   */
  day_boundary_tz: string | null
  /** Last 10 rate-limit.rejected events. */
  recentRateLimitRejects: SystemEventRow[]
  /** Last 5 ai-router.rejected events. */
  recentAiRouterRejects: SystemEventRow[]
  /**
   * Account-level provider failures in the last 60 MINUTES (not 24h):
   * `quota_exceeded` / `auth_failed`. These mean every AI feature is down
   * until a human fixes billing or the key, so the window is deliberately
   * tight — a 24h window would keep shouting about an outage that was
   * already resolved this morning.
   */
  provider_blocked_60m: {
    count: number
    /** The distinct error classes seen, for naming the cause exactly. */
    classes: string[]
    lastAt: Date | null
  }
  /**
   * 24h failures whose `error_class` is `unclassified` — the router met an
   * error it could not name. Surfaced on its own because every alert that
   * branches on `error_class` is BLIND to these by construction: an
   * unclassifiable failure must be visible as a gap, not silently absent
   * from the classified counts.
   */
  unclassified_failures_24h: number
}

// ─── Section 7: AI model configuration health ────────────────────────

export interface AiModelHealth {
  catalog: {
    /** Snapshot is past its 6h TTL at read time. */
    stale: boolean
    /** Why the last refresh failed; null when it succeeded. */
    lastError: string | null
    refreshedAt: string | null
    /** False = never loaded once, so availability checks always fail open. */
    everLoaded: boolean
  }
  /** Task kinds resolved to a model other than the configured one. */
  fallbacks: Array<{
    taskKind: string
    requestedModel: string
    effectiveModel: string
  }>
  /** Retirements within EOL_WARN_DAYS for models we actually depend on. */
  eolRisks: EolRisk[]
}

// ─── Section 4: EIR Pipeline ─────────────────────────────────────────

export interface EirPipelineSnapshot {
  /** Always all 15 EpisodePhase keys present, zero-filled. */
  countByPhase: Record<EpisodePhase, number>
  /** Last 10 source='eir' event_type='transition' events. */
  recentTransitions: SystemEventRow[]
  invalid_attempts_24h: number
  most_recent_invalid_attempt_at: Date | null
}

// ─── Section 5: Recent Activity ──────────────────────────────────────

export interface RecentActivity {
  /** Last 20 events across all sources, most recent first. */
  events: SystemEventRow[]
}

// ─── Internal helpers ────────────────────────────────────────────────

const WINDOW_24H_MS = 24 * 60 * 60 * 1000

/** The ONLY failure text that reaches the browser. Never interpolated. */
export const SECTION_ERROR_MESSAGE_AR = "تعذّر جلب بيانات هذا القسم"

/**
 * Map a settled promise into the discriminated SectionResult.
 *
 * On rejection the raw reason is NOT returned: it is logged server-side
 * and replaced with `SECTION_ERROR_MESSAGE_AR` + a short, stable
 * `errorRef` (first 8 hex chars of sha256 over the raw message). Same
 * failure ⇒ same ref, so an operator reading the screen can grep the
 * worker/server log for the real message.
 *
 * The only side effect is the `console.error`; the returned value is a
 * pure function of the input, which is what the unit tests assert.
 */
export function settledToSection<T>(
  settled: PromiseSettledResult<T>,
): SectionResult<T> {
  if (settled.status === "fulfilled") return { ok: true, data: settled.value }
  const reason = settled.reason
  const raw =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "unknown error"
  const errorRef = createHash("sha256").update(raw).digest("hex").slice(0, 8)
  console.error(`[ops-snapshot] section failed (ref=${errorRef}): ${raw}`)
  return { ok: false, error: SECTION_ERROR_MESSAGE_AR, errorRef }
}

/**
 * Initialize a Record<K, 0> with every key from a const tuple. Used to
 * pad sparse aggregate query results so the UI never sees missing keys.
 */
function zeroFilled<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>
  for (const k of keys) out[k] = 0
  return out
}

// ─── Section fetchers (each throws on failure; allSettled converts) ──

/**
 * ONE round-trip. This used to be SIX sequential `db.execute` calls, each
 * awaiting the one before it — six serial network latencies to render a
 * single card. On the managed DB that is the dominant cost of the section;
 * the queries themselves are trivial.
 *
 * Shape: the counters are `FILTER` aggregates over a single scan of `jobs`.
 * The three ROW-shaped reads stay exact by hanging off `LEFT JOIN LATERAL`
 * instead of being folded into that aggregate — `oldestPending.type`,
 * `oldestRunning.type` and `oldestRunning.locked_by` are all rendered on
 * /admin/ops/details, so rolling them up into a `min(run_after)` would have
 * silently dropped columns the UI displays.
 *
 * Every predicate below is character-identical to the query it replaced,
 * including the two that must agree with each other: `dead_24h` and the
 * `recentDead` lateral share one dead-window definition.
 */
async function fetchQueueHealth(): Promise<QueueHealth> {
  if (!db) throw new Error("DB not configured")
  const now = Date.now()

  // Built from JOB_STATUSES so the per-status columns cannot drift from the
  // tuple the zero-fill below pads against. Values are bound parameters;
  // only the derived column alias is an identifier.
  const statusCounts = sql.join(
    JOB_STATUSES.map(
      (s) =>
        sql`COUNT(*) FILTER (WHERE status = ${s})::int AS ${sql.identifier(`n_${s}`)}`,
    ),
    sql`, `,
  )

  const res = (await db.execute(sql`
    WITH agg AS (
      SELECT
        ${statusCounts},
        COUNT(*) FILTER (
          WHERE status = 'running'
            AND locked_at IS NOT NULL
            AND locked_at < NOW() - interval '5 minutes'
        )::int AS stale_lease,
        COUNT(*) FILTER (
          WHERE status = 'dead'
            AND COALESCE(completed_at, updated_at) > NOW() - interval '24 hours'
        )::int AS dead_24h,
        COUNT(*) FILTER (WHERE status = 'pending' AND run_after <= NOW())::int AS due_pending,
        COUNT(*) FILTER (WHERE status = 'pending' AND run_after > NOW())::int AS scheduled_pending
      FROM jobs
    )
    SELECT
      agg.*,
      op.id AS op_id, op.type AS op_type, op.run_after AS op_run_after,
      orn.id AS or_id, orn.type AS or_type, orn.started_at AS or_started_at,
      orn.locked_by AS or_locked_by, orn.locked_at AS or_locked_at,
      dead.rows AS dead_rows
    FROM agg
    -- Oldest pending.
    LEFT JOIN LATERAL (
      SELECT id, type, run_after
        FROM jobs
       WHERE status = 'pending'
       ORDER BY run_after ASC
       LIMIT 1
    ) op ON TRUE
    -- Oldest running (NULLS LAST so a row with null started_at doesn't
    -- eclipse a real claim).
    LEFT JOIN LATERAL (
      SELECT id, type, started_at, locked_by, locked_at
        FROM jobs
       WHERE status = 'running'
       ORDER BY started_at ASC NULLS LAST
       LIMIT 1
    ) orn ON TRUE
    -- Recent dead (last 5 in 24h). Returned as JSON so a LIST can ride
    -- along in the same single-row result. Every timestamp column on
    -- \`jobs\` is timestamptz, so the JSON rendering carries an explicit
    -- offset and \`new Date()\` cannot reinterpret it in another zone.
    LEFT JOIN LATERAL (
      SELECT COALESCE(
               json_agg(to_jsonb(d) - 'sort_key' ORDER BY d.sort_key DESC),
               '[]'::json
             ) AS rows
        FROM (
          SELECT id, type, attempts, max_attempts, completed_at, error_message,
                 COALESCE(completed_at, updated_at) AS sort_key
            FROM jobs
           WHERE status = 'dead'
             AND COALESCE(completed_at, updated_at) > NOW() - interval '24 hours'
           ORDER BY COALESCE(completed_at, updated_at) DESC
           LIMIT 5
        ) d
    ) dead ON TRUE
  `)) as unknown as {
    rows: Array<
      Record<string, unknown> & {
        stale_lease: number
        dead_24h: number
        due_pending: number
        scheduled_pending: number
        op_id: string | null
        op_type: string | null
        op_run_after: Date | null
        or_id: string | null
        or_type: string | null
        or_started_at: Date | null
        or_locked_by: string | null
        or_locked_at: Date | null
        dead_rows: Array<{
          id: string
          type: string
          attempts: number
          max_attempts: number
          completed_at: string | null
          error_message: string | null
        }> | null
      }
    >
  }

  const r = res.rows[0]

  const countsByStatus = zeroFilled(JOB_STATUSES)
  for (const s of JOB_STATUSES) {
    countsByStatus[s] = Number(r?.[`n_${s}`] ?? 0)
  }

  // `op_id` is the presence test, not `op_run_after`: the column is NOT NULL
  // on the table, so a null id is the only thing that means "no such row".
  const oldestPending =
    r?.op_id != null && r.op_run_after != null
      ? {
          id: r.op_id,
          type: r.op_type as string,
          run_after: new Date(r.op_run_after),
          age_ms: now - new Date(r.op_run_after).getTime(),
        }
      : null

  const oldestRunning =
    r?.or_id != null
      ? {
          id: r.or_id,
          type: r.or_type as string,
          started_at: r.or_started_at ? new Date(r.or_started_at) : null,
          locked_by: r.or_locked_by,
          locked_at: r.or_locked_at ? new Date(r.or_locked_at) : null,
          age_ms: r.or_started_at ? now - new Date(r.or_started_at).getTime() : null,
        }
      : null

  const recentDead = (r?.dead_rows ?? []).map((d) => ({
    id: d.id,
    type: d.type,
    attempts: Number(d.attempts),
    max_attempts: Number(d.max_attempts),
    completed_at: d.completed_at ? new Date(d.completed_at) : null,
    error_message: d.error_message,
  }))

  return {
    countsByStatus,
    oldestPending,
    oldestRunning,
    staleLeaseCount: Number(r?.stale_lease ?? 0),
    recentDead,
    deadCount24h: Number(r?.dead_24h ?? 0),
    duePendingCount: Number(r?.due_pending ?? 0),
    scheduledPendingCount: Number(r?.scheduled_pending ?? 0),
  }
}

async function fetchSystemEventsOverview(): Promise<SystemEventsOverview> {
  const since = new Date(Date.now() - WINDOW_24H_MS)
  const [matrix, errs] = await Promise.all([
    countBySourceSeverity({ since }),
    topErrors({ since, limit: 5 }),
  ])
  const grand_total = matrix.reduce((a, r) => a + r.count, 0)
  return {
    window_since_ms: WINDOW_24H_MS,
    matrix,
    grand_total,
    topErrors: errs,
  }
}

async function fetchAiRouterSnapshot(): Promise<AiRouterSnapshot> {
  if (!db) throw new Error("DB not configured")

  // Effective config = DB runtime override (admin Settings hub) over env defaults,
  // so the ops dashboard reflects what the rate limiter is actually enforcing.
  const [limits, mode] = await Promise.all([getEffectiveLimits(), getEffectiveMode()])

  // Group task_kinds by tier (light vs expensive).
  const tierKinds: Record<RateLimitTier, string[]> = {
    light: [],
    expensive: [],
  }
  for (const [kind, tier] of Object.entries(TASK_TIER)) {
    tierKinds[tier as RateLimitTier].push(kind)
  }

  // Per-tier current concurrency + today's cost.
  async function tierMetrics(tier: RateLimitTier): Promise<TierSnapshot> {
    const kinds = tierKinds[tier]
    if (kinds.length === 0) {
      return {
        current_concurrency: 0,
        concurrency_limit: limits[tier].maxConcurrent,
        daily_cost_usd: 0,
        daily_cost_limit_usd: limits[tier].maxDailyCostUsd,
      }
    }
    const kindsLiteral = sql.join(
      kinds.map((k) => sql`${k}`),
      sql`,`,
    )
    const concRes = (await db!.execute(sql`
      SELECT COUNT(*)::int AS n
        FROM ai_runs
       WHERE status = 'running'
         AND task_kind = ANY(ARRAY[${kindsLiteral}]::text[])
    `)) as unknown as { rows: Array<{ n: number }> }
    const costRes = (await db!.execute(sql`
      SELECT COALESCE(SUM(cost_usd), 0)::float8 AS s
        FROM ai_runs
       WHERE task_kind = ANY(ARRAY[${kindsLiteral}]::text[])
         AND started_at >= date_trunc('day', NOW())
    `)) as unknown as { rows: Array<{ s: number }> }
    return {
      current_concurrency: Number(concRes.rows[0]?.n ?? 0),
      concurrency_limit: limits[tier].maxConcurrent,
      daily_cost_usd: Number(costRes.rows[0]?.s ?? 0),
      daily_cost_limit_usd: limits[tier].maxDailyCostUsd,
    }
  }

  // ai_runs status counts over 24h.
  const sinceIso = new Date(Date.now() - WINDOW_24H_MS).toISOString()
  const statusRes = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS n
      FROM ai_runs
     WHERE started_at >= ${sinceIso}
     GROUP BY status
  `)) as unknown as { rows: Array<{ status: string; n: number }> }
  const ai_runs_status_counts_24h = zeroFilled(AI_RUN_STATUSES)
  for (const r of statusRes.rows) {
    const k = r.status as AiRunStatus
    if (k in ai_runs_status_counts_24h) {
      ai_runs_status_counts_24h[k] = Number(r.n)
    }
  }

  // Unfiltered daily spend + the unpriced-run count that makes it a
  // lower bound. NOTE the day boundary is `date_trunc('day', NOW())`,
  // byte-identical to the rate limiter's daily-cost window — see the
  // `day_boundary_tz` doc comment for why we don't pin a timezone here.
  const totalCostRes = (await db.execute(sql`
    SELECT
      COALESCE(SUM(cost_usd), 0)::float8 AS total,
      COUNT(*) FILTER (WHERE cost_usd IS NULL)::int AS unpriced
      FROM ai_runs
     WHERE started_at >= date_trunc('day', NOW())
  `)) as unknown as { rows: Array<{ total: number; unpriced: number }> }
  const tzRes = (await db.execute(sql`
    SELECT current_setting('TimeZone') AS tz
  `)) as unknown as { rows: Array<{ tz: string }> }

  // Account-level provider blocks in the last 60 minutes. `started_at` (not
  // completed_at) so a run still hanging open is counted from when it began.
  const blockedClasses = sql.join(
    [...PROVIDER_BLOCKED_ERROR_CLASSES].map((c) => sql`${c}`),
    sql`,`,
  )
  const blockedRes = (await db.execute(sql`
    SELECT COUNT(*)::int AS n,
           MAX(started_at) AS last_at,
           ARRAY_AGG(DISTINCT error_class) AS classes
      FROM ai_runs
     WHERE error_class = ANY(ARRAY[${blockedClasses}]::text[])
       AND started_at >= NOW() - interval '60 minutes'
  `)) as unknown as {
    rows: Array<{ n: number; last_at: Date | null; classes: string[] | null }>
  }
  const blocked = blockedRes.rows[0]

  // Unclassified failures + the 30-day model inventory, one roundtrip each.
  const unclassifiedRes = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM ai_runs
     WHERE error_class = ${UNCLASSIFIED_ERROR_CLASS}
       AND started_at >= ${sinceIso}
  `)) as unknown as { rows: Array<{ n: number }> }


  // Recent rejects per source — via the read API.
  const since24h = new Date(Date.now() - WINDOW_24H_MS)
  const [light, expensive, recentRateLimitRejects, recentAiRouterRejects] =
    await Promise.all([
      tierMetrics("light"),
      tierMetrics("expensive"),
      listEvents({
        source: "rate-limit",
        eventType: "rejected",
        since: since24h,
        limit: 10,
      }),
      listEvents({
        source: "ai-router",
        eventType: "rejected",
        since: since24h,
        limit: 5,
      }),
    ])

  return {
    rate_limit_mode: mode,
    tiers: { light, expensive },
    ai_runs_status_counts_24h,
    daily_cost_usd_total: Number(totalCostRes.rows[0]?.total ?? 0),
    unpriced_runs_today: Number(totalCostRes.rows[0]?.unpriced ?? 0),
    day_boundary_tz: tzRes.rows[0]?.tz ?? null,
    recentRateLimitRejects,
    recentAiRouterRejects,
    provider_blocked_60m: {
      count: Number(blocked?.n ?? 0),
      // ARRAY_AGG over zero rows yields NULL, and over rows always yields
      // non-null members here (the WHERE pins error_class).
      classes: (blocked?.classes ?? []).filter((c): c is string => Boolean(c)),
      lastAt: blocked?.last_at ? new Date(blocked.last_at) : null,
    },
    unclassified_failures_24h: Number(unclassifiedRes.rows[0]?.n ?? 0),
  }
}

/**
 * Section 7 — AI model configuration health.
 *
 * Three things that are individually invisible and jointly decide what
 * quality of model our output is actually produced by:
 *   • the availability catalog is stale/failing — the check that guards
 *     model selection is `fail-open`, so when it breaks NOTHING complains
 *     and every model is assumed available;
 *   • a task kind is silently running on a fallback model;
 *   • a model we depend on is near (or past) its retirement date.
 *
 * Reads the live selection rather than the event log: the question the
 * operator needs answered is "what am I running on RIGHT NOW", which a
 * historical event can only approximate. The persisted `ai-router.fallback`
 * event complements this by answering "since when".
 *
 * Cheap: the model catalog is cached in-process for 6h (stale-while-
 * revalidate) and warmed at boot by `instrumentation.ts`.
 */
async function fetchAiModelHealth(): Promise<AiModelHealth> {
  if (!db) throw new Error("DB not configured")

  // Distinct models with at least one real call in the last 30 days. Kept in
  // THIS fetcher rather than borrowed from the AI-router section so the two
  // stay independent — the fan-out's whole point is that one failing section
  // never takes another down with it.
  const modelsRes = (await db.execute(sql`
    SELECT DISTINCT model_name
      FROM ai_runs
     WHERE started_at >= NOW() - interval '30 days'
       AND model_name IS NOT NULL
  `)) as unknown as { rows: Array<{ model_name: string }> }
  const modelsUsed30d = modelsRes.rows.map((r) => r.model_name)

  const diagnostics = await getAiModelsDiagnostics()

  const fallbacks = diagnostics.tasks
    .filter((t) => t.effective.source === "fallback")
    .map((t) => ({
      taskKind: t.taskKind,
      requestedModel: t.effective.requestedModel,
      effectiveModel: t.effective.modelName,
    }))

  // "Selected" = every model the system would use by configuration today:
  // the resolved OpenAI model per task kind, plus the two Gemini defaults
  // (env-overridable, so an operator can pin a retiring model there and
  // nothing in the OpenAI catalog would ever notice).
  const selectedModels = [
    ...diagnostics.tasks.map((t) => t.effective.modelName),
    GEMINI_REASONING_MODEL,
    GEMINI_RETRIEVAL_MODEL,
  ]

  return {
    catalog: {
      stale: diagnostics.catalog.stale,
      lastError: diagnostics.catalog.lastError,
      refreshedAt: diagnostics.catalog.refreshedAt,
      // null textModelCount === the catalog has NEVER loaded, so every
      // availability check has been failing open since boot.
      everLoaded: diagnostics.catalog.textModelCount !== null,
    },
    fallbacks,
    eolRisks: findEolRisks({
      selectedModels,
      recentlyUsedModels: modelsUsed30d,
      now: new Date(),
    }),
  }
}

async function fetchEirPipelineSnapshot(): Promise<EirPipelineSnapshot> {
  if (!db) throw new Error("DB not configured")
  const since24h = new Date(Date.now() - WINDOW_24H_MS)

  const [phaseCounts, recentTransitions, invalidRes, mostRecentRes] =
    await Promise.all([
      countByPhase(),
      listEvents({
        source: "eir",
        eventType: "transition",
        since: since24h,
        limit: 10,
      }),
      db.execute(sql`
        SELECT COUNT(*)::int AS n
          FROM eir_invalid_transition_attempts
         WHERE attempted_at > NOW() - interval '24 hours'
      `) as unknown as Promise<{ rows: Array<{ n: number }> }>,
      db.execute(sql`
        SELECT MAX(attempted_at) AS t
          FROM eir_invalid_transition_attempts
      `) as unknown as Promise<{ rows: Array<{ t: Date | null }> }>,
    ])

  // Pad the sparse countByPhase result with zero-defaults for every
  // phase so the UI never sees a missing key.
  const filled = zeroFilled(EPISODE_PHASES)
  for (const [phase, n] of Object.entries(phaseCounts)) {
    if (phase in filled) filled[phase as EpisodePhase] = Number(n)
  }

  const invalid_attempts_24h = Number(invalidRes.rows[0]?.n ?? 0)
  const most_recent_invalid_attempt_at = mostRecentRes.rows[0]?.t
    ? new Date(mostRecentRes.rows[0].t!)
    : null

  return {
    countByPhase: filled,
    recentTransitions,
    invalid_attempts_24h,
    most_recent_invalid_attempt_at,
  }
}

async function fetchRecentActivity(): Promise<RecentActivity> {
  const since = new Date(Date.now() - WINDOW_24H_MS)
  const events = await listEvents({ since, limit: 20 })
  return { events }
}

/**
 * P2.4.e.1 — guest-identity section fetcher. Pulls the counter-only
 * snapshot from `lib/guest-identity/integrity.ts`. List-shaped data
 * (duplicate groups, unlinked rows) is NOT fetched here — those are
 * separate page-level queries in P2.4.e.2.
 *
 * Throws on DB failure; `settledToSection` in the orchestrator
 * converts the rejection into `{ ok: false, error }` so a slow /
 * failing guest-identity section never blanks the rest of the page.
 */
async function fetchGuestIdentitySnapshot(): Promise<GuestIdentitySnapshot> {
  return getGuestIdentitySnapshot()
}

// ─── Orchestrator ────────────────────────────────────────────────────

/** The one fetcher per section. Keyed by `OpsSection`, so adding a section
 *  to `OpsSectionData` without wiring a fetcher is a type error. */
const SECTION_FETCHERS: {
  [K in OpsSection]: () => Promise<OpsSectionData[K]>
} = {
  queue: fetchQueueHealth,
  systemEvents: fetchSystemEventsOverview,
  aiRouter: fetchAiRouterSnapshot,
  eirPipeline: fetchEirPipelineSnapshot,
  recentActivity: fetchRecentActivity,
  guestIdentity: fetchGuestIdentitySnapshot,
  worker: probeWorkerHeartbeat,
  aiModels: fetchAiModelHealth,
}

/**
 * Take a parallel snapshot of the requested sections (all of them by
 * default). Uses `Promise.allSettled` so one slow / failing section doesn't
 * blank the page; each outcome is wrapped in `SectionResult<T>`.
 *
 * `sections` exists because the two pages that call this render DIFFERENT
 * things, and a section that is fetched but never rendered is pure cost:
 * every fetcher here is one or more Postgres round-trips on the render path.
 * `/admin/ops` was paying for system events, the activity feed and the six
 * guest-identity queries it does not display; `/admin/ops/details` was
 * paying for the worker probe, the model-health reads and the same six
 * guest-identity queries. Each page now asks for exactly what it shows.
 *
 * Sections that are NOT requested are absent from the result (typed
 * `?: undefined`) rather than faked into a failure — see `OpsSnapshotFor`.
 */
export async function takeOpsSnapshot<S extends OpsSection = OpsSection>(
  opts: { sections?: readonly S[] } = {},
): Promise<OpsSnapshotFor<S>> {
  const taken_at = new Date()
  const t0 = Date.now()

  // Deduped: a caller listing a section twice must not run its queries twice.
  const names = [
    ...new Set<OpsSection>(opts.sections ?? (OPS_SECTIONS as readonly OpsSection[])),
  ]

  const settled = await Promise.allSettled(names.map((n) => SECTION_FETCHERS[n]()))

  const out: Record<string, unknown> = { taken_at }
  names.forEach((n, i) => {
    out[n] = settledToSection(settled[i])
  })
  out.duration_ms = Date.now() - t0

  return out as OpsSnapshotFor<S>
}
