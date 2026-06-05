/**
 * Phase 2.3 (P2.3.b) — pure builders for system_events inputs.
 *
 * Builders are pure functions that produce typed `SystemEventInput`
 * variants from natural ergonomic args. The two responsibilities split
 * cleanly:
 *
 *   • Builders (this file)   — shape the event. Pure. Unit-testable.
 *   • Emit helper (P2.3.a)   — write the event. Fire-and-forget.
 *
 * Callers in the service layer compose: `void emitSystemEvent(build…(…))`.
 *
 * P2.3.b ships only the EIR builder. Jobs / router / rate-limit / sweeper
 * builders land in P2.3.c–P2.3.d, each in this same file.
 */

import type {
  EirTransitionEvent,
  JobsClaimedEvent,
  JobsSucceededEvent,
  JobsFailedEvent,
  JobsDeadEvent,
  JobsReclaimedEvent,
  SweeperSummaryEvent,
  ScheduleCreatedEvent,
  AiRouterRejectedEvent,
  RateLimitRejectedEvent,
  GuestIdentityLinkedEvent,
} from "./types"

// ─── EIR ─────────────────────────────────────────────────────────────

/**
 * Build a legal EIR phase-transition event.
 *
 * Used at two service-layer sites in `lib/eir/service.ts`:
 *   • `createEpisodeIntelligenceRecord` → `from_phase = null`, the
 *      EIR's initial seed phase (default "idea").
 *   • `transitionEpisodePhase`          → the legal forward move.
 *
 * Severity is pinned to "info" at the type layer — callers cannot
 * override. Illegal transitions are NOT routed through this builder;
 * see Option A in the P2.3.b plan §3 for the architectural rationale.
 *
 * `actor` is passed verbatim per operator §13 Q3 (no `eir-service:`
 * prefixing in v1). `undefined` or `null` from callers both flatten
 * to DB NULL via the emit helper.
 */
export function buildEirTransitionEvent(input: {
  eir_id: string
  from_phase: string | null
  to_phase: string
  actor?: string | null
}): EirTransitionEvent {
  return {
    source: "eir",
    event_type: "transition",
    severity: "info",
    subject_kind: "episode_intelligence_record",
    subject_id: input.eir_id,
    actor: input.actor ?? undefined,
    payload: {
      from_phase: input.from_phase,
      to_phase: input.to_phase,
    },
  }
}

// ─── Jobs (P2.3.c) ───────────────────────────────────────────────────

/**
 * A pending job was just claimed by a worker.
 *
 * Emit site: `lib/jobs/worker.ts` `processOne()`, after `claimNextJob`
 * returns a non-null row, before the handler runs.
 */
export function buildJobsClaimedEvent(input: {
  job_id: string
  job_type: string
  priority: number
  attempts: number
  max_attempts: number
  actor?: string | null
}): JobsClaimedEvent {
  return {
    source: "jobs",
    event_type: "claimed",
    severity: "info",
    subject_kind: "job",
    subject_id: input.job_id,
    actor: input.actor ?? undefined,
    payload: {
      job_type: input.job_type,
      priority: input.priority,
      attempts: input.attempts,
      max_attempts: input.max_attempts,
    },
  }
}

/**
 * A handler returned success and `completeJob` landed.
 *
 * Emit site: `lib/jobs/worker.ts` `processOne()` try-block, after
 * `completeJob` returns. `duration_ms` is wall-clock from the claim's
 * `started_at` to now.
 */
export function buildJobsSucceededEvent(input: {
  job_id: string
  job_type: string
  duration_ms: number
  actor?: string | null
}): JobsSucceededEvent {
  return {
    source: "jobs",
    event_type: "succeeded",
    severity: "info",
    subject_kind: "job",
    subject_id: input.job_id,
    actor: input.actor ?? undefined,
    payload: {
      job_type: input.job_type,
      duration_ms: input.duration_ms,
    },
  }
}

/**
 * A handler threw but the job still has retries left. `will_retry` is
 * always true on this variant; callers branch on `failJob`'s return
 * status and use `buildJobsDeadEvent` for the terminal case.
 *
 * Emit site: `lib/jobs/worker.ts` `processOne()` catch-block when
 * `failJob` returns `{ status: 'pending' }`.
 */
