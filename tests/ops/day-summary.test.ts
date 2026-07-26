/**
 * «ملخّص اليوم» — the computed header line on `/admin/ops`.
 *
 * It replaced a fixed marketing sentence, so the ONE thing it must never do is
 * become fixed again: every state below produces different text, and the three
 * "we couldn't read it" states are phrased as failures rather than as calm
 * zeros. That distinction — absence is not success — is the governing rule of
 * `lib/ops/`, and a summary that flattened it would undo the whole layer.
 */

import { describe, it, expect } from "vitest"
import { deriveDaySummary } from "@/lib/ops/day-summary"
import type { Agenda, AgendaItem } from "@/lib/ops/agenda"
import type { SystemHealth } from "@/lib/ops/home-metrics"

const NOW = Date.parse("2026-07-26T12:00:00.000Z")

const health = (over: Partial<SystemHealth> = {}): SystemHealth => ({
  level: "healthy",
  issues: [],
  allSectionsOk: true,
  workerAlive: true,
  hasCritical: false,
  ...over,
})

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  kind: "recording",
  id: "eir-1",
  title: "حلقة",
  due_at: new Date(NOW + 2 * 86_400_000).toISOString(),
  subject_kind: null,
  subject_id: null,
  overdue: false,
  kindLabel: "تصوير",
  href: "/admin/khat-brain/episodes/eir-1?tab=recording",
  ...over,
})

const agenda = (items: AgendaItem[]): Agenda => ({ items, hasMore: false })

const run = (over: Parameters<typeof deriveDaySummary>[0]) =>
  deriveDaySummary({ now: NOW, ...over })

// ─── The three clauses, always present and in order ──────────────────

describe("shape", () => {
  it("is always inbox → agenda → health, joined by « · »", () => {
    const s = run({ inboxTotal: 0, agenda: agenda([]), health: health() })
    expect(s.clauses.map((c) => c.key)).toEqual(["inbox", "agenda", "health"])
    expect(s.text).toBe(s.clauses.map((c) => c.text).join(" · "))
  })
})

// ─── Inbox clause ────────────────────────────────────────────────────

describe("الوارد clause", () => {
  it("says nothing is waiting when the inbox is genuinely empty", () => {
    const s = run({ inboxTotal: 0, agenda: agenda([]), health: health() })
    expect(s.clauses[0].text).toBe("ما فيه وارد جديد")
  })

  it("counts with Arabic singular / dual / plural agreement", () => {
    const at = (n: number) =>
      run({ inboxTotal: n, agenda: agenda([]), health: health() }).clauses[0].text
    expect(at(1)).toBe("طلب واحد بانتظارك")
    expect(at(2)).toBe("طلبان بانتظارك")
    expect(at(3)).toBe("3 طلبات بانتظارك")
    expect(at(15)).toBe("15 طلب بانتظارك")
  })

  it("reports an UNREADABLE inbox as unreadable, never as zero", () => {
    const s = run({ inboxTotal: null, agenda: agenda([]), health: health() })
    expect(s.clauses[0].text).toBe("تعذّر قراءة الوارد")
    expect(s.text).not.toContain("ما فيه وارد جديد")
  })
})

// ─── Agenda clause ───────────────────────────────────────────────────

