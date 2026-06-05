/**
 * Phase 2.3 (P2.3.e) — read API for `system_events`.
 *
 * Five typed query functions, all read-only. Designed to be the single
 * read surface for:
 *   • The future P2.5 operational dashboard.
 *   • The `observe:phase-1-report` script (P2.3.e adds a section that
 *     consumes this module — eat-your-own-dog-food).
 *   • Ad-hoc tooling.
 *
 * No mutations anywhere in this file. No writers. No retention. Pure
 * read layer.
 *
 * Index alignment (from P2.3.a):
 *   • listEvents       → idx_system_events_event_at (ordered desc scan)
 *   • countBySource    → idx_system_events_event_at (range scan)
 *   • recentBySubject  → idx_system_events_subject (partial, scoped to non-NULL)
 *   • topErrors        → idx_system_events_severity_event_at (partial, scoped to severity != info)
 *
 * Caller-facing guarantees:
 *   • All limit values are clamped to safe bounds.
 *   • `id` is returned as `string` — bigserial values can exceed 2^53 and
 *     must not leak as JS Number.
 *   • Empty corpus produces empty arrays, not throws.
 */

import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  systemEvents,
  type SystemEventSource,
  type SystemEventSeverity,
  type SystemEventSubjectKind,
  type SystemEventType,
} from "@/lib/db/schema/system-events"

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Public row shape. `id` is `string` (not bigint/Number) — bigserial PKs
 * can grow past JS Number.MAX_SAFE_INTEGER and must round-trip safely.
 */
export interface SystemEventRow {
  id: string
  event_at: Date
  source: SystemEventSource
  event_type: string
  severity: SystemEventSeverity
  actor: string | null
  subject_kind: SystemEventSubjectKind | null
  subject_id: string | null
  payload: Record<string, unknown>
  request_id: string | null
}

export interface ListEventsOptions {
  source?: SystemEventSource
  /**
   * Frozen v1 vocabulary from `lib/db/schema/system-events.ts`. Must be
   * one of `SystemEventType` — using `string` here would lose the
   * column-type guarantee that Drizzle's `eq()` overload enforces.
   */
  eventType?: SystemEventType
  severity?: SystemEventSeverity
  since?: Date
  until?: Date
  requestId?: string
  /** Clamped to [1, 500]. Default 50. */
  limit?: number
  /** Clamped to ≥0. Default 0. */
  offset?: number
}

// ─── Pure helpers (unit-tested without DB) ────────────────────────────

export const LIST_EVENTS_LIMIT_MAX = 500
export const LIST_EVENTS_LIMIT_DEFAULT = 50
export const RECENT_BY_SUBJECT_LIMIT_MAX = 200
export const RECENT_BY_SUBJECT_LIMIT_DEFAULT = 50
export const TOP_ERRORS_LIMIT_MAX = 100
export const TOP_ERRORS_LIMIT_DEFAULT = 20

/**
 * Clamp a caller-supplied limit into a safe range. Non-finite / negative
 * / fractional / out-of-range values all flatten to a deterministic
 * result; the underlying query never receives a value that could blow
 * up memory or break the index plan.
 */
export function clampLimit(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  const floored = Math.floor(value)
  if (floored < min) return min
  if (floored > max) return max
  return floored
}

/**
 * Truncate a payload's JSON-string preview for the observation report.
 * `null` becomes "(empty)"; objects are JSON.stringified; oversize
 * strings get an ellipsis suffix. Never throws on weird payloads.
 */
export function truncatePayloadPreview(
  payload: unknown,
  maxChars: number,
): string {
  if (payload === null || payload === undefined) return "(empty)"
  let s: string
  try {
    s = typeof payload === "string" ? payload : JSON.stringify(payload)
  } catch {
    return "(unserializable)"
  }
  if (s.length <= maxChars) return s
  return s.slice(0, maxChars) + "…"
}

/**
 * Map a Drizzle row to the public `SystemEventRow` shape. Coerces
 * `id` (bigint) to string. Coerces `payload` to a non-null record (the
 * column is NOT NULL with default '{}', but Drizzle's `Record<string,
 * unknown> | null` typing is conservative).
 */
export function mapRow(r: typeof systemEvents.$inferSelect): SystemEventRow {
  return {
    id: typeof r.id === "bigint" ? r.id.toString() : String(r.id),
    event_at: r.event_at,
    source: r.source as SystemEventSource,
    event_type: r.event_type,
    severity: r.severity as SystemEventSeverity,
    actor: r.actor,
    subject_kind: r.subject_kind as SystemEventSubjectKind | null,
    subject_id: r.subject_id,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    request_id: r.request_id,
  }
}

// ─── Query functions ──────────────────────────────────────────────────

/**
 * Recent-events-first list with composable filters and offset+limit
 * pagination. Empty corpus → empty array.
 */
