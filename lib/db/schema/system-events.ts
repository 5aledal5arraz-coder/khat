/**
 * Phase 2.3 (P2.3.a) — `system_events` unified event log.
 *
 * Append-only projection of cross-domain lifecycle events. Mirrors —
 * never replaces — the existing subsystem audits (eir_invalid_transition_attempts,
 * ai_rate_limit_events, ai_runs, jsonb_validation_events). Designed to be the
 * single read surface for the future P2.5 operational dashboard.
 *
 * Schema-additive only:
 *   • New table `system_events` + 4 indexes.
 *   • No existing table is touched.
 *   • Foreign keys deliberately omitted — an event row must survive
 *     subject deletion (this table is meta-audit).
 *
 * REPORT-mode writer contract (lib/system-events/emit.ts):
 *   Every INSERT is fire-and-forget. A failure to log NEVER throws to
 *   the caller; the business logic continues. Mirrors the P1.3 JSONB
 *   validator + P1.6 rate-limit + P2.1 EIR trigger pattern.
 *
 * Vocabulary — frozen for v1 in `lib/system-events/types.ts`. The DB
 * columns stay free-form `text` so adding a new (source, event_type)
 * pair in a later sub-phase is a code-only change, not a migration.
 *
 * Useful queries (consumed by P2.3.e read API + observe:phase-1-report):
 *   • Counts by source in the last 24h:
 *       SELECT source, count(*) FROM system_events
 *       WHERE event_at > now() - interval '24 hours'
 *       GROUP BY source ORDER BY 2 DESC;
 *   • Top error/warn events in the last 24h:
 *       SELECT event_at, source, event_type, severity, subject_kind,
 *              subject_id, payload
 *       FROM system_events
 *       WHERE severity <> 'info'
 *         AND event_at > now() - interval '24 hours'
 *       ORDER BY event_at DESC LIMIT 50;
 *   • Trace for a specific subject:
 *       SELECT event_at, source, event_type, severity, payload
 *       FROM system_events
 *       WHERE subject_kind = 'job' AND subject_id = '<id>'
 *       ORDER BY event_at DESC;
 *
 * Retention: none in v1. Revisit in P2.7. Estimated v1 growth with the
 * rejects-only emit policy on router + rate-limit is 5k–15k rows/day.
 *
 * BIGSERIAL primary key (not text/UUID) for two reasons:
 *   1. Append-only event log — time-ordered numeric IDs are cheaper to
 *      index than random UUIDs at scale.
 *   2. Future retention sweeps can use `id < threshold` semantics rather
 *      than scanning event_at.
 */