export function buildJobsFailedEvent(input: {
  job_id: string
  job_type: string
  error_message: string
  attempts: number
  max_attempts: number
  actor?: string | null
}): JobsFailedEvent {
  return {
    source: "jobs",
    event_type: "failed",
    severity: "warn",
    subject_kind: "job",
    subject_id: input.job_id,
    actor: input.actor ?? undefined,
    payload: {
      job_type: input.job_type,
      error_message: input.error_message,
      attempts: input.attempts,
      max_attempts: input.max_attempts,
      will_retry: true,
    },
  }
}

/**
 * A handler threw and the job exhausted its retry budget. Terminal.
 *
 * Emit site: `lib/jobs/worker.ts` `processOne()` catch-block when
 * `failJob` returns `{ status: 'dead' }`.
 */
export function buildJobsDeadEvent(input: {
  job_id: string
  job_type: string
  error_message: string
  attempts: number
  actor?: string | null
}): JobsDeadEvent {
  return {
    source: "jobs",
    event_type: "dead",
    severity: "error",
    subject_kind: "job",
    subject_id: input.job_id,
    actor: input.actor ?? undefined,
    payload: {
      job_type: input.job_type,
      error_message: input.error_message,
      attempts: input.attempts,
    },
  }
}

/**
 * The lease reaper recovered a `running` row whose worker died before
 * completing it. One event per reclaimed row (not per-batch).
 *
 * Emit site: `lib/jobs/worker.ts` lease-reaper, both at startup and
 * inside the main loop.
 */
export function buildJobsReclaimedEvent(input: {
  job_id: string
  job_type: string
  previous_locked_by: string | null
  lease_ms: number
  actor?: string | null
}): JobsReclaimedEvent {
  return {
    source: "jobs",
    event_type: "reclaimed",
    severity: "warn",
    subject_kind: "job",
    subject_id: input.job_id,
    actor: input.actor ?? undefined,
    payload: {
      job_type: input.job_type,
      previous_locked_by: input.previous_locked_by,
      lease_ms: input.lease_ms,
    },
  }
}

// ─── Sweeper (P2.3.c) ────────────────────────────────────────────────

/**
 * The ai-runs sweeper finished a wet pass.
 *
 * Emit site: `lib/jobs/handlers/ai-runs-sweeper.ts` `runAiRunsSweep`,
 * inside the wet branch only (`dryRun === false`). Dry-run sweeps do
 * NOT emit — operator §6 Q2 — to keep CLI dry-runs from spamming the
 * event log.
 *
 * Payload mapping from `SweepResult`:
 *   • scanned       ← ai_runs.candidates
 *   • reclaimed     ← ai_runs.reclaimed
 *   • skipped       ← candidates − reclaimed  (the maxRows cap)
 *   • duration_ms   ← wall_ms
 *   • stale_after_ms← orchestrator input
 */
export function buildSweeperSummaryEvent(input: {
  scanned: number
  reclaimed: number
  skipped: number
  duration_ms: number
  stale_after_ms: number
  actor?: string | null
}): SweeperSummaryEvent {
  return {
    source: "sweeper",
    event_type: "summary",
    severity: "info",
    actor: input.actor ?? undefined,
    payload: {
      scanned: input.scanned,
      reclaimed: input.reclaimed,
      skipped: input.skipped,
      duration_ms: input.duration_ms,
      stale_after_ms: input.stale_after_ms,
    },
  }
}

// ─── Schedule (P2.3.c) ───────────────────────────────────────────────

/**
 * A scheduler bootstrap enqueued a new recurring tick. Fires only on
 * the `"bootstrapped"` branch of `ensureMarketScheduler` /
 * `ensureAiRunsSweeperSchedule` — the `"already_scheduled"` branch
 * stays silent (it's a no-op).
 *
 * `schedule.disabled` is intentionally omitted in v1 (operator §6 Q3
 * — no caller exists). The builder is not present and the type union
 * still permits the event for a future sub-phase.
 *
 * Emit site: `lib/jobs/worker.ts` at the 3 bootstrap call sites
 * (startup market + startup ai-runs-sweeper + periodic re-check).
 */
export function buildScheduleCreatedEvent(input: {
  schedule_type: string
  cadence: string
  actor?: string | null
}): ScheduleCreatedEvent {
  return {
    source: "schedule",
    event_type: "created",
    severity: "info",
    actor: input.actor ?? undefined,
    payload: {
      schedule_type: input.schedule_type,
      cadence: input.cadence,
    },
  }
}

