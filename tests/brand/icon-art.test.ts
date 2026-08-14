/**
 * Guards for KHAT ICON SYSTEM — the six glyphs cropped out of the identity file.
 *
 * The logo's guards exist because a CSS lookalike shipped and nothing said so
 * (see logo-art.test.ts). These exist for the failure one level down: an icon
 * set is six near-identical square SVGs, so a mislabelled file, a mirrored
 * glyph, or a colour rounded off during PDF conversion all look like nothing at
 * all in a diff. Each is made loud here.
 *
 * The name pinning below is the load-bearing one. `extract-brand-icons.ts`
 * assigns names by sorting the detected tiles left-to-right and zipping them
 * against a list — correct today, and silently wrong the day the designer
 * reorders the page. So every name is tied to a property of its OWN geometry.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import sharp from "sharp"

import { KhatDiamond, KhatIcon, isKhatIconName } from "@/components/brand/khat-icon"
import { KHAT_ICON_ART, KHAT_ICON_NAMES } from "@/components/brand/khat-icon-art"
import { readIconArt, renderIconArtModule } from "@/scripts/build-brand-icon-art"

const ROOT = process.cwd()
const ICON_DIR = path.join(ROOT, "public", "brand", "icons")
const TILE = 196
/** The diamond is cropped tight to itself, not to a tile. */
const DIAMOND_SIZE = 25.04
/** Must match OPTICAL_INSET in components/brand/khat-icon.tsx. */
const RENDERED_INSET = 0.0949
/** What `lucide-react`'s glyphs fill of their 24-unit box, measured on the site. */
const LUCIDE_FILL = 0.8335

const assetFiles = () => readdirSync(ICON_DIR).filter((f) => f.endsWith(".svg")).sort()

/** KHAT COLOR SYSTEM p.12 + p.18. Anything else in an asset is a defect. */
const PALETTE = [
  "#362e6d", "#fd4f04", "#f8f3ef", "#d9d0c8", "#fff7f5", "#ffaa82",
  "#c83b0d", "#342c6b", "#d9d5e8", "#7570a3", "#fff0e6",
]

const read = (file: string) => readFileSync(path.join(ICON_DIR, file), "utf8")

// ─── path-data geometry ──────────────────────────────────────────────────────

interface Sub {
  points: [number, number][]
  curved: boolean
  box: { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number }
}

/** Split one asset's path data into closed subpaths. Absolute M/L/C/Z only. */
function subpaths(svg: string): Sub[] {
  const out: Sub[] = []
  for (const attr of svg.matchAll(/\sd="([^"]*)"/g)) {
    for (const chunk of attr[1].split(/(?=M)/)) {
      if (!chunk.trim()) continue
      const points: [number, number][] = []
      for (const m of chunk.matchAll(/([ML])\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)) {
        points.push([Number(m[2]), Number(m[3])])
      }
      const all = [...points]
      for (const m of chunk.matchAll(/C([^MLCZ]*)/g)) {
        const v = m[1].trim().split(/[\s,]+/).filter(Boolean).map(Number)
        for (let i = 0; i + 1 < v.length; i += 2) all.push([v[i], v[i + 1]])
      }
      if (!all.length) continue
      const xs = all.map((p) => p[0])
      const ys = all.map((p) => p[1])
      const box = {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      }
      out.push({ points, curved: /C/.test(chunk), box })
    }
  }
  return out
}

/** A rhombus: four points, four equal sides. The dot of the خ. */
const diamonds = (svg: string) =>
  subpaths(svg).filter((s) => {
    if (s.curved || s.points.length !== 4) return false
    const sides = s.points.map((p, i) => {
      const q = s.points[(i + 1) % 4]
      return Math.hypot(q[0] - p[0], q[1] - p[1])
    })
    return Math.max(...sides) - Math.min(...sides) < 0.05 * Math.max(...sides)
  })

/**
 * A round dot: one move-to and then nothing but curves, small, and as wide as
 * it is tall. The three in the conversation bubble are drawn exactly this way.
 */
