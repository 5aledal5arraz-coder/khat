/**
 * The host's energy dial, rendered.
 *
 * Two numbers share this control while a director cue is unanswered, and the
 * screen has to admit that out loud: after a cue lapsed, the rail read "حادّ
 * ●●●●●" while every question badge said "يدفع للأمام", with nothing on screen
 * connecting the two.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CompactEnergyControl } from "@/app/admin/recording/[roomId]/v2/cockpit-bits"

function control(over: Partial<Parameters<typeof CompactEnergyControl>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(CompactEnergyControl, {
      level: 3,
      interactive: true,
      onSet: () => {},
      ...over,
    }),
  )
}

describe("CompactEnergyControl", () => {
  it("names the displayed grade", () => {
    expect(control({ level: 5 })).toContain("حادّ")
    expect(control({ level: 3 })).toContain("متوسط")
    expect(control({ level: 1 })).toContain("هادئ")
  })

  it("says which grade the RANKING is on when the two differ", () => {
    const html = control({ level: 5, approvedLevel: 3 })
    expect(html).toContain("حادّ") // what the room shows
    expect(html).toContain("ترتيبك على متوسط") // what the questions are sorted by
  })

  it("stays quiet when they agree", () => {
    expect(control({ level: 5, approvedLevel: 5 })).not.toContain("ترتيبك على")
  })

  it("stays quiet when they differ only WITHIN a grade", () => {
    // 4 and 5 are both حادّ, so the ordering is identical — flagging it would be
    // noise about a difference that changes nothing.
    expect(control({ level: 5, approvedLevel: 4 })).not.toContain("ترتيبك على")
  })

  it("offers all five steps as live targets, none disabled", () => {
    // The dial must never present a step the host cannot press: the guard that
    // used to compare against the displayed value swallowed the tap that
    // re-asserted a diverged number.
    const html = control({ level: 5, approvedLevel: 3 })
    for (const n of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`aria-label="ضبط الطاقة على ${n}"`)
    }
    expect(html).not.toContain("disabled")
  })

  it("renders read-only without buttons when not interactive", () => {
    expect(control({ interactive: false })).not.toContain("<button")
  })

  it("uses RTL logical properties only", () => {
    expect(/class="[^"]*\b(ml-|mr-|left-|right-|pl-|pr-)/.test(control())).toBe(false)
  })
})
