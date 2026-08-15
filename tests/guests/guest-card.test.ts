/**
 * Guards for the guest card — the episode-cover composition.
 *
 * The card has two modes and they look completely different, so the thing worth
 * asserting is that it picks the right one and never reaches for a file that
 * is not on disk. A guessed `/guests/cutout/<hash>.png` would render a broken
 * image for every guest uploaded after the cut-out script last ran, and the
 * page would still return 200 — the exact shape of failure this codebase keeps
 * finding late.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { GuestCard } from "@/components/guests/guest-card"
import { guestCutoutUrl } from "@/lib/media/guest-cutouts"

const ROOT = process.cwd()
const CUTOUT_DIR = path.join(ROOT, "public", "guests", "cutout")

const withCutout = readdirSync(CUTOUT_DIR)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/, ""))

/**
 * `next/image` percent-encodes the source into its `/_next/image?url=` query,
 * so an assertion written against the plain path silently never matches.
 *
 * Only the slashes are put back. A whole-string `decodeURIComponent` throws
 * here — the markup is full of Tailwind classes like `w-[55%]`, and `%]` is not
 * a valid escape.
 */
const render = (guest: Parameters<typeof GuestCard>[0]["guest"]) =>
  renderToStaticMarkup(createElement(GuestCard, { guest })).replace(/%2F/gi, "/")

describe("the cut-out manifest", () => {
  it("only names files that exist", () => {
    for (const base of withCutout) {
      const url = guestCutoutUrl(`/guests/${base}.jpg`)
      expect(url, `${base} is on disk but not in the manifest`).toBe(
        `/guests/cutout/${base}.png`,
      )
      expect(existsSync(path.join(ROOT, "public", url!))).toBe(true)
    }
  })

  it("returns null rather than a guess for an unknown photo", () => {
    // The whole point: a guest uploaded after the script ran must fall back,
    // not 404.
    expect(guestCutoutUrl("/guests/0000000000000000.jpg")).toBeNull()
    expect(guestCutoutUrl(null)).toBeNull()
    expect(guestCutoutUrl(undefined)).toBeNull()
    expect(guestCutoutUrl("")).toBeNull()
  })
})

describe("which mode the card draws", () => {
  const base = { name: "حسام مطر", slug: "حسام-مطر", bio: "خطاط سوري" }
  const known = withCutout[0]

  it("uses the cut-out and the arcs when there is one", () => {
    const html = render({ ...base, photo_url: `/guests/${known}.jpg` })
    expect(html).toContain(`/guests/cutout/${known}.png`)
    // Signature Purple — the two shapes he drew behind the guest.
    expect(html.match(/#342c6b/g)?.length).toBe(2)
    // No fade: a cut-out has no background to hide.
    expect(html).not.toContain("linear-gradient")
  })

  it("falls back to the plain photo, with the fade and without the arcs", () => {
    const html = render({ ...base, photo_url: "/guests/0000000000000000.jpg" })
    expect(html).toContain("/guests/0000000000000000.jpg")
    expect(html).toContain("linear-gradient")
    // The arcs would sit entirely underneath a rectangle.
    expect(html).not.toContain("#342c6b")
  })

  it("keeps the arcs when there is no photograph at all", () => {
    const html = render({ ...base, photo_url: null })
    expect(html.match(/#342c6b/g)?.length).toBe(2)
    expect(html).not.toContain("<img")
  })
})

describe("the composition", () => {
  const guest = {
    name: "حسام مطر",
    slug: "حسام-مطر",
    bio: "خطاط سوري",
    photo_url: `/guests/${withCutout[0]}.jpg`,
  }

  it("carries the designer's panel path verbatim", () => {
    // The 51.5° diagonals are his, not a rounded-rect approximation. If this
    // string changes, someone redrew the shape.
    expect(render(guest)).toContain("M 1155.36 403.45")
  })

  it("keeps the diamond clear of the portrait", () => {
    // The portrait is object-contain in a 44%-wide box on a 16:9 card, so its
    // painted top edge is at (1 - 44/(16/9)) = 75.25% ... measured the other
    // way: the square fits to width 44% and is bottom-anchored, so it starts at
    // 1 - (0.44 * 16/9) = 21.8% of the height. The diamond must end above that.
    const html = render(guest)
    const top = Number(/top:\s*([\d.]+)%/.exec(html)?.[1])
    const DIAMOND_HEIGHT_PCT = (5.3 / (16 / 9)) // 5.3cqw expressed in card height
    expect(top).toBeGreaterThan(0)
    expect(top + DIAMOND_HEIGHT_PCT).toBeLessThan(21.5)
  })

  it("holds 16:9 so the drawing never reflows", () => {
    expect(render(guest)).toContain("aspect-[16/9]")
  })

  it("is one link to the profile, not two", () => {
    // «شوف الملف الكامل» used to be a second link to the same place directly
    // under this card.
    expect(render(guest).match(/<a\s/g)?.length).toBe(1)
  })
})
