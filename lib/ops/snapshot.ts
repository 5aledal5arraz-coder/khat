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
import { countByPhase } from "@/lib/eir/service"
import {
  getGuestIdentitySnapshot,
  type GuestIdentitySnapshot,
} from "@/lib/guest-identity/integrity"

// ─── Public types ────────────────────────────────────────────────────

/**
 * Caller-facing discriminated union. The UI MUST check `ok` before
 * accessing `data`; on failure the section renders an unavailable state
 * with the error message (and nothing else from this section).
 */
export type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface OpsSnapshot {
  /** Wall-clock at the start of takeOpsSnapshot(). */
  taken_at: Date
  /** Total ms inside Promise.allSettled. Smoke perf gate reads this. */
  duration_ms: number
  queue: SectionResult<QueueHealth>
  systemEvents: SectionResult<SystemEventsOverview>
  aiRouter: SectionResult<AiRouterSnapshot>
  eirPipeline: SectionResult<EirPipelineSnapshot>
  recentActivity: SectionResult<RecentActivity>
  /** P2.4.e.1 — guest-identity integrity counters. Rendered as a
   *  compact section by the dashboard (P2.4.e.2). */
  guestIdentity: SectionResult<GuestIdentitySnapshot>
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
  /** Last 10 rate-limit.rejected events. */
  recentRateLimitRejects: SystemEventRow[]
  /** Last 5 ai-router.rejected events. */
  recentAiRouterRejects: SystemEventRow[]
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

/**
 * Map a settled promise into the discriminated SectionResult.
 *
 * Pure — no I/O. Unit-tested directly so the orchestrator's
 * error-containment contract is provable without spinning the DB.
 */
export function settledToSection<T>(
  settled: PromiseSettledResult<T>,
): SectionResult<T> {
  if (settled.status === "fulfilled") return { ok: true, data: settled.value }
  const reason = settled.reason
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "unknown error"
  return { ok: false, error: message }
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

async function fetchQueueHealth(): Promise<QueueHealth> {
  if (!db) throw new Error("DB not configured")
  const now = Date.now()

  // 1. Counts by status.
  const countsRes = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS n FROM jobs GROUP BY status
  `)) as unknown as { rows: Array<{ status: string; n: number }> }
  const countsByStatus = zeroFilled(JOB_STATUSES)
  for (const r of countsRes.rows) {
    const k = r.status as JobStatus
    if (k in countsByStatus) countsByStatus[k] = Number(r.n)
  }

  // 2. Oldest pending.
  const oldestPendingRes = (await db.execute(sql`
    SELECT id, type, run_after
      FROM jobs
     WHERE status = 'pending'
     ORDER BY run_after ASC
     LIMIT 1
  `)) as unknown as {
    rows: Array<{ id: string; type: string; run_after: Date }>
  }
  const op = oldestPendingRes.rows[0] ?? null
  const oldestPending = op
    ? {
        id: op.id,
        type: op.type,
        run_after: new Date(op.run_after),
        age_ms: now - new Date(op.run_after).getTime(),
      }
    : null

  // 3. Oldest running (NULLS LAST so a row with null started_at doesn't
  //    eclipse a real claim).
  const oldestRunningRes = (await db.execute(sql`
    SELECT id, type, started_at, locked_by, locked_at
      FROM jobs
     WHERE status = 'running'
     ORDER BY started_at ASC NULLS LAST
     LIMIT 1
  `)) as unknown as {
    rows: Array<{
      id: string
      type: string
      started_at: Date | null
      locked_by: string | null
      locked_at: Date | null
    }>
  }
  const or = oldestRunningRes.rows[0] ?? null
  const oldestRunning = or
    ? {
        id: or.id,
        type: or.type,
        started_at: or.started_at ? new Date(or.started_at) : null,
        locked_by: or.locked_by,
        locked_at: or.locked_at ? new Date(or.locked_at) : null,
        age_ms: or.started_at
          ? now - new Date(or.started_at).getTime()
          : null,
      }
    : null

  // 4. Stale-lease count (lease window matches worker's 5-min default).
  const staleRes = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM jobs
     WHERE status = 'running'
       AND locked_at IS NOT NULL
       AND locked_at < NOW() - interval '5 minutes'
  `)) as unknown as { rows: Array<{ n: number }> }
  const staleLeaseCount = Number(staleRes.rows[0]?.n ?? 0)

  // 5. Recent dead (last 5 in 24h).
  const deadRes = (await db.execute(sql`
    SELECT id, type, attempts, max_attempts, completed_at, error_message
      FROM jobs
     WHERE status = 'dead'
       AND COALESCE(completed_at, updated_at) > NOW() - interval '24 hours'
     ORDER BY COALESCE(completed_at, updated_at) DESC
     LIMIT 5
  `)) as unknown as {
    rows: Array<{
      id: string
      type: string
      attempts: number
      max_attempts: number
      completed_at: Date | null
      error_message: string | null
    }>
  }
  const recentDead = deadRes.rows.map((r) => ({
    id: r.id,
    type: r.type,
    attempts: Number(r.attempts),
    max_attempts: Number(r.max_attempts),
    completed_at: r.completed_at ? new Date(r.completed_at) : null,
    error_message: r.error_message,
  }))

  return {
    countsByStatus,
    oldestPending,
    oldestRunning,
    staleLeaseCount,
    recentDead,
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
    recentRateLimitRejects,
    recentAiRouterRejects,
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

/**
 * Take a parallel snapshot of all five sections. Uses
 * `Promise.allSettled` so one slow / failing section doesn't blank the
 * page. Each section's outcome is wrapped in `SectionResult<T>`.
 */
export async function takeOpsSnapshot(): Promise<OpsSnapshot> {
  const taken_at = new Date()
  const t0 = Date.now()

  const settled = await Promise.allSettled([
    fetchQueueHealth(),
    fetchSystemEventsOverview(),
    fetchAiRouterSnapshot(),
    fetchEirPipelineSnapshot(),
    fetchRecentActivity(),
    fetchGuestIdentitySnapshot(),
  ])

  return {
    taken_at,
    duration_ms: Date.now() - t0,
    queue: settledToSection(settled[0]),
    systemEvents: settledToSection(settled[1]),
    aiRouter: settledToSection(settled[2]),
    eirPipeline: settledToSection(settled[3]),
    recentActivity: settledToSection(settled[4]),
    guestIdentity: settledToSection(settled[5]),
  }
}
