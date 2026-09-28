/**
 * QA (noura, 2026-09-28): a season card scored BEFORE «دستور خط» carries the
 * old 14 success keys. The new 8-dimension breakdown must say «غير مقيّم» for
 * them — never a fake 0 — and the old global_note keeps its old label.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { WizardCard } from "@/app/admin/khat-brain/seasons/[seasonId]/_components/card"

function render(dims: Record<string, number>): string {
  const card = {
    topic: {
      working_title: "حلقة",
      episode_type: "personal_story",
      topic_domain: "relationships",
      success_score: 70,
      editorial_intel: { success_dimensions: dims, global_note: "ملاحظة", lens_labels: [], titles: [] },
    },
    guest: null,
  }
  return renderToStaticMarkup(
    createElement(WizardCard, {
      card: card as never,
      batchIndex: 0,
      pending: false,
      onAccept: () => {},
      onReject: () => {},
      onAlternative: () => {},
      hideGuestBlock: true,
    }),
  )
}

describe("season card — pre-constitution rows", () => {
  it("old keys: every new dimension reads «غير مقيّم», and global_note keeps «الصلة العالمية»", () => {
    const html = render({ click_potential: 8, guest_potential: 7, depth: 6 })
    expect((html.match(/data-dim-unscored/g) ?? []).length).toBe(8)
    expect(html).toContain("غير مقيّم")
    // The NOTE label (the dimension of the same name is a different element).
    expect(html).toContain('opacity-80">الصلة العالمية')
    expect(html).not.toContain('opacity-80">قيمة مرجعية تبقى')
    expect(html).toContain("ضيف 7/10") // the old guest score still shows
  })

  it("new keys: real values, the new label, no «غير مقيّم»", () => {
    const html = render({
      worth_telling: 9,
      human_experience: 8,
      practical_value: 7,
      segment_fit: 7,
      library_value: 8,
      guest_findability: 6,
      originality: 7,
      brand_alignment: 9,
    })
    expect(html).not.toContain("data-dim-unscored")
    expect(html).toContain('opacity-80">قيمة مرجعية تبقى')
    expect(html).toContain("ضيف 6/10")
  })
})