// ─── AI Router rejected (P2.3.d) ─────────────────────────────────────

/**
 * The AI Router caught a `RateLimitError` from `acquireRateLimitPermit()`
 * before the `ai_runs` row could be created. Subjectless — there is no
 * `ai_run` id to attribute the rejection to (operator P2.3.d §10 Q4).
 *
 * Emit site: `lib/ai-router/router.ts` inside a narrow `instanceof
 * RateLimitError` catch around the permit acquisition. Config-level
 * router errors (unknown task_kind, no adapter) are intentionally NOT
 * routed through this builder.
 */
export function buildAiRouterRejectedEvent(input: {
  task_kind: string
  reason: string
  actor_id?: string | null
  actor?: string | null
}): AiRouterRejectedEvent {
  return {
    source: "ai-router",
    event_type: "rejected",
    severity: "warn",
    actor: input.actor ?? undefined,
    payload: {
      task_kind: input.task_kind,
      reason: input.reason,
      ...(input.actor_id ? { actor_id: input.actor_id } : {}),
    },
  }
}

// ─── Rate-limit rejected (P2.3.d) ────────────────────────────────────

/**
 * Rate-limit policy decided `blocked_*`. Emitted from inside
 * `acquireRateLimitPermit()` in BOTH REPORT and ENFORCE modes — REPORT
 * lets the call proceed but still records the would-be-block for
 * dashboard observability (operator P2.3.d §10 Q1).
 *
 * Subjectless at the row level. `subject_table` + `subject_id` go into
 * the payload (operator §10 Q3) so the dashboard can surface
 * subject-lock contention without changing the system_events row's
 * subject_kind.
 *
 * Emit site: `lib/ai-router/rate-limit.ts` alongside each
 * `writeAuditEvent` call where `decision.startsWith("blocked_")`. The
 * bypass/allowed paths do NOT emit (rejects-only — operator §13 Q2 of
 * P2.3.a, reconfirmed in P2.3.d §10).
 */
export function buildRateLimitRejectedEvent(input: {
  task_kind: string
  tier: "light" | "expensive"
  decision: string
  mode: "report" | "enforce"
  subject_table?: string | null
  subject_id?: string | null
  actor?: string | null
}): RateLimitRejectedEvent {
  return {
    source: "rate-limit",
    event_type: "rejected",
    severity: "warn",
    actor: input.actor ?? undefined,
    payload: {
      task_kind: input.task_kind,
      tier: input.tier,
      decision: input.decision,
      mode: input.mode,
      ...(input.subject_table ? { subject_table: input.subject_table } : {}),
      ...(input.subject_id ? { subject_id: input.subject_id } : {}),
    },
  }
}

// ─── Guest identity (P2.4.d) ─────────────────────────────────────────

/**
 * An admin just bound a `guest_candidate` or `guest_application` row
 * to a canonical `guests.id` via the admin UI. Emitted from the two
 * sibling routes:
 *   POST /api/admin/guest-candidates/:id/link-canonical
 *   POST /api/admin/submissions/guests/:id/link-canonical
 *
 * Severity is pinned to "info" — only successful links are emitted.
 * Review-required / mismatch / junction-race paths return 4xx before
 * this builder is called.
 *
 * Emit semantics (operator constraint): fire-and-forget. The route
 * `void`-discards the returned promise so an emit failure never causes
 * the link itself to fail. The emit helper's `try/catch` keeps the
 * contract.
 *
 * Subjectless — see `GuestIdentityLinkedEvent` doc for the rationale
 * (preserves the frozen `system_events.subject_kind` vocabulary; the
 * linked junction's identifiers ride in the payload).
 *
 * `actor` is `admin:<id>` per operator §13 Q5.
 */
export function buildGuestIdentityLinkedEvent(input: {
  kind: "candidate" | "application"
  junction_id: string
  source_id: string
  guest_id: string
  confidence: "high" | "medium"
  created_guest: boolean
  actor?: string | null
}): GuestIdentityLinkedEvent {
  return {
    source: "guest-identity",
    event_type: "linked",
    severity: "info",
    actor: input.actor ?? undefined,
    payload: {
      kind: input.kind,
      junction_id: input.junction_id,
      source_id: input.source_id,
      guest_id: input.guest_id,
      confidence: input.confidence,
      created_guest: input.created_guest,
    },
  }
}
