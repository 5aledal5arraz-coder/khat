/**
 * Guards for the Khat logo.
 *
 * The failure this file exists to prevent already happened once: the logo was a
 * CSS lookalike — the word "خط" set in the UI font under a rotated square, on a
 * gradient, with two glows, in two colours that are in no palette — and nothing
 * anywhere said so. Three copies of it had drifted into the codebase before
 * anyone noticed. These tests make each of those failures loud.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import {
  KHAT_INDIGO,
  KHAT_IVORY,
  KHAT_ORANGE,
  LOCKUP_HORIZONTAL,
  LOCKUP_VERTICAL,
  MARK,
  MARK_ORANGE,
  MARK_REVERSED,
  SECONDARY_MARK,
} from "@/components/brand/khat-logo-art"
import {
  ART,
  MIN_HEIGHT,
  khatLogoGeometry,
  khatLogoMarkup,
  type KhatLogoVariant,
} from "@/components/brand/khat-logo-geometry"
import { readBrandArt, renderArtModule } from "@/scripts/build-brand-art"

const ROOT = process.cwd()
const BRAND_DIR = path.join(ROOT, "public", "brand")
const VARIANTS = Object.keys(ART) as KhatLogoVariant[]

/** The invented colours the CSS lookalike used. Neither is in any palette. */
const INVENTED = ["#3a2d70", "#ee6a2c", "#45367f", "#2f2560"]
const PALETTE = [KHAT_INDIGO, KHAT_ORANGE, KHAT_IVORY]

describe("the shipped assets are the real artwork", () => {
  it("keeps the generated module and public/brand/*.svg in lockstep", () => {
    // If this fails someone hand-edited one side. Run:
    //   npx tsx scripts/build-brand-art.ts
    const regenerated = renderArtModule(readBrandArt(BRAND_DIR))
    const committed = readFileSync(
      path.join(ROOT, "components", "brand", "khat-logo-art.ts"),
      "utf8",
    )
    expect(regenerated).toBe(committed)
  })

  it("ships every asset cropped, with no background plate", () => {
    const files = readdirSync(BRAND_DIR).filter((f) => f.endsWith(".svg"))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const svg = readFileSync(path.join(BRAND_DIR, file), "utf8")
      expect(svg, file).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/)
      expect(svg, file).not.toContain("<rect")
      expect(svg, file).not.toContain("<defs")
    }
  })

  it("paints only palette colours", () => {
    for (const variant of VARIANTS) {
      const fills = ART[variant].body.match(/fill="([^"]*)"/g) ?? []
      expect(fills.length, variant).toBeGreaterThan(0)
      for (const fill of fills) {
        const hex = fill.slice(6, -1)
        expect(PALETTE, `${variant} paints ${hex}`).toContain(hex)
      }
    }
  })

  it("carries none of the lookalike's invented colours or effects", () => {
    for (const variant of VARIANTS) {
      const body = ART[variant].body.toLowerCase()
      for (const hex of INVENTED) expect(body, variant).not.toContain(hex)
      for (const effect of ["gradient", "filter", "shadow", "opacity"]) {
        expect(body, variant).not.toContain(effect)
      }
    }
  })

  it("keeps the mark light enough to use as an icon", () => {
    // The whole point of the abstract mark: it is two paths, so it survives
    // being rasterised down to 16px and shipped in an .ico.
    expect(MARK.body.length).toBeLessThan(600)
    expect(SECONDARY_MARK.body.length).toBeLessThan(600)
  })
})

