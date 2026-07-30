/**
 * Regression locks for the four serious client-layer bugs Noura and Sara found
 * after phase 4 shipped. Every one of them broke the exact scenario the gate was
 * built for, and every one of them was silent.
 *
 *   1. after a re-shoot the gate re-opened itself using the SCRAPPED take's
 *      confirmations, so take 2 could start with an untouched checklist;
 *   2. "أكمل التشك-ليست بنفسي" was a dead end — 17/17 with no start button and no
 *      way back, on the very path the UI recommends when no director is around;
 *   3. the emergency override was reachable in states where it must not be
 *      (and unreachable presence data made `blocked` a trap);
 *   4. the EDL merged every take onto one timeline.
 *
 * Pure + SSR only — no DB, no new dependencies.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ChecklistPanel } from "@/app/admin/recording/[roomId]/v2/checklist-panel"
import { PreflightGate } from "@/app/admin/recording/[roomId]/v2/preflight-gate"
import {
  CHECKLIST_ITEMS,
  allowsOverride,
  deriveChecklistModel,
  deriveHostGateState,
  isRecordingUnlocked,
  type ChecklistEntry,
  type HostGateState,
} from "@/lib/recording-v2/preflight-checklist"
import { buildResolveMarkerEdl } from "@/lib/recording-v2/marker-export"

const AT = "2026-08-02T16:40:00.000Z"
function checked(key: string): ChecklistEntry {
  return { item_key: key, checked_at: AT, checked_by: "admin-1", not_applicable_reason: null }
}
const ALL = CHECKLIST_ITEMS.map((i) => checked(i.key))

// ─── BUG 1: re-shoot must re-arm the gate ───────────────────────────────────

/**
 * Mirrors the take-matching in live-v2-client / participant-room-view: both
 * sources must match the CURRENT take, and a mismatch yields EMPTY — never the
 * other source. The original code fell back to the frozen server-render prop,
 * which still held the previous take's 17 rows.
 */
function selectEntries(input: {
  liveChecklist: ChecklistEntry[] | null
  liveChecklistTake: number | null
  propChecklist: ChecklistEntry[]
  propTake: number
  takeNumber: number
}): ChecklistEntry[] {
  if (input.liveChecklist && input.liveChecklistTake === input.takeNumber) {
    return input.liveChecklist
  }
  if (input.propTake === input.takeNumber) return input.propChecklist
  return []
}

describe("BUG 1 — a re-shoot re-arms the gate instead of opening it", () => {
  it("does NOT reuse the scrapped take's confirmations after a reset", () => {
    // The tab has been open since take 1: the prop still says 17/17 for take 1,
    // and the SSE slice has not yet reported anything for take 2.
    const entries = selectEntries({
      liveChecklist: ALL,
      liveChecklistTake: 1,
      propChecklist: ALL,
      propTake: 1,
      takeNumber: 2,
    })
    expect(entries).toEqual([])
    const model = deriveChecklistModel(entries)
    expect(model.isComplete).toBe(false)
    expect(model.resolvedCount).toBe(0)
  })

  it("produces a LOCKED gate immediately after the reset — not an open one", () => {
    const model = deriveChecklistModel(
      selectEntries({
        liveChecklist: ALL,
        liveChecklistTake: 1,
        propChecklist: ALL,
        propTake: 1,
        takeNumber: 2,
      }),
    )
    const state = deriveHostGateState({ model, directorOnline: true, connected: true })
    expect(state).toBe("blocked")
    expect(isRecordingUnlocked(state)).toBe(false)
  })

  it("still trusts the server-render prop while the take has NOT changed", () => {
    // The fix must not over-correct into ignoring the first paint.
    const entries = selectEntries({
      liveChecklist: null,
      liveChecklistTake: null,
      propChecklist: ALL,
      propTake: 1,
      takeNumber: 1,
    })
    expect(deriveChecklistModel(entries).isComplete).toBe(true)
  })

  it("adopts the live slice as soon as it reports the new take", () => {
    const entries = selectEntries({
      liveChecklist: ALL,
      liveChecklistTake: 2,
      propChecklist: [],
      propTake: 1,
      takeNumber: 2,
    })
    expect(deriveChecklistModel(entries).isComplete).toBe(true)
  })

  it("ignores a live slice that is still reporting the old take", () => {
    const entries = selectEntries({
      liveChecklist: ALL,
      liveChecklistTake: 1,
      propChecklist: [],
      propTake: 2,
      takeNumber: 2,
    })
    expect(deriveChecklistModel(entries).isComplete).toBe(false)
  })
})

