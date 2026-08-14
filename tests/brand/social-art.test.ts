/**
 * Guards for the six social marks the designer drew in KHAT style.
 *
 * The failure these exist for already happened, twice, in the same footer: four
 * Unicode glyphs, then four hand-written stock silhouettes, both shipped to
 * subscribers under a real logo, and both invisible to every check we had. The
 * designer's marks were sitting unopened in `SOCIAL MEDIA ICON/ICON.pdf` the
 * whole time.
 *
 * So the assertions below are about PROVENANCE, not about pixels being pretty:
 * each mark must still carry the diamond that proves it is his, the six must
 * still be one set at one scale, and the module the app inlines must still be
 * what the SVGs say.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  KhatBubble,
  KhatSocialIcon,
  isKhatSocialName,
} from "@/components/brand/khat-social-icon"
import {
  KHAT_SOCIAL_ART,
  KHAT_SOCIAL_NAMES,
} from "@/components/brand/khat-social-art"
import { readSocialArt, renderSocialArtModule } from "@/scripts/build-social-icon-art"

const ROOT = process.cwd()
const DIR = path.join(ROOT, "public", "brand", "social")
const KHAT_ORANGE = "#fd4f04"

/** KHAT COLOR SYSTEM p.12 + p.18. Anything else in an asset is a defect. */
const PALETTE = [
  "#362e6d", "#fd4f04", "#f8f3ef", "#d9d0c8", "#fff7f5", "#ffaa82",
  "#c83b0d", "#342c6b", "#d9d5e8", "#7570a3", "#fff0e6",
]

const svgFiles = () => readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort()
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8")

describe("the set", () => {
  it("is exactly the six the designer drew", () => {
    expect([...KHAT_SOCIAL_NAMES].sort()).toEqual(
      ["instagram", "podcast", "spotify", "tiktok", "x", "youtube"].sort(),
    )
  })

  it("has one asset per platform, plus the bubble and nothing else", () => {
    expect(svgFiles()).toEqual(
      ["bubble", ...KHAT_SOCIAL_NAMES].sort().map((n) => `${n}.svg`),
    )
  })

  it("keeps the bubble out of the platform list", () => {
    expect(isKhatSocialName("bubble")).toBe(false)
    expect(isKhatSocialName("tiktok")).toBe(true)
  })
})

describe("provenance — the diamond is the signature", () => {
  it.each(KHAT_SOCIAL_NAMES)("%s carries KHAT Orange", (name) => {
    // A stock platform mark has no orange in it. This single assertion is what
    // separates the designer's drawing from a recoloured copy of Instagram's.
    expect(read(`${name}.svg`)).toContain(KHAT_ORANGE)
  })

  it.each(KHAT_SOCIAL_NAMES)("%s uses only palette colours", (name) => {
    const hexes = [...read(`${name}.svg`).matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0])
    expect(hexes.length).toBeGreaterThan(0)
    for (const hex of new Set(hexes)) expect(PALETTE).toContain(hex)
  })

  it.each(KHAT_SOCIAL_NAMES)("%s ink follows its context", (name) => {
    // Without this the mark cannot be ivory in the indigo email footer and
    // indigo on the ivory site footer — one file, two grounds.
    expect(read(`${name}.svg`)).toContain("currentColor")
  })
})

describe("one set, one scale", () => {
  it("gives all six the same square viewBox", () => {
    const sides = KHAT_SOCIAL_NAMES.map((n) => KHAT_SOCIAL_ART[n])
    for (const art of sides) expect(art.width).toBe(art.height)
    expect(new Set(sides.map((a) => a.width)).size).toBe(1)
  })

  it("keeps the designer's relative proportions", async () => {
    // TikTok is drawn tall and narrow, YouTube wide and short. If a future
    // change fits each mark to its own tight box, these two collapse to the
    // same aspect and the row stops looking like his.
    const inkAspect = (name: string) => {
      const nums = [...read(`${name}.svg`).matchAll(/\sd="([^"]*)"/g)].flatMap(
        (m) => m[1].match(/-?[\d.]+/g)?.map(Number) ?? [],
      )
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      return (
        (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))
      )
    }
    expect(inkAspect("tiktok")).toBeLessThan(1)
    expect(inkAspect("youtube")).toBeGreaterThan(1)
    expect(inkAspect("tiktok")).toBeLessThan(inkAspect("youtube"))
  })
})

