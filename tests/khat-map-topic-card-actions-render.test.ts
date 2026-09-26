/**
 * Approved-topic card actions render (SSR, no jsdom).
 *
 * Locks the contract Khaled needs on ONE topic:
 *   - «تعديل» is always reachable (goal/description edits),
 *   - «عيّن ضيفاً معروفاً» appears when no guest is linked, «غيّر الضيف» when one is,
 *   - «تحويل لإعداد» appears ONLY when the topic has a guest — there is no
 *     season-completeness condition on it,
 *   - no physical left/right classes (RTL).
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/app/admin/khat-brain/seasons/actions", () => ({
  assignKnownGuestToTopicAction: vi.fn(),
  convertV2CardToPreparationAction: vi.fn(),
  editEpisodeAction: vi.fn(),
}))

import { TopicCardActions } from "@/app/admin/khat-brain/seasons/[seasonId]/_components/topic-card-actions"

const TOPIC = { id: "topic-1", working_title: "حلقة", goal: null, description: null } as never

function render(hasGuest: boolean): string {
  return renderToStaticMarkup(
    createElement(TopicCardActions, {
      seasonId: "season-1",
      topic: TOPIC,
      hasGuest,
      currentGuestId: hasGuest ? "guest-1" : null,
      guests: [{ id: "guest-1", name: "ضيف" }],
    }),
  )
}

describe("TopicCardActions", () => {
  it("without a guest: edit + assign-known-guest, no convert", () => {
    const html = render(false)
    expect(html).toContain("تعديل")
    expect(html).toContain("عيّن ضيفاً معروفاً")
    expect(html).not.toContain("تحويل لإعداد")
  })

  it("with a guest: edit + change-guest + single-topic convert", () => {
    const html = render(true)
    expect(html).toContain("تعديل")
    expect(html).toContain("غيّر الضيف")
    expect(html).toContain("تحويل لإعداد")
  })

  it("uses logical properties only", () => {
    const html = render(true)
    expect(html).not.toMatch(/\b(ml|mr|pl|pr|left|right)-/)
  })
})
