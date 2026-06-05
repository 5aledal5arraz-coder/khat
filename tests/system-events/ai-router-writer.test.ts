/**
 * Phase 2.3 (P2.3.d) — ai-router writer unit tests.
 *
 * Pure surface only. End-to-end (router catches RateLimitError → emit
 * → DB) is exercised by smoke scenario 12 + observed manually in
 * production via `ai-router.rejected` rows during real ENFORCE blocks.
 *
 * What this file locks down:
 *   1. Source pinned to "ai-router", event_type "rejected", severity "warn".
 *   2. Subjectless — neither subject_kind nor subject_id present
 *      (operator P2.3.d §10 Q4 — no ai_run row exists at reject time).
 *   3. task_kind + reason verbatim in payload.
 *   4. actor_id passthrough when present; omitted from payload when absent
 *      so the row's payload doesn't carry a `null` actor_id key.
 */

import { describe, expect, it } from "vitest"
import { buildAiRouterRejectedEvent } from "@/lib/system-events/builders"

describe("buildAiRouterRejectedEvent — pure builder", () => {
  it("emits warn-severity, subjectless rejection", () => {
    const evt = buildAiRouterRejectedEvent({
      task_kind: "editorial",
      reason: "expensive-tier concurrency limit reached (3/3)",
      actor_id: "admin-abc",
    })
    expect(evt.source).toBe("ai-router")
    expect(evt.event_type).toBe("rejected")
    expect(evt.severity).toBe("warn")
    // Subjectless — no subject keys should appear on the row.
    expect("subject_kind" in evt).toBe(false)
    expect("subject_id" in evt).toBe(false)
    expect(evt.payload.task_kind).toBe("editorial")
    expect(evt.payload.reason).toBe("expensive-tier concurrency limit reached (3/3)")
    expect(evt.payload.actor_id).toBe("admin-abc")
  })

  it("omits actor_id from payload when undefined", () => {
    const evt = buildAiRouterRejectedEvent({
      task_kind: "structural",
      reason: "blocked by policy",
    })
    expect("actor_id" in evt.payload).toBe(false)
  })

  it("omits actor_id from payload when null (no null leakage)", () => {
    const evt = buildAiRouterRejectedEvent({
      task_kind: "structural",
      reason: "x",
      actor_id: null,
    })
    expect("actor_id" in evt.payload).toBe(false)
  })

  it("actor (row-level) and actor_id (payload) are independent", () => {
    const evt = buildAiRouterRejectedEvent({
      task_kind: "editorial",
      reason: "x",
      actor: "worker-abc",
      actor_id: "admin-xyz",
    })
    expect(evt.actor).toBe("worker-abc")
    expect(evt.payload.actor_id).toBe("admin-xyz")
  })
})
