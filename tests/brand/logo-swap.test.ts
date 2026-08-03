/**
 * `KhatLogoSwap` reserves the right box for whichever candidate wins.
 *
 * THE REGRESSION THIS LOCKS DOWN. The swap ships two assets with very different
 * ratios — the mark at 1.40:1, the horizontal lockup at 4.18:1 — and the `<img>`
 * only ever described the DEFAULT one. Above the breakpoint the browser sized
 * the box from the mark's ratio at the lockup's height and re-laid-out when the
 * real file arrived: measured in Chrome at 1280px, 61.7x44 reserved against
 * 183.8x44 loaded, i.e. 122.1px of horizontal reflow in a flex header on the
 * first uncached load. At 375px it was already 0, which is exactly why it went
 * unnoticed — and why this test checks EVERY breakpoint rather than one.
 *
 * The check is the arithmetic the browser does, not a screenshot: for each
 * candidate, the box implied by its own `width`/`height` attributes at the CSS
 * height it is given must equal the box the artwork actually occupies.
 *
 * WHAT THAT ARITHMETIC CAN AND CANNOT FAIL ON. A swapped variant and a dropped
 * attribute move the two boxes apart and fail it. A CHANGED HEIGHT CANNOT, and
 * this comment used to claim it would: `reserved` and `loaded` are both derived
 * from the same `ART` entry, so the height cancels out of the comparison and
 * 44 → 12 passed. That is correct behaviour — a ratio is a ratio, and no height
 * reflows a box whose aspect is right. The height is covered instead by the
 * last test here, which holds the CSS class and the props to the same numbers.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { KhatLogoSwap } from "@/components/brand/khat-logo"
import { ART, khatLogoGeometry } from "@/components/brand/khat-logo-geometry"
import { HEADER_LOGO } from "@/components/layout/header"

/**
 * The header's real props, imported — not a copy.
 *
 * This was a local object literal under the comment "Exactly what header.tsx
 * renders", which nothing checked: changing the header's actual breakpoint from
 * 1024px to 640px left all 67 tests green, because the test was measuring the
 * copy. The reflow fix itself was never at risk — it derives every number from
 * khatLogoGeometry whatever props it is handed — but a test that names a file
 * has to read that file, or the next reader trusts a coverage it does not have.
 *
 * WHAT THIS DOES AND DOES NOT COVER. It asserts the reserved box matches the
 * artwork for whichever variants and heights the header ships, so swapping a
 * variant or a height here is measured for real. It does not assert the
 * breakpoint VALUE: 1024px is a design choice, and pinning it would only make
 * this a change-detector.
 */
const HEADER = HEADER_LOGO

function render(props: Parameters<typeof KhatLogoSwap>[0] = HEADER): string {
  return renderToStaticMarkup(createElement(KhatLogoSwap, props))
}

function attrs(tag: string, html: string): Record<string, string> {
  const el = html.match(new RegExp(`<${tag}\\b[^>]*>`))
  if (!el) throw new Error(`no <${tag}> in ${html}`)
  const out: Record<string, string> = {}
  for (const [, k, v] of el[0].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) out[k] = v
  return out
}

describe("KhatLogoSwap reserves a box that matches the artwork", () => {
  const html = render()
  const source = attrs("source", html)
  const img = attrs("img", html)

  it.each([
    ["below the breakpoint — the <img> candidate", () => img, HEADER.compact],
    ["at or above it — the <source> candidate", () => source, HEADER.full],
  ])("%s", (_name, get, candidate) => {
    const a = get()
    // Both attributes must be present: a missing pair is the bug itself, and an
    // absent attribute would otherwise read as NaN and quietly pass a ratio
    // comparison written less carefully.
    expect(a.width, "no width attribute").toBeDefined()
    expect(a.height, "no height attribute").toBeDefined()

    const geo = khatLogoGeometry(candidate.variant, candidate.height)
    expect(Number(a.width)).toBe(geo.width)
    expect(Number(a.height)).toBe(geo.height)

    // The box the browser reserves at the CSS height, versus the box the
    // artwork occupies once it lands. Equal means zero reflow.
    const reserved = (candidate.height * Number(a.width)) / Number(a.height)
    const art = ART[candidate.variant]
    const loaded = (candidate.height * art.width) / art.height
    expect(Math.abs(reserved - loaded), "horizontal reflow, px").toBeLessThan(0.05)
  })

  it("gives the two candidates genuinely different boxes", () => {
    // Guards against a fix that satisfies the test by making both attributes
    // the same: the whole point is that the mark and the lockup differ.
    expect(Number(source.width) / Number(source.height)).not.toBeCloseTo(
      Number(img.width) / Number(img.height),
      1,
    )
  })

  it("still resizes through CSS, not the attributes", () => {
    // The attributes describe intrinsic ratio; the rendered height comes from
    // the class. If this ever moved into the attributes the two breakpoints
    // would collapse to one size.
    expect(attrs("img", html).class).toContain(HEADER.heightClassName)
  })

  it("spells the same two heights in the class and in the props", () => {
    // The height the browser sizes the box with lives in `heightClassName`; the
    // height the attributes are computed from lives in `compact`/`full`. Two
    // spellings of one number, and nothing held them together — which is why
    // the file could promise coverage of "a changed height" while 32 → 12 left
    // all 68 tests green.
    //
    // Compared as a SET, so this stays off the breakpoint: which height sits
    // behind which media prefix is a design choice, and pinning it here would
    // only make this a change-detector, the same reason the breakpoint VALUE is
    // deliberately not asserted above.
    const inClass = [...HEADER.heightClassName.matchAll(/h-\[(\d+)px\]/g)].map((m) => Number(m[1]))
    expect(inClass.length, "no pixel heights in heightClassName").toBeGreaterThan(0)
    expect(new Set(inClass), "class and props disagree on the heights").toEqual(
      new Set<number>([HEADER.compact.height, HEADER.full.height]),
    )
  })
})
