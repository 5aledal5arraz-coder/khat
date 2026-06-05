/**
 * Phase 2.3 (P2.3.a) — typed inputs for emitSystemEvent().
 *
 * One discriminated union per (source, event_type) pair from the
 * frozen v1 vocabulary in `lib/db/schema/system-events.ts` §5. Severity
 * is pinned per variant so callers cannot emit, e.g., `eir.transition`
 * as `severity: 'error'`. The emit helper reads severity off the
 * variant; it is not part of the caller-facing input surface.
 *
 * Payload shapes are the source-of-truth contract that P2.3.b–P2.3.d
 * writers will pin against. Adding a field is non-breaking (writers
 * just don't populate it); changing a field's type requires updating
 * every writer + this file in the same PR.
 *
 * No runtime exports beyond the source-of-truth constants from
 * `../db/schema/system-events.ts`; this file is type-only by design.
 */

import type {
  SystemEventSource,
  SystemEventType,
  SystemEventSeverity,
  SystemEventSubjectKind,
} from "@/lib/db/schema/system-events"

// ─── Common fields ───────────────────────────────────────────────────

interface BaseSystemEventInput {
  /**
   * When the event happened. Defaults to the DB's `now()` if omitted.
   * Pass an explicit Date when replaying / batching past events.
   */
  event_at?: Date
  /**
   * Free-form attributor. Conventions:
   *   • worker:<8-char-id>  jobs worker
   *   • admin:<email>       admin-triggered
   *   • sweeper             ai-runs-sweeper handler
   *   • http                request-path emitters
   *   • undefined           leave actor NULL
   */
  actor?: string
  /**
   * Correlation ID for cross-event traces. Deferred per operator
   * decision §13 Q4 — leave undefined in v1. Reserved column.
   */
  request_id?: string
}

// ─── EIR ─────────────────────────────────────────────────────────────

/**
 * A legal phase transition just landed. Mirrors `eir_phase_transitions`
 * (existing audit) — `system_events` adds nothing new, just unifies
 * the read surface for the dashboard.
 */
export interface EirTransitionEvent extends BaseSystemEventInput {
  source: "eir"
  event_type: "transition"
  severity: "info"
  subject_kind: "episode_intelligence_record"
  subject_id: string
  payload: {
    from_phase: string | null
    to_phase: string
  }
}

/**
 * An illegal phase transition was attempted. The DB trigger has already
 * written to `eir_invalid_transition_attempts` (P2.1.a) — this is the
 * unified-log mirror, not a replacement.
 */
export interface EirInvalidTransitionEvent extends BaseSystemEventInput {
  source: "eir"
  event_type: "invalid_transition"
  severity: "warn"
  subject_kind: "episode_intelligence_record"
  subject_id: string
  payload: {
    from_phase: string | null
    attempted_to_phase: string
    mode: "report" | "enforce"
  }
}

// ─── Jobs ────────────────────────────────────────────────────────────

interface JobsBase extends BaseSystemEventInput {
  source: "jobs"
  subject_kind: "job"
  subject_id: string
}

export interface JobsClaimedEvent extends JobsBase {
  event_type: "claimed"
  severity: "info"
  payload: {
    job_type: string
    priority: number
    attempts: number
    max_attempts: number
  }
}

export interface JobsSucceededEvent extends JobsBase {
  event_type: "succeeded"
  severity: "info"
  payload: {
    job_type: string
    duration_ms: number
  }
}

export interface JobsFailedEvent extends JobsBase {
  event_type: "failed"
  severity: "warn"
  payload: {
    job_type: string
    error_message: string
    attempts: number
    max_attempts: number
    will_retry: boolean
  }
}

export interface JobsDeadEvent extends JobsBase {
  event_type: "dead"
  severity: "error"
  payload: {
    job_type: string
    error_message: string
    attempts: number
  }
}

export interface JobsReclaimedEvent extends JobsBase {
  event_type: "reclaimed"
  severity: "warn"
  payload: {
    job_type: string
    previous_locked_by: string | null
    lease_ms: number
  }
}

// ─── AI Router (rejects only — operator §13 Q1) ──────────────────────

/**
 * The router caught a `RateLimitError` from `acquireRateLimitPermit()`
 * before the `ai_runs` INSERT ran. There is no `ai_run` row to attribute
 * the rejection to — hence subjectless (operator P2.3.d §10 Q4).
 *
 * Config-level router errors (unknown task_kind, no adapter for
 * provider) are intentionally NOT emitted. Those are caller bugs and
 * surface as exceptions to stderr; they are not meaningful as
 * observability events.
 */
export interface AiRouterRejectedEvent extends BaseSystemEventInput {
  source: "ai-router"
  event_type: "rejected"
  severity: "warn"
  subject_kind?: undefined
  subject_id?: undefined
  payload: {
    task_kind: string
    reason: string
    actor_id?: string
  }
}

