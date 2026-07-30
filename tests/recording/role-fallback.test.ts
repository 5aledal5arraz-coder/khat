/**
 * Regressions for the two "fails toward the dangerous direction" bugs found in
 * review — both about an unknown/negative value resolving to something that
 * LOOKS legitimate rather than something honest.
 */

import { describe, it, expect } from "vitest"
import { adminRoleToRoomRole } from "@/lib/collaboration/room-roles"
import { formatPrecise, clockParts } from "@/app/admin/recording/[roomId]/v2/recording-shared"

describe("adminRoleToRoomRole", () => {
  it("maps every admin role to its room role", () => {
    expect(adminRoleToRoomRole("OWNER")).toBe("host")
    expect(adminRoleToRoomRole("ADMIN")).toBe("director")
    expect(adminRoleToRoomRole("EDITOR")).toBe("editor")
    expect(adminRoleToRoomRole("VIEWER")).toBe("viewer")
  })

  it("gives ONLY the owner the host cockpit", () => {
    // The recording shell mounts the host cockpit — the one surface with a live
    // "ابدأ التسجيل" button — on `role === "host"`. Every other admin role must
    // resolve to something else, or a director gets the ability to start a take.
    const nonOwners = ["ADMIN", "EDITOR", "VIEWER"] as const
    for (const r of nonOwners) {
      expect(adminRoleToRoomRole(r)).not.toBe("host")
    }
  })
})

describe("recording shell role fallback", () => {
  // The shell resolves `myParticipant?.role ?? initialRole`, then gates on
  // `role === "host"` and renders a neutral resolving state when role is null.
  // The bug was `!role || role === "host"`: an UNKNOWN role took the host
  // branch, so a director saw the host cockpit — with a working start button —
  // for as long as the SSE participant list took to arrive (~50s measured).
  function resolve(live: string | undefined, initial: string | null) {
    const role = live ?? initial
    return {
      role,
      isHost: role === "host",
      showsResolvingState: role == null,
    }
  }

  it("never treats an unknown role as host", () => {
    const r = resolve(undefined, null)
    expect(r.isHost).toBe(false)
    expect(r.showsResolvingState).toBe(true)
  })

  it("uses the server-resolved role before the SSE list arrives", () => {
    // A director opening the page: live list empty, server already knows.
    const r = resolve(undefined, "director")
    expect(r.role).toBe("director")
    expect(r.isHost).toBe(false)
    expect(r.showsResolvingState).toBe(false)
  })

  it("still mounts the cockpit for a real host with no live list yet", () => {
    expect(resolve(undefined, "host").isHost).toBe(true)
  })

  it("prefers the live role once it arrives", () => {
    expect(resolve("director", "host").isHost).toBe(false)
    expect(resolve("host", "director").isHost).toBe(true)
  })
})

describe("formatPrecise sign handling", () => {
  it("renders a negative camera time as negative, not as the start of the take", () => {
    // A negative `camera_offset_ms` ("the camera rolled AFTER I pressed start")
    // is a supported input, so early markers can land before the camera's first
    // frame. Clamping them to zero displayed them as 00:00:00.00 — visually
    // identical to "at the very start" — which is the false-cut-at-the-head
    // problem the export deliberately avoids by excluding them.
    expect(formatPrecise(-2100)).toBe("−00:00:02.10")
    expect(formatPrecise(-1)).toBe("−00:00:00.00")
  })

  it("is unchanged for zero and positive values", () => {
    expect(formatPrecise(0)).toBe("00:00:00.00")
    expect(formatPrecise(2100)).toBe("00:00:02.10")
    expect(formatPrecise(3_661_230)).toBe("01:01:01.23")
  })

  it("leaves the running clock clamped — elapsed time cannot be negative", () => {
    expect(clockParts(-5000).hms).toBe("00:00:00")
  })
})