describe("the generated module matches the assets", () => {
  it("is byte-identical to a fresh build", () => {
    const built = renderSocialArtModule(readSocialArt(DIR))
    const onDisk = readFileSync(
      path.join(ROOT, "components", "brand", "khat-social-art.ts"),
      "utf8",
    )
    expect(onDisk).toBe(built)
  })

  it("refuses to build from a stock mark", () => {
    // Mutation, not inspection: the builder has to actually stop. Written into
    // a temp directory so the check is exercised, not merely described.
    const tmp = mkdtempSync(path.join(tmpdir(), "khat-social-guard-"))
    const stripped = read("x.svg").replace(new RegExp(KHAT_ORANGE, "g"), "#362e6d")
    for (const f of svgFiles()) {
      writeFileSync(path.join(tmp, f), f === "x.svg" ? stripped : read(f))
    }
    expect(() => readSocialArt(tmp)).toThrow(/KHAT Orange/)
    rmSync(tmp, { recursive: true, force: true })
  })
})

describe("rendering", () => {
  it.each(KHAT_SOCIAL_NAMES)("%s renders the artwork inline, not an <img>", (name) => {
    const html = renderToStaticMarkup(createElement(KhatSocialIcon, { name }))
    expect(html).toContain("<svg")
    expect(html).toContain("<path")
    expect(html).not.toContain("<img")
    // An inlined mark that lost currentColor cannot follow its footer.
    expect(html).toContain("currentColor")
    expect(html).toContain(KHAT_ORANGE)
  })

  it("is decorative unless it is given a name", () => {
    const bare = renderToStaticMarkup(createElement(KhatSocialIcon, { name: "x" }))
    expect(bare).toContain('aria-hidden="true"')
    const named = renderToStaticMarkup(
      createElement(KhatSocialIcon, { name: "x", label: "إكس" }),
    )
    expect(named).toContain('aria-label="إكس"')
    expect(named).toContain('role="img"')
  })

  it("never mirrors in RTL", () => {
    // The tails and the play triangle are drawn one way in the identity file.
    // Inline SVG geometry ignores `dir`, so this holds by doing nothing — this
    // test fails the day someone "fixes" it with a transform.
    for (const name of KHAT_SOCIAL_NAMES) {
      const html = renderToStaticMarkup(createElement(KhatSocialIcon, { name }))
      expect(html).not.toMatch(/scale\(-1|rotate\(|matrix\(-/)
    }
  })

  it("renders the bubble decoratively", () => {
    const html = renderToStaticMarkup(createElement(KhatBubble, {}))
    expect(html).toContain("<svg")
    expect(html).toContain('aria-hidden="true"')
  })
})

describe("the platform map", () => {
  it("sends the six identity platforms to the identity artwork", async () => {
    const { getPlatformIcon } = await import("@/components/platforms/platform-icon")
    for (const key of ["tiktok", "spotify", "instagram", "youtube", "x", "apple_podcasts"]) {
      const html = renderToStaticMarkup(createElement(getPlatformIcon(key)))
      expect(html, `${key} is not using the identity mark`).toContain(KHAT_ORANGE)
    }
  })

  it("leaves platforms the identity does not draw on their stock mark", async () => {
    const { getPlatformIcon } = await import("@/components/platforms/platform-icon")
    // Inventing a seventh mark in this style would be us designing the
    // identity rather than applying it.
    for (const key of ["facebook", "threads", "snapchat", "telegram"]) {
      const html = renderToStaticMarkup(createElement(getPlatformIcon(key)))
      expect(html, `${key} was given a KHAT diamond it has no artwork for`).not.toContain(
        KHAT_ORANGE,
      )
    }
  })
})