describe("الأيام الجاية clause", () => {
  it("names the nearest commitment and how far off it is", () => {
    const s = run({ inboxTotal: 0, agenda: agenda([item()]), health: health() })
    expect(s.clauses[1].text).toBe("تصوير بعد يومين")
  })

  it("reads the FIRST item — the list is already sorted ascending", () => {
    const s = run({
      inboxTotal: 0,
      agenda: agenda([
        item({ kindLabel: "متابعة", due_at: new Date(NOW + 30 * 60_000).toISOString() }),
        item({ due_at: new Date(NOW + 5 * 86_400_000).toISOString() }),
      ]),
      health: health(),
    })
    expect(s.clauses[1].text).toBe("متابعة خلال ساعة")
  })

  it("crosses from «خلال ساعة» to «بعد ساعة واحدة» at exactly 60 minutes", () => {
    const at = (ms: number) =>
      run({
        inboxTotal: 0,
        agenda: agenda([item({ due_at: new Date(NOW + ms).toISOString() })]),
        health: health(),
      }).clauses[1].text
    expect(at(59 * 60_000)).toBe("تصوير خلال ساعة")
    expect(at(60 * 60_000)).toBe("تصوير بعد ساعة واحدة")
  })

  it("says «متأخر» rather than a negative duration", () => {
    const s = run({
      inboxTotal: 0,
      agenda: agenda([
        item({ overdue: true, due_at: new Date(NOW - 4 * 86_400_000).toISOString() }),
      ]),
      health: health(),
    })
    expect(s.clauses[1].text).toBe("تصوير متأخر")
  })

  it("says there is nothing due when the agenda is empty", () => {
    const s = run({ inboxTotal: 0, agenda: agenda([]), health: health() })
    expect(s.clauses[1].text).toBe("ما فيه مواعيد قريبة")
  })

  it("reports an UNREADABLE agenda as unreadable, never as empty", () => {
    const s = run({ inboxTotal: 0, agenda: null, health: health() })
    expect(s.clauses[1].text).toBe("تعذّر قراءة المواعيد")
    expect(s.text).not.toContain("ما فيه مواعيد قريبة")
  })
})

// ─── Health clause ───────────────────────────────────────────────────

describe("system-state clause", () => {
  it("says all clear only when health is actually healthy", () => {
    const s = run({ inboxTotal: 0, agenda: agenda([]), health: health() })
    expect(s.clauses[2].text).toBe("كل الأنظمة سليمة")
  })

  it("flags a CRITICAL alert as production stopped", () => {
    const s = run({
      inboxTotal: 0,
      agenda: agenda([]),
      health: health({ level: "attention", hasCritical: true, issues: [{ label: "x", value: "" }] }),
    })
    expect(s.clauses[2].text).toBe("الإنتاج متوقف — يحتاج تدخّل الآن")
  })

  it("flags a confirmed-dead worker the same way, with no critical alert", () => {
    const s = run({
      inboxTotal: 0,
      agenda: agenda([]),
      health: health({ level: "attention", workerAlive: false, issues: [{ label: "x", value: "" }] }),
    })
    expect(s.clauses[2].text).toBe("الإنتاج متوقف — يحتاج تدخّل الآن")
  })

  it("does not claim health when a section failed to load", () => {
    const s = run({
      inboxTotal: 0,
      agenda: agenda([]),
      health: health({ level: "unknown", allSectionsOk: false, workerAlive: null }),
    })
    expect(s.clauses[2].text).toBe("تعذّر التأكد من حالة الأنظمة")
  })

  it("reports an amber system as needing attention", () => {
    const s = run({
      inboxTotal: 0,
      agenda: agenda([]),
      health: health({ level: "attention", issues: [{ label: "مهمتان متعثّرتان", value: "" }] }),
    })
    expect(s.clauses[2].text).toBe("فيه ما يحتاج انتباهك")
  })
})

// ─── The whole point: it is never the same sentence twice ────────────

describe("the summary is genuinely computed, not decoration", () => {
  it("produces a different sentence for a busy day than for a quiet one", () => {
    const quiet = run({ inboxTotal: 0, agenda: agenda([]), health: health() }).text
    const busy = run({
      inboxTotal: 3,
      agenda: agenda([item({ overdue: true })]),
      health: health({ level: "attention", hasCritical: true, issues: [{ label: "x", value: "" }] }),
    }).text
    expect(busy).not.toBe(quiet)
    expect(busy).toBe("3 طلبات بانتظارك · تصوير متأخر · الإنتاج متوقف — يحتاج تدخّل الآن")
  })

  it("degrades every clause independently when all three sources fail", () => {
    const s = run({
      inboxTotal: null,
      agenda: null,
      health: health({ level: "unknown", allSectionsOk: false, workerAlive: null }),
    })
    expect(s.text).toBe(
      "تعذّر قراءة الوارد · تعذّر قراءة المواعيد · تعذّر التأكد من حالة الأنظمة",
    )
  })
})
