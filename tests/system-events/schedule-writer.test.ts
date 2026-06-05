/**
 * Phase 2.3 (P2.3.c) — schedule writer unit tests.
 *
 * Pure surface only. End-to-end "bootstrap → emit" lives in the
 * extended smoke.
 *
 * v1 ships only `schedule.created` — `schedule.disabled` is omitted
 * (operator §6 Q3 — no caller exists). When/if a disable path lands,
 * a builder + its tests will be added without touching the schema.
 *
 * What this file locks down:
 *   1. Source pinned to "schedule", event_type "created", severity "info".
 *   2. No subject — schedule events are not about a specific entity.
 *   3. schedule_type + cadence passthrough verbatim.
 *   4. Actor passthrough (worker:<id> or null).
 */

import { describe, expect, it } from "vitest"
import { buildScheduleCreatedEvent } from "@/lib/system-events/builders"

describe("buildScheduleCreatedEvent", () => {
  it("emits info-severity created with no subject", () => {
    const evt = buildScheduleCreatedEvent({
      schedule_type: "market.scheduler",
      cadence: "daily",
      actor: "worker-abc12345",
    })
    expect(evt.source).toBe("schedule")
    expect(evt.event_type).toBe("created")
    expect(evt.severity).toBe("info")
    expect("subject_kind" in evt).toBe(false)
    expect("subject_id" in evt).toBe(false)
    expect(evt.actor).toBe("worker-abc12345")
    expect(evt.payload).toEqual({
      schedule_type: "market.scheduler",
      cadence: "daily",
    })
  })

  it("cadence string passes through verbatim — no unit parsing", () => {
    // The worker formats `${intervalMs/60_000}m` before calling.
    // The builder does NOT validate or canonicalise the string.
    const evt = buildScheduleCreatedEvent({
      schedule_type: "ai-runs-sweeper",
      cadence: "30m",
    })
    expect(evt.payload.cadence).toBe("30m")
  })

  it("schedule_type passes through with any value", () => {
    // The builder is forward-compatible with future schedule types
    // that haven't been wired yet.
    const evt = buildScheduleCreatedEvent({
      schedule_type: "future-schedule-type-xyz",
      cadence: "1h",
    })
    expect(evt.payload.schedule_type).toBe("future-schedule-type-xyz")
  })

  it("actor null/undefined both flatten to undefined", () => {
    expect(
      buildScheduleCreatedEvent({
        schedule_type: "x",
        cadence: "y",
        actor: null,
      }).actor,
    ).toBeUndefined()
    expect(
      buildScheduleCreatedEvent({
        schedule_type: "x",
        cadence: "y",
      }).actor,
    ).toBeUndefined()
  })
})