describe("the logo is never mirrored", () => {
  it("has no transform anywhere in the artwork", () => {
    for (const variant of VARIANTS) {
      expect(ART[variant].body, variant).not.toContain("transform")
      expect(ART[variant].body, variant).not.toContain("scale(")
    }
  })

  it("keeps the mark on the start-of-viewBox side of the horizontal lockup", () => {
    // The approved horizontal lockup is mark-left / name-right, and that does
    // NOT flip in RTL. The orange diamond is the dot of the خ, so it belongs to
    // the mark: if anyone ever mirrors the artwork, the diamond crosses into
    // the right half and this fails.
    const orange = LOCKUP_HORIZONTAL.body.match(
      new RegExp(`<path fill="${KHAT_ORANGE}" d="M([\\d.]+)`),
    )
    expect(orange, "no orange diamond found in the horizontal lockup").not.toBeNull()
    expect(Number(orange![1])).toBeLessThan(LOCKUP_HORIZONTAL.width / 2)
  })

  it("allows the icon canvas only to centre the mark, never to flip it", () => {
    // app/icon.svg is the one place a transform legitimately appears — the mark
    // is 1.4:1 on a square canvas, so it is nudged down. A scale() there would
    // mirror the tab icon and nothing else in this file would catch it.
    const icon = readFileSync(path.join(ROOT, "app", "icon.svg"), "utf8")
    const transforms = icon.match(/transform="([^"]*)"/g) ?? []
    expect(transforms.length).toBe(1)
    expect(transforms[0]).toMatch(/^transform="translate\(0 [\d.]+\)"$/)
    expect(icon).not.toContain("scale")
    expect(icon).not.toContain("matrix")
  })

  it("emits no direction-dependent attribute in the markup helper", () => {
    const markup = khatLogoMarkup("lockup-horizontal", 40)
    expect(markup).not.toContain("transform")
    expect(markup).not.toMatch(/\bdir=/)
  })
})

describe("sizing", () => {
  it("scales to the requested logo height and keeps the aspect ratio", () => {
    const geo = khatLogoGeometry("lockup-horizontal", 40)
    expect(geo.height).toBe(40)
    expect(geo.width / geo.height).toBeCloseTo(
      LOCKUP_HORIZONTAL.width / LOCKUP_HORIZONTAL.height,
      3,
    )
  })

  it("clamps below the identity file's minimum instead of rendering mush", () => {
    for (const variant of VARIANTS) {
      const min = MIN_HEIGHT[variant]
      expect(khatLogoGeometry(variant, min - 1).height).toBe(min)
      expect(khatLogoGeometry(variant, min).height).toBe(min)
    }
  })

  it("reserves clear space of x = ⅙ of the logo width on all four sides", () => {
    const plain = khatLogoGeometry("mark", 60)
    const spaced = khatLogoGeometry("mark", 60, true)
    // The logo itself is unchanged — only the box around it grows.
    const scale = 60 / MARK.height
    const x = (MARK.width / 6) * scale
    expect(spaced.height).toBeCloseTo(plain.height + 2 * x, 1)
    expect(spaced.width).toBeCloseTo(plain.width + 2 * x, 1)

    const [minX, minY, w, h] = spaced.viewBox.split(" ").map(Number)
    const pad = MARK.width / 6
    expect(minX).toBeCloseTo(-pad, 1)
    expect(minY).toBeCloseTo(-pad, 1)
    expect(w).toBeCloseTo(MARK.width + 2 * pad, 1)
    expect(h).toBeCloseTo(MARK.height + 2 * pad, 1)
  })

  it("gives the single-colour and reversed marks the same geometry as the mark", () => {
    for (const variant of [MARK_ORANGE, MARK_REVERSED]) {
      expect(variant.width).toBe(MARK.width)
      expect(variant.height).toBe(MARK.height)
    }
    expect(MARK_ORANGE.body).toBe(MARK.body.replaceAll(KHAT_INDIGO, KHAT_ORANGE))
    expect(MARK_REVERSED.body).toBe(MARK.body.replaceAll(KHAT_INDIGO, KHAT_IVORY))
  })

  it("stacks the vertical lockup and lays the horizontal one out wide", () => {
    expect(LOCKUP_VERTICAL.width / LOCKUP_VERTICAL.height).toBeLessThan(1.5)
    expect(LOCKUP_HORIZONTAL.width / LOCKUP_HORIZONTAL.height).toBeGreaterThan(3)
  })
})

describe("no rebuild of the logo survives anywhere in components/brand", () => {
  it("has no gradient, glow, or hand-set خط left in the brand components", () => {
    const dir = path.join(ROOT, "components", "brand")
    for (const file of readdirSync(dir)) {
      if (!/\.tsx?$/.test(file)) continue
      const src = readFileSync(path.join(dir, file), "utf8")
      // Everything below is allowed to appear inside a comment explaining what
      // was removed, so strip comments before asserting on the code.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
      expect(code, file).not.toContain("linear-gradient")
      expect(code, file).not.toContain("boxShadow")
      for (const hex of INVENTED) expect(code.toLowerCase(), file).not.toContain(hex)
    }
  })
})