const dots = (svg: string) =>
  subpaths(svg).filter(
    (s) =>
      s.curved &&
      s.points.length === 1 &&
      s.box.w < 30 &&
      Math.abs(s.box.w - s.box.h) < 3,
  )

/** The largest subpath — the glyph's body. */
const body = (svg: string) =>
  subpaths(svg).reduce((a, b) => (b.box.w * b.box.h > a.box.w * a.box.h ? b : a))

/**
 * `n` is the raster size. Edge fractions only converge well above the tile's
 * own 196 units — at 196 the measured inset lands 0.001 off, which is the
 * rasteriser talking, not the artwork. Anything comparing two variants can stay
 * coarse; anything deriving a constant renders at 4x.
 */
async function inkStats(svg: string, n = TILE) {
  const filled = svg.replaceAll("currentColor", "#362e6d")
  const { data, info } = await sharp(Buffer.from(filled))
    .resize(n, n)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let count = 0, sx = 0, sy = 0
  let minX = n, minY = n, maxX = 0, maxY = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] <= 127) continue
      count++; sx += x; sy += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return {
    size: n,
    cx: sx / count,
    cy: sy / count,
    minX, minY, maxX, maxY,
    /** Ink box and margins as fractions of the canvas. */
    h: (maxY - minY + 1) / n,
    margin: Math.min(minX, minY, n - 1 - maxX, n - 1 - maxY) / n,
  }
}

// ─── the guards ──────────────────────────────────────────────────────────────

describe("the shipped icons are the real artwork", () => {
  it("keeps the generated module and public/brand/icons/*.svg in lockstep", () => {
    // If this fails someone hand-edited one side. Run:
    //   npx tsx scripts/build-brand-icon-art.ts
    const regenerated = renderIconArtModule(readIconArt(ICON_DIR))
    const committed = readFileSync(
      path.join(ROOT, "components", "brand", "khat-icon-art.ts"),
      "utf8",
    )
    expect(regenerated).toBe(committed)
  })

  it("ships exactly the six glyphs the identity file contains, and no more", () => {
    // A seventh glyph would mean we drew the identity instead of applying it.
    // The diamond is not one: it is the accent that signs four of these six,
    // and it is typed apart so nothing iterating the set can reach it.
    expect([...KHAT_ICON_NAMES].sort()).toEqual(
      ["archive", "card", "conversation", "guest", "idea", "play"],
    )
    expect(KHAT_ICON_NAMES).not.toContain("diamond")
    expect(assetFiles()).toHaveLength(KHAT_ICON_NAMES.length * 2 + 2)
  })

  it("ships every asset square, cropped, and with no background plate", () => {
    for (const file of assetFiles()) {
      const svg = read(file)
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
      expect(vb, `${file}: cropped viewBox`).not.toBeNull()
      expect(Number(vb![1]), file).toBe(Number(vb![2]))
      expect(Number(vb![1]), file).toBe(file.startsWith("diamond") ? DIAMOND_SIZE : TILE)
      expect(svg, file).not.toContain("<rect")
      expect(svg, file).toMatch(/<path/)
    }
  })
})