export async function listEvents(
  opts: ListEventsOptions = {},
): Promise<SystemEventRow[]> {
  if (!db) return []
  const conds = []
  if (opts.source) conds.push(eq(systemEvents.source, opts.source))
  if (opts.eventType) conds.push(eq(systemEvents.event_type, opts.eventType))
  if (opts.severity) conds.push(eq(systemEvents.severity, opts.severity))
  if (opts.since) conds.push(gte(systemEvents.event_at, opts.since))
  if (opts.until) conds.push(lte(systemEvents.event_at, opts.until))
  if (opts.requestId) conds.push(eq(systemEvents.request_id, opts.requestId))

  const limit = clampLimit(
    opts.limit,
    1,
    LIST_EVENTS_LIMIT_MAX,
    LIST_EVENTS_LIMIT_DEFAULT,
  )
  const offset = Math.max(0, Math.floor(opts.offset ?? 0))

  const rows = await db
    .select()
    .from(systemEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(systemEvents.event_at), desc(systemEvents.id))
    .limit(limit)
    .offset(offset)
  return rows.map(mapRow)
}

/**
 * Counts grouped by source within a time window. `until` defaults to
 * now. Returns one row per source that has at least one event in the
 * window (sources with zero events are omitted; caller can pad).
 */
export async function countBySource(opts: {
  since: Date
  until?: Date
}): Promise<Array<{ source: SystemEventSource; count: number }>> {
  if (!db) return []
  const until = opts.until ?? new Date()
  const r = (await db.execute(sql`
    SELECT source, COUNT(*)::int AS n
      FROM system_events
     WHERE event_at >= ${opts.since.toISOString()}
       AND event_at <= ${until.toISOString()}
     GROUP BY source
     ORDER BY source
  `)) as unknown as { rows: Array<{ source: string; n: number }> }
  return r.rows.map((row) => ({
    source: row.source as SystemEventSource,
    count: Number(row.n),
  }))
}

/**
 * Counts grouped by (source, severity) within a time window. The
 * observation report renders this as a matrix.
 */
export async function countBySourceSeverity(opts: {
  since: Date
  until?: Date
}): Promise<
  Array<{
    source: SystemEventSource
    severity: SystemEventSeverity
    count: number
  }>
> {
  if (!db) return []
  const until = opts.until ?? new Date()
  const r = (await db.execute(sql`
    SELECT source, severity, COUNT(*)::int AS n
      FROM system_events
     WHERE event_at >= ${opts.since.toISOString()}
       AND event_at <= ${until.toISOString()}
     GROUP BY source, severity
     ORDER BY source, severity
  `)) as unknown as {
    rows: Array<{ source: string; severity: string; n: number }>
  }
  return r.rows.map((row) => ({
    source: row.source as SystemEventSource,
    severity: row.severity as SystemEventSeverity,
    count: Number(row.n),
  }))
}

/**
 * Recent events for a specific subject. Uses the partial index. Returns
 * empty array when the subject has no events (does not throw).
 */
export async function recentBySubject(opts: {
  subjectKind: SystemEventSubjectKind
  subjectId: string
  /** Clamped to [1, 200]. Default 50. */
  limit?: number
}): Promise<SystemEventRow[]> {
  if (!db) return []
  const limit = clampLimit(
    opts.limit,
    1,
    RECENT_BY_SUBJECT_LIMIT_MAX,
    RECENT_BY_SUBJECT_LIMIT_DEFAULT,
  )
  const rows = await db
    .select()
    .from(systemEvents)
    .where(
      and(
        eq(systemEvents.subject_kind, opts.subjectKind),
        eq(systemEvents.subject_id, opts.subjectId),
      ),
    )
    .orderBy(desc(systemEvents.event_at), desc(systemEvents.id))
    .limit(limit)
  return rows.map(mapRow)
}

/**
 * Recent non-info events since a given time. Uses the partial
 * `severity <> 'info'` index. Returns warn + error rows mixed; callers
 * can filter further by severity if needed.
 */
export async function topErrors(opts: {
  since: Date
  /** Clamped to [1, 100]. Default 20. */
  limit?: number
}): Promise<SystemEventRow[]> {
  if (!db) return []
  const limit = clampLimit(
    opts.limit,
    1,
    TOP_ERRORS_LIMIT_MAX,
    TOP_ERRORS_LIMIT_DEFAULT,
  )
  const rows = await db
    .select()
    .from(systemEvents)
    .where(
      and(
        sql`${systemEvents.severity} <> 'info'`,
        gte(systemEvents.event_at, opts.since),
      ),
    )
    .orderBy(desc(systemEvents.event_at), desc(systemEvents.id))
    .limit(limit)
  return rows.map(mapRow)
}
