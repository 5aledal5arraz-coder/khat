/**
 * The host cockpit's derivations (lib/recording-v2/live-sync.ts).
 *
 * Each one replaces a bug found in the 2026-09-28 host walkthrough, and each
 * test is written against the failure it prevents, not against the happy path:
 *   - the host's clock was private, so a take the director started never
 *     reached him and his own late "start" zeroed his clock;
 *   - a rejected pause left the screen claiming a pause the server never made;
 *   - the section was tracked by index, so a live prep edit moved the host;
 *   - leaving a section with a «أساسي» unasked was silent;
 *   - a live edit to the question on screen swapped it silently.
 */

import { describe, expect, it } from "vitest"
import {
  formatMinSec,
  isTypingTarget,
  pinnedQuestionEdited,
  relevantSensitiveZone,
  sectionIndexFor,
  sectionTime,
  shortcutFor,
  shouldApplyRoomRow,
  transportAfterAction,
  transportFromRoom,
  unaskedMustAsk,
  type TransportState,
} from "@/lib/recording-v2/live-sync"
import { openIntervals, CHECKLIST_OVERRIDE_LABEL } from "@/lib/recording-v2/marker-types"

const T0 = "2026-09-28T10:00:00.000Z"

describe("transportFromRoom — the host's clock comes from the shared row", () => {
  it("a take the DIRECTOR started reads as live on the host's screen", () => {
    const t = transportFromRoom({
      status: "live",
      recording_elapsed_ms: 0,
      recording_started_at: T0,
      recording_paused_at: null,
    })
    expect(t.status).toBe("live")
    expect(t.windowStartedAt).toBe(Date.parse(T0))
  })

  it("keeps the banked time — a late start must not zero a running clock", () => {
    // The bug: host pressed start after the director, got `already_started`,
    // and set his baseline to 0 while the take had run for minutes.
    const t = transportFromRoom({
      status: "live",
      recording_elapsed_ms: 125_000,
      recording_started_at: T0,
      recording_paused_at: null,
    })
    expect(t.elapsedMsAtBaseline).toBe(125_000)
  })

  it("paused: no live window, banked time only", () => {
    const t = transportFromRoom({
      status: "paused",
      recording_elapsed_ms: 60_000,
      recording_started_at: T0,
      recording_paused_at: T0,
    })
    expect(t).toEqual({ status: "paused", elapsedMsAtBaseline: 60_000, windowStartedAt: null })
  })

  it("an unknown status degrades to waiting, never to live", () => {
    expect(
      transportFromRoom({
        status: "weird",
        recording_elapsed_ms: 0,
        recording_started_at: T0,
        recording_paused_at: null,
      }).status,
    ).toBe("waiting")
  })
})

describe("shouldApplyRoomRow — optimistic only while in flight", () => {
  it("does not apply a broadcast while one of the host's requests is pending", () => {
    expect(
      shouldApplyRoomRow({ pendingOps: 1, incomingUpdatedAt: T0, lastAppliedUpdatedAt: null }),
    ).toBe(false)
  })

  it("applies once nothing is pending", () => {
    expect(
      shouldApplyRoomRow({ pendingOps: 0, incomingUpdatedAt: T0, lastAppliedUpdatedAt: null }),
    ).toBe(true)
  })

  it("refuses a row OLDER than the last applied one (a late SSE cannot rewind)", () => {
    expect(
      shouldApplyRoomRow({
        pendingOps: 0,
        incomingUpdatedAt: "2026-09-28T09:59:59.000Z",
        lastAppliedUpdatedAt: T0,
      }),
    ).toBe(false)
  })
})

describe("transportAfterAction — roll back on failure", () => {
  const before: TransportState = { status: "live", elapsedMsAtBaseline: 30_000, windowStartedAt: 1_000 }

  it("restores the pre-pause state when the server REJECTED the pause", () => {
    expect(transportAfterAction(before, { ok: false })).toEqual({ failed: true, state: before })
  })

  it("restores it when the call never answered (thrown / offline)", () => {
    expect(transportAfterAction(before, null)).toEqual({ failed: true, state: before })
  })

  it("adopts the broadcast row on success", () => {
    const r = transportAfterAction(before, {
      ok: true,
      room: {
        status: "paused",
        recording_elapsed_ms: 31_500,
        recording_started_at: T0,
        recording_paused_at: T0,
      },
    })
    expect(r).toEqual({
      failed: false,
      state: { status: "paused", elapsedMsAtBaseline: 31_500, windowStartedAt: null },
    })
  })

  it("keeps the optimistic state when the reply carries no row", () => {
    expect(transportAfterAction(before, { ok: true })).toEqual({ failed: false, state: null })
  })
})

describe("sectionIndexFor — the section is tracked by KEY", () => {
  const sections = [{ kind: "opening" }, { kind: "conflict" }, { kind: "resolution" }] as const

  it("follows the key when a live edit reorders sections", () => {
    const reordered = [{ kind: "conflict" }, { kind: "opening" }, { kind: "resolution" }] as const
    // The host was in «conflict» at index 1; after the reorder it is index 0.
    expect(sectionIndexFor([...reordered], "conflict", 1)).toBe(0)
  })

  it("falls back to the clamped index only when the key vanished", () => {
    expect(sectionIndexFor([...sections], "deep_dive", 7)).toBe(2)
    expect(sectionIndexFor([...sections], null, 1)).toBe(1)
  })
})

