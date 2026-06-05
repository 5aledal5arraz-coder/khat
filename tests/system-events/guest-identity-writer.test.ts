/**
 * Phase 2.4 (P2.4.d) — guest-identity writer unit tests.
 *
 * Pure surface only. The builder is invoked by the two admin
 * link-canonical route handlers after a junction insert lands; end-to-
 * end coverage would require a DB and is intentionally deferred
 * (operator §6: API smoke skipped).
 *
 * What this file locks down:
 *   1. Source pinned to "guest-identity", event_type "linked",
 *      severity "info". Builder cannot emit a different severity.
 *   2. Subjectless — the linked junction's `kind` + ids live in the
 *      payload, not in `subject_kind` / `subject_id` (preserves the
 *      frozen P2.3 vocabulary).
 *   3. Payload passthrough: kind, junction_id, source_id, guest_id,
 *      confidence, created_guest are mirrored verbatim.
 *   4. Both `kind` discriminants ("candidate", "application") produce
 *      structurally identical events apart from the payload.kind value.
 *   5. Actor null/undefined both flatten to undefined.
 *   6. created_guest is a boolean — false (existing) and true (newly
 *      inserted) both round-trip.
 */

import { describe, expect, it } from "vitest"
import { buildGuestIdentityLinkedEvent } from "@/lib/system-events/builders"

describe("buildGuestIdentityLinkedEvent", () => {
  it("emits info-severity linked with no subject for candidate kind", () => {
    const evt = buildGuestIdentityLinkedEvent({
      kind: "candidate",
      junction_id: "junc-1",
      source_id: "cand-7",
      guest_id: "guest-42",
      confidence: "high",
      created_guest: false,
      actor: "admin:user-9",
    })
    expect(evt.source).toBe("guest-identity")
    expect(evt.event_type).toBe("linked")
    expect(evt.severity).toBe("info")
    expect("subject_kind" in evt).toBe(false)
    expect("subject_id" in evt).toBe(false)
    expect(evt.actor).toBe("admin:user-9")
    expect(evt.payload).toEqual({
      kind: "candidate",
      junction_id: "junc-1",
      source_id: "cand-7",
      guest_id: "guest-42",
      confidence: "high",
      created_guest: false,
    })
  })

  it("application kind produces structurally identical event (only payload.kind differs)", () => {
    const evt = buildGuestIdentityLinkedEvent({
      kind: "application",
      junction_id: "junc-2",
      source_id: "app-3",
      guest_id: "guest-42",
      confidence: "medium",
      created_guest: false,
    })
    expect(evt.source).toBe("guest-identity")
    expect(evt.event_type).toBe("linked")
    expect(evt.severity).toBe("info")
    expect(evt.payload.kind).toBe("application")
    expect(evt.payload.source_id).toBe("app-3")
    expect(evt.payload.confidence).toBe("medium")
  })

  it("created_guest=true round-trips for a freshly inserted canonical row", () => {
    const evt = buildGuestIdentityLinkedEvent({
      kind: "candidate",
      junction_id: "junc-3",
      source_id: "cand-8",
      guest_id: "guest-new",
      confidence: "high",
      created_guest: true,
    })
    expect(evt.payload.created_guest).toBe(true)
    expect(evt.payload.guest_id).toBe("guest-new")
  })

  it("payload.confidence is preserved verbatim for both high and medium", () => {
    const high = buildGuestIdentityLinkedEvent({
      kind: "candidate",
      junction_id: "j",
      source_id: "s",
      guest_id: "g",
      confidence: "high",
      created_guest: false,
    })
    const medium = buildGuestIdentityLinkedEvent({
      kind: "application",
      junction_id: "j",
      source_id: "s",
      guest_id: "g",
      confidence: "medium",
      created_guest: false,
    })
    expect(high.payload.confidence).toBe("high")
    expect(medium.payload.confidence).toBe("medium")
  })

  it("actor null/undefined both flatten to undefined", () => {
    expect(
      buildGuestIdentityLinkedEvent({
        kind: "candidate",
        junction_id: "j",
        source_id: "s",
        guest_id: "g",
        confidence: "high",
        created_guest: false,
        actor: null,
      }).actor,
    ).toBeUndefined()
    expect(
      buildGuestIdentityLinkedEvent({
        kind: "candidate",
        junction_id: "j",
        source_id: "s",
        guest_id: "g",
        confidence: "high",
        created_guest: false,
      }).actor,
    ).toBeUndefined()
  })

  it("admin:<id> actor convention passes through unchanged (operator §13 Q5)", () => {
    const evt = buildGuestIdentityLinkedEvent({
      kind: "application",
      junction_id: "j",
      source_id: "s",
      guest_id: "g",
      confidence: "high",
      created_guest: false,
      actor: "admin:00000000-0000-0000-0000-000000000001",
    })
    expect(evt.actor).toBe("admin:00000000-0000-0000-0000-000000000001")
  })
})
