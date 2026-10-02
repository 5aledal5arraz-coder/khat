/**
 * «زوار الموقع» card — SSR render (no jsdom): ready, empty and unreadable
 * states, the privacy note, and RTL-safe classes.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect } from "vitest"
import { VisitorsSection } from "@/app/admin/ops/_components/visitors-section"
import { deriveVisitorStats } from "@/lib/analytics/stats"

const render = (stats: Parameters<typeof VisitorsSection>[0]["stats"]) =>
  renderToStaticMarkup(createElement(VisitorsSection, { stats }))

const READY = deriveVisitorStats({
  today: "2026-10-02",
  firstDay: "2026-09-20",
  daily: [
    { day: "2026-10-01", views: 4, visitors: 2 },
    { day: "2026-10-02", views: 12, visitors: 11 },
  ],
  pages: [{ path: "/", title: null, views: 16, visitors: 13 }],
  sources: [{ source: "google", views: 3 }],
})

describe("VisitorsSection", () => {
  it("renders the windows, sparkline, top pages and sources", () => {
    const html = render(READY)
    expect(html).toContain("زوار الموقع")
    expect(html).toContain('data-visitors-state="ready"')
    expect(html).toContain("زوار اليوم")
    expect(html).toContain("زوار آخر 7 أيام")
    expect(html).toContain("زوار آخر 30 يوم")
    expect(html).toContain(">11<")
    expect(html).toContain("data-visitor-sparkline")
    expect((html.match(/<rect /g) ?? []).length).toBe(30)
    expect(html).toContain("الرئيسية")
    expect(html).toContain("قوقل")
    expect(html).toContain("20 سبتمبر 2026")
  })

  it("states how it counts, in every state", () => {
    for (const html of [render(READY), render(null), render({ ...READY, firstDay: null })]) {
      expect(html).toContain("بدون كوكيز")
      expect(html).toContain("الموظفين والروبوتات مستبعدين")
    }
    expect(render(READY)).toContain("الزائر يُحسب مرة وحدة كل يوم")
  })

  it("has an honest empty state, not a wall of zeros", () => {
    const html = render({ ...READY, firstDay: null })
    expect(html).toContain('data-visitors-state="empty"')
    expect(html).toContain("ما في زيارات مسجّلة بعد")
    expect(html).not.toContain("data-visitor-sparkline")
  })

  it("says it could not read, never zero, when stats are null", () => {
    const html = render(null)
    expect(html).toContain('data-visitors-state="unreadable"')
    expect(html).toContain("تعذّر قراءة العدّاد")
  })

  it("uses logical properties only", () => {
    expect(render(READY)).not.toMatch(/\b(ml|mr|pl|pr|left|right)-\d/)
  })
})

describe("Arabic number agreement", () => {
  const withViews = (views: number, visitors: number, sourceViews: number) =>
    render(
      deriveVisitorStats({
        today: "2026-10-02",
        firstDay: "2026-10-02",
        daily: [{ day: "2026-10-02", views, visitors }],
        pages: [{ path: "/", title: null, views, visitors }],
        sources: [{ source: "google", views: sourceViews }],
      }),
    )

  it("never puts a digit before a dual («2 مشاهدتان», «2 زيارتان», «2 زائران»)", () => {
    const html = withViews(2, 2, 2)
    expect(html).not.toMatch(/2 (مشاهدتان|زيارتان|زائران)/)
    expect(html).toContain("مشاهدتان")
    expect(html).toContain("زيارتان")
    expect(html).toContain("زائران") // sparkline tooltip
  })

  it("1, 3 and 11 take the singular-with-adjective, plural and tamyiz forms", () => {
    expect(withViews(1, 1, 1)).toContain("مشاهدة واحدة")
    expect(withViews(1, 1, 1)).toContain("زيارة واحدة")
    expect(withViews(3, 3, 3)).toContain("3 مشاهدات")
    expect(withViews(11, 11, 11)).toContain("11 مشاهدة")
  })
})
