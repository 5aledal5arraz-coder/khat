/**
 * The icon guards, exercised rather than grepped for.
 *
 * WHAT WAS WRONG. `scripts/build-brand-icons.ts` carries three real checks —
 * `assertMinHeightPolicy`, `assertMaskableSafeZone`, `assertClearSpace` (the
 * last in `scripts/generate-og-image.ts`) — and two comments claimed they
 * "fail the build". No npm script runs either generator: `prebuild` is
 * `validate-env --strict && check-migration-drift`, `build` is `next build`.
 * The only test on any of it asserted that the STRING "assertMinHeightPolicy"
 * appears in the source, which passes just as happily if the function is never
 * called, or is called with an empty array, or throws nothing.
 *
 * WHAT THIS DOES INSTEAD. It calls each guard with input that must fail and
 * input that must pass, and it re-measures the COMMITTED icons — the actual
 * bytes that ship — rather than the bytes a generator would produce if someone
 * remembered to run it. The claims in `app/manifest.ts` and the script header
 * now point here, because this is the thing that actually runs.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import { MIN_HEIGHT } from "@/components/brand/khat-logo-geometry"
import { KHAT_INDIGO, MARK, MARK_REVERSED } from "@/components/brand/khat-logo-art"
import {
  MARK_FRACTION,
  MIN_HEIGHT_EXEMPT,
  TILE_PAD,
  TILE_TARGETS,
  assertMaskableSafeZone,
  assertMinHeightPolicy,
  safeZoneUsage,
  squareMarkSvg,
} from "@/scripts/build-brand-icons"

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel))

describe("assertMinHeightPolicy actually rejects an undersized icon", () => {
  it("passes the sizes we ship", () => {
    expect(() => assertMinHeightPolicy(TILE_TARGETS.map((t) => t.size))).not.toThrow()
  })

  it("throws on a new size that renders the mark below the minimum", () => {
    // 24px canvas → ~14px mark, under MIN_HEIGHT.mark (20) and not exempt.
    // This is the case the old string-matching test could not have caught.
    expect(24 * MARK_FRACTION).toBeLessThan(MIN_HEIGHT.mark)
    expect(() => assertMinHeightPolicy([24])).toThrow(/MIN_HEIGHT_EXEMPT/)
  })

  it("lets the two browser-dictated tab slots through, and only those", () => {
    expect(() => assertMinHeightPolicy([16, 32])).not.toThrow()
    expect(MIN_HEIGHT_EXEMPT).toEqual([16, 32])
    // Every non-exempt size we ship must clear the minimum on its own merits,
    // not because it happens to be on the exemption list.
    for (const { size } of TILE_TARGETS) {
      if (MIN_HEIGHT_EXEMPT.includes(size)) continue
      expect(size * MARK_FRACTION, `${size}px canvas`).toBeGreaterThanOrEqual(MIN_HEIGHT.mark)
    }
  })
})

describe("the size list is derived from what is written, not typed beside it", () => {
  it("declares a destination for every size except the favicon members", () => {
    // 16 and 32 exist only inside favicon.ico; everything else must name the
    // file it writes, so a size cannot be checked and then never shipped — or
    // shipped and never checked.
    for (const { size, files } of TILE_TARGETS) {
      if (size <= 32) expect(files, `${size}px`).toEqual([])
      else expect(files.length, `${size}px writes nothing`).toBeGreaterThan(0)
    }
  })

  it("ships every file the list declares", () => {
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    for (const file of TILE_TARGETS.flatMap((t) => t.files)) {
      expect(read(file).subarray(0, 8), file).toEqual(PNG_MAGIC)
    }
  })

  it("keeps no second hand-written copy of the size list in the script", () => {
    const src = readFileSync(path.join(ROOT, "scripts/build-brand-icons.ts"), "utf8")
    // Comments stripped: the history of this bug is written down in one, and a
    // comment describing a literal is not the literal.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    // The exact literal that used to be passed to the guard while the real
    // png() calls lived elsewhere. If it comes back, so does the drift.
    expect(code).not.toContain("[16, 32, 180, 192, 512]")
    expect(src).toContain("assertMinHeightPolicy(TILE_TARGETS.map((t) => t.size))")
  })
})

describe("the numbers the script's header quotes are the geometry's, not a render's", () => {
  it("re-derives the mark height at the 16px favicon slot", () => {
    // 11.4px on the old transparent icon, 9.8px on the tile. Pure geometry.
    expect((16 * MARK.height) / MARK.width).toBeCloseTo(11.4, 1)
    expect(16 * MARK_FRACTION).toBeCloseTo(9.8, 1)
  })

  it("re-derives the ink the tile costs", () => {
    // The canvas grows by TILE_PAD on each side; the mark does not. So the
    // mark's share of the canvas falls by exactly that area ratio — 26.5%.
    // The quoted 22.7% -> 16.7% is this ratio applied to the vector's own
    // coverage, measured at 2048px. It is NOT read off a 16px render: at 16px
    // the same count lands between 7.4% and 34.4% depending on where you put
    // the alpha cutoff, which is why the old "13.7% -> ~9%" did not reproduce.
    const growth = ((MARK.width + 2 * TILE_PAD) / MARK.width) ** 2
    expect(growth).toBeCloseTo(1.361, 2)
    expect(16.7 / 22.7).toBeCloseTo(1 / growth, 2)
  })
})

describe("assertMaskableSafeZone measures the icon that actually ships", () => {
  it("passes on the committed maskable icon, with a real margin", async () => {
    const used = await assertMaskableSafeZone(read("public/brand/icon-maskable-512.png"), "test")
    expect(used).toBeLessThan(1)
    // The number app/manifest.ts quotes: 84.3% of the maskable safe radius.
    expect(used * 100).toBeCloseTo(84.3, 1)
  })

  it("rejects the reuse this replaced — the plain tile as a maskable icon", async () => {
    // The bug: one 512 asset declared for both `any` and `maskable`. On the
    // current tile it reaches past the safe circle, so the guard must throw.
    const sharp = (await import("sharp")).default
    const tile = await sharp(
      Buffer.from(squareMarkSvg(MARK_REVERSED.body, KHAT_INDIGO, TILE_PAD)),
    )
      .resize(512, 512)
      .png()
      .toBuffer()
    await expect(assertMaskableSafeZone(tile, "plain tile")).rejects.toThrow(/safe zone/)
    // And the figure the manifest quotes for that reuse: 112% of the safe
    // radius, i.e. the bubble's tail cropped off on a Pixel.
    expect((await safeZoneUsage(tile)) * 100).toBeCloseTo(112, 0)
  })
})

describe("no comment promises a check that does not run", () => {
  const SOURCES = [
    "app/manifest.ts",
    "scripts/build-brand-icons.ts",
    "scripts/generate-og-image.ts",
  ]

  it("does not claim the generators break the build", () => {
    // They are not in `prebuild` and not in `build`. Wiring them in was
    // considered and rejected — see the header of build-brand-icons.ts — so the
    // claim, not the wiring, is what had to change. If someone genuinely wires
    // them up later, this test is the place to say so.
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
    for (const script of ["prebuild", "build"]) {
      expect(pkg.scripts[script]).not.toContain("build-brand-icons")
      expect(pkg.scripts[script]).not.toContain("generate-og-image")
    }
    for (const rel of SOURCES) {
      const src = readFileSync(path.join(ROOT, rel), "utf8")
      const offending = src
        .split("\n")
        .filter((l) => /fails? the build/i.test(l) && !/does not|never did|NOT wired/i.test(l))
      expect(offending, `${rel} still claims it fails the build`).toEqual([])
    }
  })
})

describe("the icon artwork is the mark, unscaled", () => {
  it("centres the mark vertically and never scales it", () => {
    const svg = squareMarkSvg(MARK_REVERSED.body, KHAT_INDIGO, TILE_PAD)
    // One transform, a translate. A scale here would be a redrawn logo.
    expect(svg.match(/transform="/g)?.length).toBe(1)
    expect(svg).toMatch(/transform="translate\(0 [-\d.]+\)"/)
    expect(svg).not.toContain("scale(")
    const side = MARK.width + TILE_PAD * 2
    expect(svg).toContain(`fill="${KHAT_INDIGO}"`)
    expect(svg).toContain(`width="${Math.round(side * 100) / 100}"`)
  })
})
