/**
 * Batch 2 (2026-09-28): a name that did NOT come from the model's memory says
 * so on the run page — «وُجد في الصحافة/البودكاست» (D1) / «من قوائم X المنسّقة»
 * (D5). A model proposal (or a row stored before the field existed) shows no chip.
 */

import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("@/app/admin/discovery-v2/actions", () => ({
  saveV2CandidateAction: vi.fn(),
  rejectV2CandidateAction: vi.fn(),
  promoteV2CandidateAction: vi.fn(),
}))

import { CandidateCard, type V2CardData } from "@/app/admin/discovery-v2/candidate-card"

const base: V2CardData = { id: "c1", name: "ضيف تجريبي", decision: "shortlist", status: "proposed" }
const html = (c: V2CardData) => renderToStaticMarkup(createElement(CandidateCard, { c }))

describe("discovery card — name origin", () => {
  it("labels harvested and X names; stays silent for a model proposal", () => {
    expect(html({ ...base, origin: "harvest_web" })).toContain("وُجد في الصحافة/البودكاست")
    expect(html({ ...base, origin: "x_list" })).toContain("من قوائم X المنسّقة")
    const plain = html({ ...base, origin: "propose" })
    expect(plain).toContain("ضيف تجريبي") // sight: the card rendered
    expect(plain).not.toContain("اقتراح النموذج")
    expect(html(base)).not.toContain("وُجد في الصحافة")
  })
})