// ─── Rate-limit (rejects only — operator §13 Q2) ─────────────────────

/**
 * The rate-limit policy decided `blocked_*`. Emitted from inside
 * `acquireRateLimitPermit()` in BOTH REPORT and ENFORCE modes — REPORT
 * lets the call proceed but still records the would-be-block for
 * dashboard observability (operator P2.3.d §10 Q1).
 *
 * `subject_table` + `subject_id` carry the AI run's intended subject
 * (NOT the system_events row's subject — that's NULL for rate-limit
 * events). Especially useful for the `blocked_subject_lock` case where
 * the dashboard surfaces "which (table, id) was contested".
 */
export interface RateLimitRejectedEvent extends BaseSystemEventInput {
  source: "rate-limit"
  event_type: "rejected"
  severity: "warn"
  /** Rate-limit decisions are not always tied to a single ai_run. */
  subject_kind?: undefined
  subject_id?: undefined
  payload: {
    task_kind: string
    tier: "light" | "expensive"
    decision: string
    mode: "report" | "enforce"
    /** Optional — populated when the permit request carried subject context. */
    subject_table?: string
    /** Optional — populated when the permit request carried subject context. */
    subject_id?: string
  }
}

// ─── Sweeper ─────────────────────────────────────────────────────────

export interface SweeperSummaryEvent extends BaseSystemEventInput {
  source: "sweeper"
  event_type: "summary"
  severity: "info"
  subject_kind?: undefined
  subject_id?: undefined
  payload: {
    scanned: number
    reclaimed: number
    skipped: number
    duration_ms: number
    stale_after_ms: number
  }
}

// ─── Schedule (operator §13 Q3 — yes, emit) ──────────────────────────

export interface ScheduleCreatedEvent extends BaseSystemEventInput {
  source: "schedule"
  event_type: "created"
  severity: "info"
  subject_kind?: undefined
  subject_id?: undefined
  payload: {
    schedule_type: string
    cadence: string
  }
}

export interface ScheduleDisabledEvent extends BaseSystemEventInput {
  source: "schedule"
  event_type: "disabled"
  severity: "warn"
  subject_kind?: undefined
  subject_id?: undefined
  payload: {
    schedule_type: string
    reason?: string
  }
}

// ─── Guest identity (P2.4.d) ─────────────────────────────────────────

/**
 * An admin linked a `guest_candidate` or `guest_application` row to a
 * canonical `guests.id` via the admin UI (P2.4.d). The junction row in
 * `guest_candidate_links` / `guest_application_links` has already been
 * written when this event fires.
 *
 * Subjectless at the row level because `system_events.subject_kind`
 * only enumerates EIR / job / ai_run — adding new subject kinds would
 * widen the frozen P2.3 vocabulary. Instead, the linked junction's
 * `kind` + `id` go into the payload (mirrors the rate-limit pattern in
 * P2.3.d §10 Q3).
 *
 * Severity is pinned to "info" — a successful link is the happy path.
 * Failures (review-required, junction race) never reach the emit; the
 * route returns 4xx before the event would have been built.
 *
 * Payload fields:
 *   kind             "candidate" | "application"
 *   junction_id      uuid of the new junction row
 *   source_id        candidate_id or application_id
 *   guest_id         canonical guest the source resolved to
 *   confidence       "high" | "medium" — low/none never reaches this event
 *   created_guest    true when a new canonical row was inserted
 *
 * `actor` carries `admin:<id>` per operator §13 Q5.
 */
export interface GuestIdentityLinkedEvent extends BaseSystemEventInput {
  source: "guest-identity"
  event_type: "linked"
  severity: "info"
  subject_kind?: undefined
  subject_id?: undefined
  payload: {
    kind: "candidate" | "application"
    junction_id: string
    source_id: string
    guest_id: string
    confidence: "high" | "medium"
    created_guest: boolean
  }
}

// ─── Union ───────────────────────────────────────────────────────────

/**
 * The full v1 input surface for `emitSystemEvent`. Adding a new event
 * kind = add a new interface above + add it to this union. The DB
 * schema does not need to change (payload is free-form JSONB).
 */
export type SystemEventInput =
  | EirTransitionEvent
  | EirInvalidTransitionEvent
  | JobsClaimedEvent
  | JobsSucceededEvent
  | JobsFailedEvent
  | JobsDeadEvent
  | JobsReclaimedEvent
  | AiRouterRejectedEvent
  | RateLimitRejectedEvent
  | SweeperSummaryEvent
  | ScheduleCreatedEvent
  | ScheduleDisabledEvent
  | GuestIdentityLinkedEvent

// ─── Helper aliases (re-exported for ergonomic callers) ──────────────

export type {
  SystemEventSource,
  SystemEventType,
  SystemEventSeverity,
  SystemEventSubjectKind,
}