describe("ink", () => {
  it.each([...KHAT_ICON_NAMES])("%s accent uses only official colours", (name) => {
    const svg = read(`${name}.svg`)
    const used = [...svg.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0])
    expect(used.length, "accent variant should carry baked fills").toBeGreaterThan(0)
    for (const hex of new Set(used)) expect(PALETTE, `${name}: ${hex}`).toContain(hex)
    expect(svg).not.toContain("currentColor")
  })

  it.each([...KHAT_ICON_NAMES])("%s mono is a single ink that follows context", (name) => {
    const svg = read(`${name}-mono.svg`)
    expect(svg).toContain("currentColor")
    // A stray hex here means the glyph would refuse to dim in the phone nav.
    expect(svg.match(/#[0-9a-f]{6}/g)).toBeNull()
  })

  it("puts KHAT Orange in the accent set and nowhere in mono", () => {
    const accent = KHAT_ICON_NAMES.map((n) => read(`${n}.svg`)).join("")
    expect(accent).toContain("#fd4f04")
  })
})

describe("each name is pinned to its own geometry", () => {
  // Sorting tiles left-to-right is how the extractor assigns names. If the
  // designer reorders the page, these fail instead of silently relabelling.

  it("conversation is the bubble with three dots and no diamond", () => {
    const svg = read("conversation.svg")
    expect(dots(svg)).toHaveLength(3)
    expect(diamonds(svg)).toHaveLength(0)
  })

  it("play is the bubble with a triangle and no diamond", () => {
    const svg = read("play.svg")
    const triangles = subpaths(svg).filter((s) => !s.curved && s.points.length === 3)
    expect(triangles).toHaveLength(1)
    expect(diamonds(svg)).toHaveLength(0)
    expect(dots(svg)).toHaveLength(0)
  })

  it("archive is the only glyph whose diamond sits inside the body", () => {
    for (const name of ["archive", "card", "idea", "guest"] as const) {
      const svg = read(`${name}.svg`)
      expect(diamonds(svg), name).toHaveLength(1)
      const d = diamonds(svg)[0]
      const b = body(svg)
      const inside = d.box.minY > b.box.minY && d.box.maxY < b.box.maxY
      expect(inside, `${name}: diamond inside the body`).toBe(name === "archive")
    }
  })

  it("idea carries its two bars below the body; card carries them inside", () => {
    for (const [name, expectBelow] of [["idea", true], ["card", false]] as const) {
      const svg = read(`${name}.svg`)
      const b = body(svg)
      const bars = subpaths(svg).filter(
        (s) => s !== b && s.box.w > 20 && s.box.h < 20 && s.points.length >= 3,
      )
      expect(bars.length, `${name}: two bars`).toBe(2)
      const below = bars.every((s) => s.box.minY >= b.box.maxY)
      expect(below, `${name}: bars below the body`).toBe(expectBelow)
    }
  })

  it("guest is the diamond and the body, and nothing else", () => {
    const svg = read("guest.svg")
    expect(svg.match(/<path/g)).toHaveLength(2)
    expect(diamonds(svg)).toHaveLength(1)
  })
})

describe("the two tones are the same drawing", () => {
  // Catches a mirrored, rotated, or shifted glyph in one variant only. Not
  // pixel equality: p.13 outlines the archive with a hairline stroke that p.15
  // does not, which moves ~1% of its edge pixels and no geometry at all.
  it.each([...KHAT_ICON_NAMES])("%s", async (name) => {
    const accent = await inkStats(read(`${name}.svg`))
    const mono = await inkStats(read(`${name}-mono.svg`))
    expect(Math.abs(accent.cx - mono.cx), "centroid x").toBeLessThan(2)
    expect(Math.abs(accent.cy - mono.cy), "centroid y").toBeLessThan(2)
    for (const edge of ["minX", "minY", "maxX", "maxY"] as const) {
      expect(Math.abs(accent[edge] - mono[edge]), edge).toBeLessThanOrEqual(2)
    }
  })

  it("draws no glyph flipped — a mirrored bubble tail points the wrong way", () => {
    for (const file of assetFiles()) {
      const svg = read(file)
      // The extractor adds one translate wrapper; p.13's archive carries the
      // artwork's own y-flip matrix. Nothing may introduce a scale.
      expect(svg, file).not.toMatch(/scale\(/)
      expect(svg, file).not.toMatch(/rotate\(/)
      const wrappers = [...svg.matchAll(/<g transform="([^"]*)"/g)].map((m) => m[1])
      for (const t of wrappers) expect(t, file).toMatch(/^translate\(/)
    }
  })
})

describe("<KhatIcon>", () => {
  const render = (props: Parameters<typeof KhatIcon>[0]) =>
    renderToStaticMarkup(createElement(KhatIcon, props))

  it("defaults to the mono tone so it inherits currentColor", () => {
    const html = render({ name: "guest" })
    expect(html).toContain("currentColor")
    expect(html).not.toMatch(/#[0-9a-f]{6}/)
  })

  it("renders the accent artwork's own inks when asked", () => {
    expect(render({ name: "guest", tone: "accent" })).toContain("#fd4f04")
  })

  it("is decorative unless it is the only thing naming its control", () => {
    expect(render({ name: "archive" })).toContain('aria-hidden="true"')
    const labelled = render({ name: "archive", label: "الأرشيف" })
    expect(labelled).toContain('role="img"')
    expect(labelled).toContain('aria-label="الأرشيف"')
    expect(labelled).not.toContain("aria-hidden")
  })

  it("draws square at the requested size, on the inset view", () => {
    const html = render({ name: "play", size: 20 })
    expect(html).toContain('width="20"')
    expect(html).toContain('height="20"')
    // Not the raw tile: see OPTICAL_INSET. The asset keeps the full 196.
    expect(html).toContain('viewBox="18.60 18.60 158.80 158.80"')
    expect(read("play.svg")).toContain(`viewBox="0 0 ${TILE} ${TILE}"`)
  })

  it("renders at the same optical size as the lucide icons beside it", async () => {
    // The number in OPTICAL_INSET is re-derived here from the artwork, so a
    // redrawn glyph that shifts the set's mean cannot leave the constant stale.
    const heights: number[] = []
    let tightestMargin = 1
    for (const name of KHAT_ICON_NAMES) {
      const stats = await inkStats(read(`${name}-mono.svg`), TILE * 4)
      heights.push(stats.h)
      tightestMargin = Math.min(tightestMargin, stats.margin)
    }
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length
    const wanted = (1 - mean / LUCIDE_FILL) / 2

    expect(mean).toBeCloseTo(0.6754, 2)
    expect(wanted).toBeCloseTo(RENDERED_INSET, 3)
    // Clearance: cropping this much must not touch any glyph.
    expect(tightestMargin).toBeGreaterThan(RENDERED_INSET)
  })

  it("carries every registered name", () => {
    for (const name of KHAT_ICON_NAMES) {
      expect(render({ name }), name).toMatch(/<path/)
      expect(KHAT_ICON_ART[name].accent.width).toBe(TILE)
    }
  })

  it("recognises its own names and rejects a lucide one", () => {
    expect(isKhatIconName("guest")).toBe(true)
    expect(isKhatIconName("message-square-plus")).toBe(false)
    expect(isKhatIconName(null)).toBe(false)
    // The diamond is a mark, not a member of the set.
    expect(isKhatIconName("diamond")).toBe(false)
  })
})

describe("<KhatDiamond>", () => {
  const render = (props: Parameters<typeof KhatDiamond>[0] = {}) =>
    renderToStaticMarkup(createElement(KhatDiamond, props))

  it("is the artwork's own rhombus, not a rotated square", () => {
    // The lookalike this replaces was a `<div>` under `rotate(45deg)`. This has
    // to be the path from the identity file, so it carries no transform of ours
    // beyond the crop, and it is one closed four-sided shape.
    const svg = read("diamond.svg")
    expect(svg).not.toMatch(/rotate\(/)
    expect(svg.match(/<path/g)).toHaveLength(1)
    expect(svg).toContain("#fd4f04")
  })

  it("is always decorative — the badge text beside it already says what it is", () => {
    expect(render()).toContain('aria-hidden="true"')
    expect(render()).not.toContain("role=")
  })

  it("follows currentColor by default and carries KHAT Orange on request", () => {
    expect(render()).toContain("currentColor")
    expect(render()).not.toMatch(/#[0-9a-f]{6}/)
    expect(render({ tone: "accent" })).toContain("#fd4f04")
  })

  it("draws square at the requested size", () => {
    const html = render({ size: 14 })
    expect(html).toContain('width="14"')
    expect(html).toContain('height="14"')
  })
})