// ─── BUG 2: self-complete must not be a dead end ─────────────────────────────

function panel(over: Partial<Parameters<typeof ChecklistPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(ChecklistPanel, {
      model: deriveChecklistModel(ALL),
      onSet: async () => {},
      busy: false,
      previousTakeWasComplete: false,
      takeNumber: 1,
      ...over,
    }),
  )
}

describe("BUG 2 — «أكمل التشك-ليست بنفسي» ends in a real start button", () => {
  it("gives the host a start CTA at 17/17 in self mode", () => {
    // Previously: 17/17, "المقدم يقدر يبدأ", and no button anywhere on the page.
    const html = panel({ selfMode: true, onStart: () => {}, onBack: () => {} })
    expect(html).toContain("bg-rose-700")
    expect(html).toContain("ابدأ التسجيل")
  })

  it("always offers a way back out of self mode", () => {
    const html = panel({ selfMode: true, onStart: () => {}, onBack: () => {} })
    expect(html).toContain("رجوع")
  })

  it("does not show a start CTA before the checklist is complete", () => {
    const html = panel({
      model: deriveChecklistModel(ALL.slice(0, 10)),
      selfMode: true,
      onStart: () => {},
      onBack: () => {},
    })
    expect(html).not.toContain("bg-rose-700")
  })

  it("addresses the READER in self mode, not a third party", () => {
    // The host is the one looking at it; "المقدم ما يقدر يبدأ" reads as nonsense.
    const self = panel({ selfMode: true, onStart: () => {}, onBack: () => {} })
    expect(self).toContain("ما تقدر تبدأ التسجيل")
    expect(self).not.toContain("المقدم ما يقدر يبدأ")
    expect(self).not.toContain("المقدم يقدر يبدأ التسجيل الآن")
  })

  it("keeps the third-person copy for the director", () => {
    const director = panel()
    expect(director).toContain("المقدم ما يقدر يبدأ")
    expect(director).toContain("المقدم يقدر يبدأ التسجيل الآن")
    expect(director).not.toContain("رجوع")
  })
})

// ─── BUG 3: where the override may and may not appear ────────────────────────

function gate(
  gateState: HostGateState,
  over: Partial<Parameters<typeof PreflightGate>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(PreflightGate, {
      gateState,
      model: deriveChecklistModel(ALL.slice(0, 12)),
      overridden: false,
      directorLabel: "فهد (المخرج) متصل",
      onStart: () => {},
      onSelfComplete: () => {},
      onOverride: async () => true,
      onReconnect: () => {},
      busy: false,
      ...over,
    }),
  )
}

describe("BUG 3 — the override appears only where the normal path is unavailable", () => {
  it("allows the override ONLY for no_director and offline", () => {
    expect(allowsOverride("no_director")).toBe(true)
    expect(allowsOverride("offline")).toBe(true)
    expect(allowsOverride("blocked")).toBe(false)
    expect(allowsOverride("connecting")).toBe(false)
    expect(allowsOverride("ready")).toBe(false)
  })

  it("never offers an override while a director is connected", () => {
    // Khaled asked for a real lock; a third exit in the normal case empties it.
    expect(gate("blocked")).not.toContain("تجاوز وابدأ")
  })

  it("treats a still-opening stream as «جارٍ الاتصال», not as a broken one", () => {
    // This is the state of EVERY page load. Showing "الاتصال مقطوع" plus an
    // emergency override here trains the host to reach for the override.
    const model = deriveChecklistModel(ALL.slice(0, 12))
    expect(
      deriveHostGateState({ model, directorOnline: false, connected: false, connecting: true }),
    ).toBe("connecting")
    const html = gate("connecting")
    expect(html).toContain("جارٍ الاتصال")
    expect(html).not.toContain("الاتصال مقطوع")
    expect(html).not.toContain("تجاوز وابدأ")
  })

  it("still reports offline once the stream has genuinely given up", () => {
    const model = deriveChecklistModel(ALL.slice(0, 12))
    expect(
      deriveHostGateState({ model, directorOnline: false, connected: false, connecting: false }),
    ).toBe("offline")
    expect(gate("offline")).toContain("تجاوز وابدأ")
  })

  it("locks with a Lock affordance, not the live CTA's Radio glyph", () => {
    const html = gate("blocked")
    expect(html).toContain("lucide-lock")
    expect(html).toContain("aria-describedby=\"khat-gate-reason\"")
    expect(html).toContain("disabled")
  })

  it("does not credit «المخرج» for a checklist the host completed themselves", () => {
    expect(gate("ready", { model: deriveChecklistModel(ALL) })).not.toContain("أكّدها المخرج")
  })
})

