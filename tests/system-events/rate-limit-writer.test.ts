/**
 * Phase 2.3 (P2.3.d) — rate-limit writer unit tests.
 *
 * Pure surface only. DB roundtrip is exercised in smoke scenarios 11
 * (REPORT) and 12 (ENFORCE).
 *
 * What this file locks down:
 *   1. Source pinned to "rate-limit", event_type "rejected", severity "warn".
 *   2. Subjectless at the row level — both subject_kind and subject_id
 *      absent (operator P2.3.d §10 Q3 — subject info goes into payload).
 *   3. All 3 decision types pass through verbatim: blocked_subject_lock,
 *      blocked_concurrency, blocked_daily_cost.
 *   4. REPORT and ENFORCE modes both produce identical row shape (only
 *      the payload.mode field differs).
 *   5. subject_table + subject_id are optional; both null/undefined are
 *      omitted from the payload (no null leakage into JSONB).
 *   6. Actor passthrough.
 */

import { describe, expect, it } from "vitest"
import { buildRateLimitRejectedEvent } from "@/lib/system-events/builders"

describe("buildRateLimitRejectedEvent — pure builder", () => {
  it("emits warn-severity, subjectless block (concurrency)", () => {
    const evt = buildRateLimitRejectedEvent({
      task_kind: "editorial",
      tier: "expensive",
      decision: "blocked_concurrency",
      mode: "report",
      actor: "admin-abc",
    })
    expect(evt.source).toBe("rate-limit")
    expect(evt.event_type).toBe("rejected")
    expect(evt.severity).toBe("warn")
    expect("subject_kind" in evt).toBe(false)
    expect("subject_id" in evt).toBe(false)
    expect(evt.actor).toBe("admin-abc")
    expect(evt.payload).toEqual({
      task_kind: "editorial",
      tier: "expensive",
      decision: "blocked_concurrency",
      mode: "report",
    })
  })

  it("blocked_daily_cost decision passes through", () => {
    const evt = buildRateLimitRejectedEvent({
      task_kind: "editorial",
      tier: "expensive",
      decision: "blocked_daily_cost",
      mode: "enforce",
    })
    expect(evt.payload.decision).toBe("blocked_daily_cost")
    expect(evt.payload.mode).toBe("enforce")
  })

  it("blocked_subject_lock with subject context populates payload", () => {
    const evt = buildRateLimitRejectedEvent({
      task_kind: "editorial",
      tier: "expensive",
      decision: "blocked_subject_lock",
      mode: "enforce",
      subject_table: "episode_intelligence_records",
      subject_id: "eir-42",
    })
    expect(evt.payload).toEqual({
      task_kind: "editorial",
      tier: "expensive",
      decision: "blocked_subject_lock",
      mode: "enforce",
      subject_table: "episode_intelligence_records",
      subject_id: "eir-42",
    })
  })

  it("subject_table+subject_id omitted from payload when null", () => {
    const evt = buildRateLimitRejectedEvent({
      task_kind: "structural",
      tier: "light",
      decision: "blocked_concurrency",
      mode: "report",
      subject_table: null,
      subject_id: null,
    })
    expect("subject_table" in evt.payload).toBe(false)
    expect("subject_id" in evt.payload).toBe(false)
  })

  it("subject_table+subject_id omitted when undefined (no leakage)", () => {
    const evt = buildRateLimitRejectedEvent({
      task_kind: "structural",
      tier: "light",
      decision: "blocked_concurrency",
      mode: "report",
    })
    expect("subject_table" in evt.payload).toBe(false)
    expect("subject_id" in evt.payload).toBe(false)
  })

  it("REPORT and ENFORCE produce same row shape — only payload.mode differs", () => {
    const args = {
      task_kind: "editorial",
      tier: "expensive" as const,
      decision: "blocked_concurrency",
    }
    const report = buildRateLimitRejectedEvent({ ...args, mode: "report" })
    const enforce = buildRateLimitRejectedEvent({ ...args, mode: "enforce" })
    expect(report.source).toBe(enforce.source)
    expect(report.event_type).toBe(enforce.event_type)
    expect(report.severity).toBe(enforce.severity)
    expect(report.payload.mode).toBe("report")
    expect(enforce.payload.mode).toBe("enforce")
  })

  it("actor null/undefined both flatten to undefined on the row", () => {
    const args = {
      task_kind: "structural",
      tier: "light" as const,
      decision: "blocked_concurrency",
      mode: "report" as const,
    }
    expect(buildRateLimitRejectedEvent({ ...args, actor: null }).actor).toBeUndefined()
    expect(buildRateLimitRejectedEvent(args).actor).toBeUndefined()
  })

  it("light tier passes through verbatim", () => {
    const evt = buildRateLimitRejectedEvent({
      task_kind: "structural",
      tier: "light",
      decision: "blocked_concurrency",
      mode: "report",
    })
    expect(evt.payload.tier).toBe("light")
  })
})
