/**
 * WrapView renders — the wrap screen is where a take is handed to post, so a
 * runtime error or a wrong export href here silently costs the editor the whole
 * session's markers.
 *
 * Server-rendered with `react-dom/server` (already a dependency) rather than a
 * DOM test runner: no jsdom, no testing-library, no new packages. That is enough
 * to prove the component mounts and to assert the contract that matters — both
 * export links, the camera-offset field, and the copy that tells the editor WHY
 * there are two downloads.
 *
 * Written with `createElement` instead of JSX because vitest.config.ts only
 * collects `tests/**\/*.test.ts`; widening that pattern for one file would be a
 * shared-config change for no gain.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { WrapView } from "@/app/admin/recording/[roomId]/v2/wrap-view"
import type { LiveV2Marker } from "@/lib/recording-v2/load"

const MARKERS: LiveV2Marker[] = [
  {
    id: "m1",
    marker_type: "quote",
    label: "quote",
    note: "«الخط اللي تحت الكلمة أهم من الكلمة»",
    net_recording_ms: 402_000,
    take_number: 2,
    camera_ms: 406_200,
    section_key: "build_up",
    created_at: "2026-08-02T17:06:42.000Z",
    author_name: "المخرج",
  },
]

function render(over: Partial<Parameters<typeof WrapView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(WrapView, {
      roomId: "qa-room-1",
      durationMs: 1_920_000,
      sectionsTotal: 6,
      sectionsDone: 4,
      questionsAsked: 18,
      questionsTotal: 24,
      markers: MARKERS,
      closingOptions: [],
      takeNumber: 2,
      cameraOffsetMs: 4200,
      onSetCameraOffset: async () => true,
      onReset: () => {},
      busy: false,
      ...over,
    }),
  )
}

describe("WrapView", () => {
  it("renders without throwing", () => {
    expect(render().length).toBeGreaterThan(500)
  })

  it("offers BOTH exports with the correct format params", () => {
    const html = render()
    expect(html).toContain(
      'href="/api/admin/recording/qa-room-1/markers/export?format=edl"',
    )
    expect(html).toContain(
      'href="/api/admin/recording/qa-room-1/markers/export?format=csv"',
    )
  })

  it("explains why there are two files, so neither is mistaken for complete", () => {
    // An editor who downloads only the EDL gets positions with blank labels and
    // no way to know the notes exist. The copy has to say so.
    expect(render()).toContain("يُسقط العربي")
  })

  it("shows which take is being wrapped", () => {
    expect(render({ takeNumber: 3 })).toContain("التيك")
  })

  it("pre-fills the camera offset in seconds from the stored ms", () => {
    expect(render({ cameraOffsetMs: 4200 })).toContain('value="4.2"')
    expect(render({ cameraOffsetMs: -1500 })).toContain('value="-1.5"')
    expect(render({ cameraOffsetMs: 0 })).toContain('value="0"')
  })

  it("hides the camera-offset field when the take never started", () => {
    // No anchor row => nothing to correct, and offering the input would imply
    // an export exists to fix.
    expect(render({ cameraOffsetMs: null })).not.toContain("فرق توقيت الكاميرا")
  })

  // Previously the panel kept both download links on screen (greyed out via
  // `pointer-events-none`) under a "لا توجد علامات" heading, together with the
  // "نزّل الاثنين" explainer — so it contradicted itself, and because
  // `pointer-events-none` does not remove a link from the tab order, a keyboard
  // user could still Tab to it and download an empty file. They are now absent
  // entirely, which is what this asserts.
  it("removes both export links entirely when there are no markers", () => {
    const html = render({ markers: [] })
    expect(html).toContain("لا توجد علامات لتصديرها")
    expect(html).not.toContain("format=edl")
    expect(html).not.toContain("format=csv")
    expect(html).not.toContain("نزّل الاثنين")
  })

  it("renders both export links once markers exist", () => {
    const html = render()
    expect(html).toContain("format=edl")
    expect(html).toContain("format=csv")
  })

  it("uses RTL logical properties, never physical left/right", () => {
    expect(/class="[^"]*\b(ml-|mr-|left-|right-|pl-|pr-)/.test(render())).toBe(false)
  })
})