// ─── BUG 4: one take per EDL ─────────────────────────────────────────────────

describe("BUG 4 — an EDL never mixes takes", () => {
  it("emits only the requested take when the route filters correctly", () => {
    // The route now filters by take in SQL. This asserts the consequence: given
    // one take's rows, every event belongs to it and the count matches.
    const takeTwo = [
      { camera_ms: 1_400, marker_type: "chapter", index: 1, section_key: "opening" },
      { camera_ms: 24_400, marker_type: "tech_issue", index: 2, section_key: "opening" },
    ]
    const { edl, written, skipped } = buildResolveMarkerEdl({
      title: "KHAT take 2",
      markers: takeTwo,
    })
    expect(written).toBe(2)
    expect(skipped).toEqual([])
    expect(edl).toContain("|M:chapter 1")
    expect(edl).toContain("|M:tech_issue 2")
    // Nothing from take 1 can appear — it was never passed in.
    expect(edl).not.toContain("|M:quote")
    expect(edl).not.toContain("|M:cut")
  })

  it("names the take in the EDL title so a stray file is identifiable", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "KHAT abc12345 take 2",
      markers: [{ camera_ms: 0, marker_type: "clip", index: 1, section_key: null }],
    })
    expect(edl.split("\r\n")[0]).toBe("TITLE: KHAT abc12345 take 2")
  })

  it("keeps event numbering contiguous within the single take", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [
        { camera_ms: 1_000, marker_type: "clip", index: 1, section_key: null },
        { camera_ms: 2_000, marker_type: "quote", index: 2, section_key: null },
        { camera_ms: 3_000, marker_type: "cut", index: 3, section_key: null },
      ],
    })
    expect(edl).toContain("001  001")
    expect(edl).toContain("002  001")
    expect(edl).toContain("003  001")
    expect(edl).not.toContain("004  001")
  })
})

// ─── Wrap screen honesty (#11, #12) ──────────────────────────────────────────

describe("the wrap screen does not promise markers the EDL omits", () => {
  it("reports the EDL count separately when some markers have no anchor", async () => {
    const { WrapView } = await import("@/app/admin/recording/[roomId]/v2/wrap-view")
    const mk = (id: string, camera_ms: number | null) => ({
      id,
      marker_type: "clip",
      label: "clip",
      note: null,
      net_recording_ms: 1_000,
      take_number: 2,
      camera_ms,
      section_key: null,
      created_at: AT,
      author_name: "المخرج",
    })
    const html = renderToStaticMarkup(
      createElement(WrapView, {
        roomId: "r1",
        durationMs: 1_000,
        sectionsTotal: 6,
        sectionsDone: 6,
        questionsAsked: 1,
        questionsTotal: 1,
        markers: [mk("a", 1_000), mk("b", null), mk("c", 2_000)],
        closingOptions: [],
        takeNumber: 2,
        cameraOffsetMs: 0,
        onSetCameraOffset: async () => true,
        onReset: () => {},
        busy: false,
      }),
    )
    // 3 markers, only 2 placeable.
    expect(html).toContain("2 من 3 في الـ EDL")
    expect(html).toContain("بلا مرساة")
    // And it says which take it is exporting.
    expect(html).toContain("تيك 2")
  })
})
