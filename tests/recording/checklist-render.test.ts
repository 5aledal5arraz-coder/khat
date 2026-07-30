/**
 * Checklist surfaces render — the director's panel and the host's gate bar.
 *
 * SSR via `react-dom/server` (already a dependency; no jsdom, no
 * testing-library). Enough to prove both components mount and to lock the
 * contracts that are easy to regress and expensive to get wrong:
 *
 *   - the host's LOCKED bar must be amber, never rose (rose on this page means
 *     "press me to go live"),
 *   - the locked bar must NOT dump all 17 rows onto the host's screen,
 *   - the emergency override must be invisible while a director is reachable,
 *   - touch targets must stay ≥56px for a director holding a tablet,
 *   - no physical left/right classes anywhere.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ChecklistPanel } from "@/app/admin/recording/[roomId]/v2/checklist-panel"
import { PreflightGate } from "@/app/admin/recording/[roomId]/v2/preflight-gate"
import {
  CHECKLIST_ITEMS,
  deriveChecklistModel,
  type ChecklistEntry,
  type HostGateState,
} from "@/lib/recording-v2/preflight-checklist"

const AT = "2026-08-02T16:40:00.000Z"
function checked(key: string): ChecklistEntry {
  return { item_key: key, checked_at: AT, checked_by: "admin-1", not_applicable_reason: null }
}
const EMPTY = deriveChecklistModel([])
const COMPLETE = deriveChecklistModel(CHECKLIST_ITEMS.map((i) => checked(i.key)))
const PARTIAL = deriveChecklistModel(CHECKLIST_ITEMS.slice(0, 12).map((i) => checked(i.key)))

function panel(over: Partial<Parameters<typeof ChecklistPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(ChecklistPanel, {
      model: EMPTY,
      onSet: async () => {},
      busy: false,
      previousTakeWasComplete: false,
      takeNumber: 1,
      ...over,
    }),
  )
}

function gate(
  gateState: HostGateState,
  over: Partial<Parameters<typeof PreflightGate>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(PreflightGate, {
      gateState,
      model: gateState === "ready" ? COMPLETE : PARTIAL,
      overridden: false,
      directorLabel: "فهد (المخرج) متصل · آخر تحديث ١٤:٣٢",
      onStart: () => {},
      onSelfComplete: () => {},
      onOverride: async () => true,
      onReconnect: () => {},
      busy: false,
      ...over,
    }),
  )
}

describe("ChecklistPanel", () => {
  it("renders without throwing", () => {
    expect(panel().length).toBeGreaterThan(500)
  })

  it("shows the count as a number, not a percentage", () => {
    const html = panel({ model: PARTIAL })
    expect(html).toContain("12")
    expect(html).toContain("من")
    expect(html).not.toContain("%")
  })

  it("expands the current group and keeps later groups visible but present", () => {
    const html = panel()
    // First group's items are rendered…
    expect(html).toContain("تفريغ كروت الذاكرة من التصوير السابق ثم الفورمات")
    // …and every group heading is on screen, dimmed rather than hidden.
    expect(html).toContain("الكاميرات")
    expect(html).toContain("الصوت")
    expect(html).toContain("قبل «أكشن»")
  })

  it("carries the shared five-point camera reminder", () => {
    // Rendered only when the camera group is open, so drive the model there.
    const throughLighting = deriveChecklistModel(
      CHECKLIST_ITEMS.filter((i) => i.group === "media_power" || i.group === "light_set").map((i) =>
        checked(i.key),
      ),
    )
    const html = panel({ model: throughLighting })
    expect(html).toContain("الكادر")
    expect(html).toContain("الكارت والبطارية")
  })

  it("spells out Black Mist on screen, not only in a hover tooltip", () => {
    // A director on a tablet cannot hover; hover-only info would be lost.
    const throughLighting = deriveChecklistModel(
      CHECKLIST_ITEMS.filter((i) => i.group === "media_power" || i.group === "light_set").map((i) =>
        checked(i.key),
      ),
    )
    const html = panel({ model: throughLighting })
    expect(html).toContain("Black Mist")
  })

  it("keeps every touch target at least 56px tall", () => {
    // NOT the 8px energy-dot pattern — this is a standing operator, one-handed.
    const html = panel()
    expect(html).toContain("min-h-[56px]")
    expect(html).not.toContain("h-2 w-2")
  })

  it("announces the reset on a re-shoot with context about the previous take", () => {
    const html = panel({ takeNumber: 2, previousTakeWasComplete: true })
    expect(html).toContain("هذا التيك")
    expect(html).toContain("التيك السابق كان مؤكّداً بالكامل")
  })

  it("says so when the previous take was NOT complete", () => {
    const html = panel({ takeNumber: 3, previousTakeWasComplete: false })
    expect(html).toContain("التيك السابق ما كان مكتملاً")
  })

  it("shows no take banner on take 1", () => {
    expect(panel({ takeNumber: 1 })).not.toContain("هذا التيك")
  })

  it("tells the director the host is unblocked once complete", () => {
    expect(panel({ model: COMPLETE })).toContain("المقدم يقدر يبدأ التسجيل الآن")
  })

  it("offers «غير منطبق» on unresolved rows", () => {
    expect(panel()).toContain("غير منطبق")
  })

  it("uses RTL logical properties only", () => {
    expect(/class="[^"]*\b(ml-|mr-|left-|right-|pl-|pr-)/.test(panel())).toBe(false)
  })
})

describe("PreflightGate — locked", () => {
  it("is AMBER, not rose: rose on this page means «press me to go live»", () => {
    const html = gate("blocked")
    expect(html).toContain("amber")
    expect(html).not.toContain("bg-rose-700")
  })

  it("names the blocking GROUP and the count, not all 17 rows", () => {
    // The 17 rows are the director's job. The host is reading the thesis.
    // 12 resolved = media_power(3) + light_set(3) + cameras(5) + matching(1),
    // so the first unresolved group is «الصوت».
    const html = gate("blocked")
    expect(html).toContain("جاهزية الاستوديو 12 من 17")
    expect(html).toContain("الصوت")
    expect(html).not.toContain("تفريغ كروت الذاكرة من التصوير السابق ثم الفورمات")
    expect(html).not.toContain("التكييف مضبوط ومو مسموع في التسجيل")
    expect(html).not.toContain("المايكات")
  })

  it("tells the host WHO to shout at and when they last touched it", () => {
    expect(gate("blocked")).toContain("فهد (المخرج) متصل · آخر تحديث ١٤:٣٢")
  })

  it("hides the emergency override while a director is reachable", () => {
    // An override must never be a general shortcut past the checklist.
    expect(gate("blocked")).not.toContain("تجاوز وابدأ")
  })
})

describe("PreflightGate — no director", () => {
  it("prefers «أكمل التشك-ليست بنفسي» over the override", () => {
    const html = gate("no_director")
    expect(html).toContain("أكمل التشك-ليست بنفسي")
    expect(html).toContain("ما فيه مخرج متصل الآن")
  })

  it("exposes the override only in this state", () => {
    expect(gate("no_director")).toContain("تجاوز وابدأ")
  })
})

describe("PreflightGate — offline", () => {
  it("admits it cannot verify rather than claiming the studio is not ready", () => {
    const html = gate("offline")
    expect(html).toContain("الاتصال مقطوع")
    expect(html).toContain("ما نقدر نتأكد من التشك-ليست")
  })

  it("offers the manual reconnect that did not exist before", () => {
    // After MAX_RETRIES the stream was terminal, so the gate could never unlock.
    expect(gate("offline")).toContain("إعادة الاتصال")
  })

  it("still offers the escape hatches", () => {
    const html = gate("offline")
    expect(html).toContain("أكمل التشك-ليست بنفسي")
    expect(html).toContain("تجاوز وابدأ")
  })
})

describe("PreflightGate — ready", () => {
  it("restores the original rose CTA untouched", () => {
    // The host's muscle memory for the one button that starts a shoot must not
    // move or change colour.
    const html = gate("ready")
    expect(html).toContain("bg-rose-700")
    expect(html).toContain("ابدأ التسجيل")
  })

  it("confirms readiness quietly — no animation, no sound", () => {
    const html = gate("ready")
    expect(html).toContain("الاستوديو جاهز")
    expect(html).not.toContain("animate-")
    expect(html).not.toContain("<audio")
  })

  it("hides the escape hatches when the checklist is genuinely complete", () => {
    const html = gate("ready")
    expect(html).not.toContain("تجاوز وابدأ")
    expect(html).not.toContain("أكمل التشك-ليست بنفسي")
  })
})

describe("PreflightGate — overridden", () => {
  it("unlocks the CTA and says the override is on record", () => {
    const html = gate("no_director", { overridden: true })
    expect(html).toContain("bg-rose-700")
    expect(html).toContain("تم التجاوز")
    expect(html).toContain("مسجّل في علامات الحلقة")
  })

  it("does not claim the studio is ready when it was overridden", () => {
    expect(gate("no_director", { overridden: true })).not.toContain("الاستوديو جاهز")
  })
})