import { sql } from "drizzle-orm"
import { pgTable, bigserial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core"

// ─── Frozen vocabulary (v1) ──────────────────────────────────────────
//
// Re-exported from lib/system-events/types.ts. Kept here as `as const`
// tuples so the schema file is self-contained and the discriminated
// unions in the types module can pin against them at compile time.

export const SYSTEM_EVENT_SOURCES = [
  "eir",
  "jobs",
  "ai-router",
  "rate-limit",
  "sweeper",
  "schedule",
  "guest-identity",
] as const
export type SystemEventSource = (typeof SYSTEM_EVENT_SOURCES)[number]

export const SYSTEM_EVENT_SEVERITIES = ["info", "warn", "error"] as const
export type SystemEventSeverity = (typeof SYSTEM_EVENT_SEVERITIES)[number]

export const SYSTEM_EVENT_SUBJECT_KINDS = [
  "episode_intelligence_record",
  "job",
  "ai_run",
] as const
export type SystemEventSubjectKind = (typeof SYSTEM_EVENT_SUBJECT_KINDS)[number]

/**
 * Full (source, event_type) vocabulary for v1.
 *
 *   eir.transition              info  episode_intelligence_record
 *   eir.invalid_transition      warn  episode_intelligence_record
 *   jobs.claimed                info  job
 *   jobs.succeeded              info  job
 *   jobs.failed                 warn  job
 *   jobs.dead                   error job
 *   jobs.reclaimed              warn  job
 *   ai-router.rejected          warn  ai_run
 *   rate-limit.rejected         warn  NULL
 *   sweeper.summary             info  NULL
 *   schedule.created            info  NULL
 *   schedule.disabled           warn  NULL
 *   guest-identity.linked       info  NULL
 *
 * Admit events (router.admitted, rate-limit.admitted) are intentionally
 * omitted from v1 — volume risk. Approved by operator §13 Q1+Q2.
 *
 * P2.4.d added `guest-identity.linked` — emitted when an admin links a
 * candidate or application to a canonical guest via the admin UI. The
 * payload carries the linked junction kind and ids; the subject of the
 * row stays NULL because system_events.subject_kind has no
 * "guest_candidate" / "guest_application" member (keeping it frozen).
 */
export const SYSTEM_EVENT_TYPES = [
  "transition",
  "invalid_transition",
  "claimed",
  "succeeded",
  "failed",
  "dead",
  "reclaimed",
  "rejected",
  "summary",
  "created",
  "disabled",
  "linked",
] as const
export type SystemEventType = (typeof SYSTEM_EVENT_TYPES)[number]

export const systemEvents = pgTable(
  "system_events",
  {
    /** Time-ordered numeric PK. See file-level doc for rationale. */
    id: bigserial("id", { mode: "bigint" }).primaryKey(),

    /** When the event actually happened (writer-set; defaults to now). */
    event_at: timestamp("event_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Frozen vocabulary — see SYSTEM_EVENT_SOURCES. */
    source: text("source").$type<SystemEventSource>().notNull(),

    /** Frozen vocabulary — see SYSTEM_EVENT_TYPES. */
    event_type: text("event_type").$type<SystemEventType>().notNull(),

    /** info | warn | error — defaults to info at the DB level. */
    severity: text("severity").$type<SystemEventSeverity>().notNull().default("info"),

    /**
     * Free-form attribution. Conventions:
     *   • worker:<8-char-id>  — the jobs worker
     *   • admin:<email>       — admin-triggered action
     *   • sweeper             — ai-runs-sweeper handler
     *   • http                — public/web request paths
     *   • NULL                — unknown / not applicable
     */
    actor: text("actor"),

    /**
     * What kind of entity this event is about. Soft pointer — no FK.
     * NULL when the event is not about any specific entity (e.g.,
     * sweeper.summary, rate-limit.rejected).
     */
    subject_kind: text("subject_kind").$type<SystemEventSubjectKind>(),

    /**
     * ID of the subject as text. Handles UUIDs and integers uniformly.
     * NULL together with subject_kind for non-entity events.
     */
    subject_id: text("subject_id"),

    /**
     * Event-specific payload. Shape validated per (source, event_type)
     * at the call site via the discriminated unions in
     * `lib/system-events/types.ts`. DB stays free-form JSONB so adding
     * a new event type in a later sub-phase needs no migration.
     */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),

    /**
     * Correlation ID for cross-event traces. Reserved for a later
     * sub-phase per operator decision §13 Q4. Nullable in v1.
     */
    request_id: text("request_id"),

    /** When the row was inserted (DB-set; separate from event_at). */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Primary dashboard query path — recent events first.
    index("idx_system_events_event_at").on(t.event_at),
    // Filter-by-source + ordered by time — the dashboard's main filter.
    index("idx_system_events_source_type_event_at").on(
      t.source,
      t.event_type,
      t.event_at,
    ),
    // Trace-by-subject lookup. Partial — most events have no subject.
    index("idx_system_events_subject")
      .on(t.subject_kind, t.subject_id)
      .where(sql`subject_kind IS NOT NULL`),
    // Error/warn priority lookup. Partial — most events are info.
    index("idx_system_events_severity_event_at")
      .on(t.severity, t.event_at)
      .where(sql`severity <> 'info'`),
  ],
)
