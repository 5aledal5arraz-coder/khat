/**
 * Bulk delete is OWNER-only (the route returns 403 to everyone else). The
 * list's selection exists only to feed it, so a non-OWNER must not be shown
 * the checkboxes at all — otherwise they select rows and hit a 403.
 * SSR via react-dom/server, same as the recording render tests.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { GuestsList } from "@/app/admin/guests/guests-list"

type Props = Parameters<typeof GuestsList>[0]
const guests = [
  { id: "g1", name: "ضيف أول", bio: null, photo_url: null, external_links: null, episodeCount: 0 },
  { id: "g2", name: "ضيف ثانٍ", bio: null, photo_url: null, external_links: null, episodeCount: 1 },
] as unknown as Props["guests"]

const render = (canBulkDelete: boolean) =>
  renderToStaticMarkup(createElement(GuestsList, { guests, episodes: [], canBulkDelete }))
const checkboxes = (html: string) => (html.match(/type="checkbox"/g) ?? []).length

describe("GuestsList — bulk selection is OWNER-only", () => {
  it("OWNER sees select-all + one checkbox per guest", () => {
    const html = render(true)
    expect(checkboxes(html)).toBe(3)
    expect(html).toContain("تحديد كل الضيوف")
  })

  it("everyone else sees no selection UI at all", () => {
    const html = render(false)
    expect(checkboxes(html)).toBe(0)
    expect(html).not.toContain("تحديد كل الضيوف")
    // Sight: the rows themselves still render.
    expect(html).toContain("ضيف أول")
    expect(html).toContain("ضيف ثانٍ")
  })
})
