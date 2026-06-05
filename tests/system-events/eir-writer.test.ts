/**
 * Phase 2.3 (P2.3.b) — buildEirTransitionEvent unit tests.
 *
 * Pure surface only. DB roundtrip (service → emit → INSERT) is
 * exercised by `scripts/smoke-system-events.ts` in the same sub-phase.
 *
 * What this file locks down:
 *   1. Creation case — from_phase null, to_phase = "idea".
 *   2. Legal forward transition — from_phase + to_phase passthrough.
 *   3. Archive escape — `to_phase: 'archived'` from any prior phase
 *      produces a normal info event (the writer is dumb; legality is
 *      established by the service-layer guard, not by the builder).
 *   4. Actor passthrough — verbatim, no `eir-service:` prefixing
 *      (operator §13 Q3 — recommended default accepted).
 *   5. Actor coercion — null/undefined both produce `actor: undefined`
 *      on the output, which the emit helper coerces to DB NULL.
 *   6. Payload shape lock — exactly `{ from_phase, to_phase }`,
 *      no extra keys.
 *   7. Discriminated-union pinning — severity is "info" at the type
 *      layer; assert literally to catch any future widening.
 */

import { describe, expect, it } from "vitest"
import { buildEirTransitionEvent } from "@/lib/system-events/builders"

describe("buildEirTransitionEvent — pure builder", () => {
  it("creation case: from_phase=null, to_phase='idea'", () => {
    const evt = buildEirTransitionEvent({
      eir_id: "eir-creation-1",
      from_phase: null,
      to_phase: "idea",
    })
    expect(evt.source).toBe("eir")
    expect(evt.event_type).toBe("transition")
    expect(evt.severity).toBe("info")
    expect(evt.subject_kind).toBe("episode_intelligence_record")
    expect(evt.subject_id).toBe("eir-creation-1")
    expect(evt.payload).toEqual({ from_phase: null, to_phase: "idea" })
    expect(evt.actor).toBeUndefined()
  })

  it("legal forward transition: idea → guest_assigned", () => {
    const evt = buildEirTransitionEvent({
      eir_id: "eir-1",
      from_phase: "idea",
      to_phase: "guest_assigned",
    })
    expect(evt.payload).toEqual({
      from_phase: "idea",
      to_phase: "guest_assigned",
    })
    expect(evt.severity).toBe("info")
  })

  it("archive escape: published → archived still emits a normal info event", () => {
    // The builder is intentionally dumb about legality — legality is
    // enforced by assertAllowedTransition in the service before this
    // builder is reached. If the builder is called, the move was legal.
    const evt = buildEirTransitionEvent({
      eir_id: "eir-2",
      from_phase: "published",
      to_phase: "archived",
    })
    expect(evt.severity).toBe("info")
    expect(evt.payload.from_phase).toBe("published")
    expect(evt.payload.to_phase).toBe("archived")
  })

  it("actor passthrough: verbatim, no eir-service: prefix", () => {
    const evt = buildEirTransitionEvent({
      eir_id: "eir-3",
      from_phase: "idea",
      to_phase: "guest_assigned",
      actor: "admin-abc123",
    })
    expect(evt.actor).toBe("admin-abc123")
  })

  it("actor coercion: null → undefined", () => {
    const evt = buildEirTransitionEvent({
      eir_id: "eir-4",
      from_phase: "idea",
      to_phase: "guest_assigned",
      actor: null,
    })
    expect(evt.actor).toBeUndefined()
  })

  it("actor coercion: undefined stays undefined", () => {
    const evt = buildEirTransitionEvent({
      eir_id: "eir-5",
      from_phase: "idea",
      to_phase: "guest_assigned",
    })
    expect(evt.actor).toBeUndefined()
  })

  it("payload shape lock: exactly two keys, no leakage", () => {
    const evt = buildEirTransitionEvent({
      eir_id: "eir-6",
      from_phase: "idea",
      to_phase: "guest_assigned",
      actor: "x",
    })
    expect(Object.keys(evt.payload).sort()).toEqual(["from_phase", "to_phase"])
  })
})
