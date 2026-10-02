/**
 * The review tab's honest state, read from `insight_stats`. With no card it
 * used to render nothing at all — every one of these states was a blank tab.
 */
import { describe, it, expect } from "vitest"
import { insightRunNotices, pendingApprovalLabel } from "@/lib/preparation/v2/insight-review"

type Stats = Parameters<typeof insightRunNotices>[0]
const s = (o: Partial<NonNullable<Stats>>): Stats => ({
  drafted: 0, kept: 0, grounded: 0, capped: false, grounding_failed: 0, outcome: "ok", ...o,
})
const texts = (st: Stats, n = 0) => insightRunNotices(st, n).map((x) => x.text)

describe("insightRunNotices", () => {
  it("provider outage: says how many grounding calls failed, as an error", () => {
    const n = insightRunNotices(s({ drafted: 30, grounded: 15, capped: true, grounding_failed: 15, outcome: "degraded" }), 0)
    expect(n.map((x) => x.text)).toContain("فشل التحقق من 15 من 15 (مزوّد البحث)")
    expect(n.find((x) => x.text.startsWith("فشل"))?.tone).toBe("error")
    // A failed call is not "no sufficient sources".
    expect(n.some((x) => x.text.startsWith("لم تجتز"))).toBe(false)
  })

  it("budget cut: reports the drafts dropped by the limit", () => {
    expect(texts(s({ drafted: 30, grounded: 15, capped: true, kept: 6 }), 6)).toEqual([
      "تم تجاوز 15 مسودة بسبب الحد (15)",
    ])
  })

  it("nothing drafted / skipped / errored / never ran each say so", () => {
    expect(texts(s({}))).toEqual(["لم تُولَّد بطاقات — لم يقترح النموذج أي بطاقة"])
    expect(texts(s({ outcome: "skipped" }))[0]).toMatch(/^لم تُولَّد بطاقات/)
    expect(texts(s({ outcome: "error" }))[0]).toMatch(/^تعذّر توليد البطاقات/)
    expect(texts(undefined)).toEqual(["لم تُولَّد بطاقات لهذا التحضير"])
  })

  it("all refuted (no outage) is reported as unsupported, not as a failure", () => {
    expect(texts(s({ drafted: 4, grounded: 4 }))).toEqual([
      "لم تجتز أي بطاقة التحقق — 4 مسودات بلا مصادر كافية",
    ])
  })

  it("a clean run with cards says nothing (negative control)", () => {
    expect(texts(s({ drafted: 8, grounded: 8, kept: 5 }), 5)).toEqual([])
    expect(texts(undefined, 3)).toEqual([])
  })

  it("old payloads without grounding_failed still render", () => {
    const legacy = { drafted: 4, kept: 0, grounded: 4, capped: false, outcome: "ok" } as Stats
    expect(texts(legacy)).toHaveLength(1)
  })
})

describe("pendingApprovalLabel", () => {
  it("counts pending cards with correct Arabic agreement", () => {
    expect(pendingApprovalLabel(14)).toBe("14 بطاقة بانتظار اعتمادك")
    expect(pendingApprovalLabel(3)).toBe("3 بطاقات بانتظار اعتمادك")
    expect(pendingApprovalLabel(1)).toBe("بطاقة واحدة بانتظار اعتمادك")
    expect(pendingApprovalLabel(0)).toBeNull()
  })
})
