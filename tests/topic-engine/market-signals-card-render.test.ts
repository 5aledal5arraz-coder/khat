/**
 * Topic-engine defects #14 + #15 on the season page card.
 *
 * #14 — the daily market schedule is off by default (Khaled is spend-
 *       sensitive). The card must say so plainly — «التحديث التلقائي متوقف» —
 *       with the date of the last collect, and must NOT claim it is off when
 *       the flag turns it back on.
 * #15 — week-old data must not wear the green «حديثة» badge.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { MarketFreshness } from "@/lib/market-intelligence/freshness"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/admin/khat-brain/seasons/[seasonId]/_components/market-actions", () => ({
  refreshMarketIntelligenceAction: vi.fn(),
}))

import { MarketSignalsCard } from "@/app/admin/khat-brain/seasons/[seasonId]/_components/market-signals-card"

function freshness(over: Partial<MarketFreshness> = {}): MarketFreshness {
  return {
    status: "stale",
    signalCount: 5630,
    clusterCount: 36,
    lastSignalAt: "2026-09-25T23:05:00Z",
    lastSuccessfulCollectAt: "2026-09-25T23:05:43Z",
    refreshInFlight: false,
    ageHours: 191,
    autoRefreshEnabled: false,
    ...over,
  }
}

const render = (f: MarketFreshness) =>
  renderToStaticMarkup(createElement(MarketSignalsCard, { seasonId: "s1", freshness: f }))

describe("MarketSignalsCard", () => {
  it("says the automatic refresh is off, with the last collect date", () => {
    const html = render(freshness())
    expect(html).toContain("التحديث التلقائي متوقف")
    expect(html).toContain("آخر جمع:")
    expect(html).toContain('data-auto-refresh="off"')
  })

  it("does not claim the refresh is off when the flag is on", () => {
    const html = render(freshness({ autoRefreshEnabled: true }))
    expect(html).not.toContain("التحديث التلقائي متوقف")
    expect(html).toContain("التحديث التلقائي يعمل يومياً")
  })

  it("does not show «محدّثة خلال آخر ٤٨ ساعة» for 3-day-old data", () => {
    const html = render(freshness({ status: "aging", ageHours: 72 }))
    expect(html).toContain("ليست حديثة")
    expect(html).not.toContain("محدّثة خلال آخر ٤٨ ساعة")
  })
})