describe("unaskedMustAsk — leaving a section is never silent", () => {
  const qs = [
    { id: "a", section: "opening" as const, priority: "must_ask" as const },
    { id: "b", section: "opening" as const, priority: "if_time" as const },
    { id: "c", section: "opening" as const, priority: "must_ask" as const },
    { id: "d", section: "conflict" as const, priority: "must_ask" as const },
  ]

  it("lists the section's unasked «أساسي» only", () => {
    expect(unaskedMustAsk(qs, "opening", new Set(["a"])).map((q) => q.id)).toEqual(["c"])
  })

  it("is empty when every must-ask was asked", () => {
    expect(unaskedMustAsk(qs, "opening", new Set(["a", "c"]))).toEqual([])
  })
})

describe("sectionTime — «المواجهة 6:12 / 12د»", () => {
  it("is not over inside the plan", () => {
    const t = sectionTime(6 * 60_000 + 12_000, 12)
    expect(t).toMatchObject({ elapsedSec: 372, plannedMin: 12, over: false, overMin: 0 })
    expect(formatMinSec(t.elapsedSec)).toBe("6:12")
  })

  it("turns over AT 100%, and counts whole minutes past it", () => {
    expect(sectionTime(12 * 60_000, 12).over).toBe(true)
    expect(sectionTime(14 * 60_000 + 30_000, 12).overMin).toBe(2)
  })

  it("never claims over-time without a plan", () => {
    expect(sectionTime(99 * 60_000, null)).toMatchObject({ plannedMin: null, over: false })
  })
})

describe("relevantSensitiveZone — one line for a حسّاس question", () => {
  const zones = ["الطلاق — لا يُفتح", "أسماء الشركاء السابقين"]

  it("prefers the zone that shares a word with the question", () => {
    expect(relevantSensitiveZone("شركاؤك يقولون إنك ما كنت تسمع؟ وش صار مع الشركاء؟", zones)).toBe(
      "أسماء الشركاء السابقين",
    )
  })

  it("matches across hamza seat + possessive (the real prep's question)", () => {
    // Found in the browser: «شركاؤك» did not meet «الشركاء», so the host saw
    // the divorce line beside a question about his partners.
    expect(relevantSensitiveZone("شركاؤك يقولون إنك ما كنت تسمع لأحد. شنو ردك؟", zones)).toBe(
      "أسماء الشركاء السابقين",
    )
  })

  it("falls back to the first zone rather than showing nothing", () => {
    expect(relevantSensitiveZone("هل تحس إن النجاح يستاهل؟", zones)).toBe("الطلاق — لا يُفتح")
  })

  it("is null when the prep has no zones", () => {
    expect(relevantSensitiveZone("أي سؤال", [])).toBeNull()
  })
})

describe("pinnedQuestionEdited — a live edit is named, not swapped silently", () => {
  it("flags a wording change to the SAME pinned question", () => {
    expect(pinnedQuestionEdited({ id: "q1", text: "قديم" }, { id: "q1", text: "جديد" })).toBe(true)
  })

  it("stays quiet for a different question or unchanged text", () => {
    expect(pinnedQuestionEdited({ id: "q1", text: "x" }, { id: "q2", text: "y" })).toBe(false)
    expect(pinnedQuestionEdited({ id: "q1", text: "x" }, { id: "q1", text: "x" })).toBe(false)
  })
})

describe("keyboard shortcuts", () => {
  it("maps the approved keys, including the Arabic-layout twins", () => {
    expect(shortcutFor(" ")).toBe("asked")
    expect(shortcutFor("m")).toBe("flag")
    expect(shortcutFor("ة")).toBe("flag")
    expect(shortcutFor("p")).toBe("transport")
    expect(shortcutFor("n")).toBe("next")
    expect(shortcutFor("b")).toBe("prev")
    expect(shortcutFor("؟")).toBe("legend")
  })

  it("has NO key that ends the take", () => {
    // Ending is irreversible and stays a two-step touch.
    for (const k of ["e", "E", "Enter", "Escape", "End", "q", "x", "s"]) {
      expect(shortcutFor(k)).toBeNull()
    }
  })

  it("ignores keystrokes that belong to a text field", () => {
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true)
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false)
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe("checklist override is not an open fault for the director", () => {
  it("the new `checklist_override` type opens no interval", () => {
    expect(
      openIntervals([
        { marker_type: "checklist_override", net_recording_ms: 0, label: CHECKLIST_OVERRIDE_LABEL },
      ]),
    ).toEqual({})
  })

  it("a LEGACY override row (tech_issue + the label) opens no interval either", () => {
    // Before 2026-09-28 overrides were written as `tech_issue`; the director's
    // bar showed them as «انتهت المشكلة · 12:40» for a fault that never was.
    expect(
      openIntervals([
        { marker_type: "tech_issue", net_recording_ms: 0, label: CHECKLIST_OVERRIDE_LABEL },
      ]),
    ).toEqual({})
  })

  it("a REAL tech_issue still opens one", () => {
    expect(openIntervals([{ marker_type: "tech_issue", net_recording_ms: 5_000, label: "tech issue" }])).toEqual({
      tech_issue: 5_000,
    })
  })
})
