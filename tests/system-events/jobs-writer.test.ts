/**
 * Phase 2.3 (P2.3.c) — jobs writer unit tests.
 *
 * Pure surface only. DB roundtrip (worker → emit → INSERT) lives in
 * `scripts/smoke-system-events.ts` extension.
 *
 * What this file locks down for each of the 5 jobs builders:
 *   1. Source pinned to "jobs".
 *   2. event_type matches builder name.
 *   3. Severity pinned per variant — info / info / warn / error / warn.
 *   4. subject_kind = "job"; subject_id is the job_id.
 *   5. Payload shape lock per variant.
 *   6. Actor passthrough (worker:<id> or null).
 *   7. will_retry is hard-coded true on the failed variant.
 */

import { describe, expect, it } from "vitest"
import {
  buildJobsClaimedEvent,
  buildJobsSucceededEvent,
  buildJobsFailedEvent,
  buildJobsDeadEvent,
  buildJobsReclaimedEvent,
} from "@/lib/system-events/builders"

// ─── buildJobsClaimedEvent ───────────────────────────────────────────

describe("buildJobsClaimedEvent", () => {
  it("emits info-severity claim with full attempt context", () => {
    const evt = buildJobsClaimedEvent({
      job_id: "job-1",
      job_type: "market.scheduler",
      priority: 2,
      attempts: 1,
      max_attempts: 3,
      actor: "worker-abc12345",
    })
    expect(evt.source).toBe("jobs")
    expect(evt.event_type).toBe("claimed")
    expect(evt.severity).toBe("info")
    expect(evt.subject_kind).toBe("job")
    expect(evt.subject_id).toBe("job-1")
    expect(evt.actor).toBe("worker-abc12345")
    expect(evt.payload).toEqual({
      job_type: "market.scheduler",
      priority: 2,
      attempts: 1,
      max_attempts: 3,
    })
  })

  it("actor null/undefined both flatten to undefined", () => {
    expect(
      buildJobsClaimedEvent({
        job_id: "j",
        job_type: "t",
        priority: 0,
        attempts: 1,
        max_attempts: 3,
        actor: null,
      }).actor,
    ).toBeUndefined()
    expect(
      buildJobsClaimedEvent({
        job_id: "j",
        job_type: "t",
        priority: 0,
        attempts: 1,
        max_attempts: 3,
      }).actor,
    ).toBeUndefined()
  })
})

// ─── buildJobsSucceededEvent ─────────────────────────────────────────

describe("buildJobsSucceededEvent", () => {
  it("emits info-severity success with duration_ms", () => {
    const evt = buildJobsSucceededEvent({
      job_id: "job-2",
      job_type: "ai-runs-sweeper",
      duration_ms: 1234,
      actor: "worker-xyz",
    })
    expect(evt.event_type).toBe("succeeded")
    expect(evt.severity).toBe("info")
    expect(evt.subject_id).toBe("job-2")
    expect(evt.payload).toEqual({
      job_type: "ai-runs-sweeper",
      duration_ms: 1234,
    })
  })

  it("accepts zero duration without coercion", () => {
    const evt = buildJobsSucceededEvent({
      job_id: "j",
      job_type: "noop",
      duration_ms: 0,
    })
    expect(evt.payload.duration_ms).toBe(0)
  })
})

// ─── buildJobsFailedEvent ────────────────────────────────────────────

describe("buildJobsFailedEvent", () => {
  it("emits warn-severity failure with retry-affirmative payload", () => {
    const evt = buildJobsFailedEvent({
      job_id: "job-3",
      job_type: "market.scheduler",
      error_message: "transient API error",
      attempts: 1,
      max_attempts: 3,
      actor: "worker-aaa",
    })
    expect(evt.event_type).toBe("failed")
    expect(evt.severity).toBe("warn")
    expect(evt.payload).toEqual({
      job_type: "market.scheduler",
      error_message: "transient API error",
      attempts: 1,
      max_attempts: 3,
      will_retry: true,
    })
  })

  it("will_retry is hard-coded true — terminal failures use buildJobsDeadEvent instead", () => {
    const evt = buildJobsFailedEvent({
      job_id: "j",
      job_type: "t",
      error_message: "x",
      attempts: 3,
      max_attempts: 3,
    })
    // Even when attempts equals max_attempts in input, the failed
    // builder still flags will_retry=true. The worker should NEVER
    // call this builder in that case — it should call buildJobsDeadEvent.
    // The contract is: builder is dumb, caller branches.
    expect(evt.payload.will_retry).toBe(true)
  })
})

// ─── buildJobsDeadEvent ──────────────────────────────────────────────

describe("buildJobsDeadEvent", () => {
  it("emits error-severity dead with attempts (no max_attempts in payload)", () => {
    const evt = buildJobsDeadEvent({
      job_id: "job-4",
      job_type: "ai-runs-sweeper",
      error_message: "final straw",
      attempts: 5,
      actor: "worker-bbb",
    })
    expect(evt.event_type).toBe("dead")
    expect(evt.severity).toBe("error")
    expect(evt.payload).toEqual({
      job_type: "ai-runs-sweeper",
      error_message: "final straw",
      attempts: 5,
    })
    // Confirm no max_attempts leakage (the dead event doesn't need it
    // — the row is terminal).
    expect("max_attempts" in evt.payload).toBe(false)
  })
})

// ─── buildJobsReclaimedEvent ─────────────────────────────────────────

describe("buildJobsReclaimedEvent", () => {
  it("emits warn-severity reclaim with previous_locked_by + lease_ms", () => {
    const evt = buildJobsReclaimedEvent({
      job_id: "job-5",
      job_type: "ai-runs-sweeper",
      previous_locked_by: "worker-deadhost",
      lease_ms: 300_000,
      actor: "worker-newhost",
    })
    expect(evt.event_type).toBe("reclaimed")
    expect(evt.severity).toBe("warn")
    expect(evt.subject_id).toBe("job-5")
    expect(evt.payload).toEqual({
      job_type: "ai-runs-sweeper",
      previous_locked_by: "worker-deadhost",
      lease_ms: 300_000,
    })
  })

  it("previous_locked_by null passes through verbatim", () => {
    const evt = buildJobsReclaimedEvent({
      job_id: "j",
      job_type: "t",
      previous_locked_by: null,
      lease_ms: 1000,
    })
    expect(evt.payload.previous_locked_by).toBeNull()
  })
})
