/**
 * Crop the six KHAT ICON SYSTEM glyphs out of the official Illustrator artwork
 * into `public/brand/icons/*.svg`.
 *
 * This is the icon-set twin of how the logo got into the repo: the artwork is
 * CROPPED, never redrawn. `<KhatIcon>` then renders the real vector, the same
 * way `<KhatLogo>` renders the real lockup.
 *
 * WHERE THE ICONS LIVE IN THE SOURCE. The identity file draws the set four
 * times, on four pages, and the difference between them is ink — the geometry is
 * byte-identical:
 *
 *   p.13  KHAT ICON SYSTEM     Signature Purple glyph + KHAT Orange accent
 *   p.14  DARK VERSION         one ink: Warm Ivory (on an orange tile)
 *   p.15  KHAT PRIMARY ICONS   one ink: Deep Indigo
 *   p.16  LIGHT VERSION        KHAT Orange glyph + Signature Purple accent
 *
 * We take TWO of them, and the choice is load-bearing:
 *
 *   · p.13 → `<name>.svg`       the two-ink treatment. Fills are baked, exactly
 *                               like the logo's: not props, not tokens.
 *   · p.15 → `<name>-mono.svg`  ONE ink, so it is re-emitted as `currentColor`.
 *
 * The mono variant is not a liberty taken — it is p.15 and p.14, which are the
 * identity's own single-ink renderings of the same six glyphs. That is what
 * makes `currentColor` faithful rather than convenient, and it is the only
 * variant that can follow a UI state: the phone nav dims an inactive tab, and a
 * glyph with a full-strength orange accent baked in would read as active on
 * every tab at once.
 *
 * WHAT GETS THROWN AWAY, AND WHY. Each page draws its glyphs on a 196x196 tile,
 * and the tile is dropped here. The tile is the swatch the designer used to show
 * the four inks against each other — it changes on every page (ivory, orange,
 * ivory, ivory) while the glyph does not, so the glyph is the icon and the tile
 * is the page it was printed on. Keeping it would nail every icon to a
 * background it has to sit on.
 *
 * COLOURS ARE SNAPPED, and this is the one place a value is touched. Illustrator
 * mixes colour spaces, so the same ink lands on slightly different RGB per
 * object once it has been through PDF: the archive glyph arrives as #31286c
 * against Signature Purple's #342c6b, and the orange accents as #fc540d/#fc580c
 * against KHAT Orange's #fd4f04. Every one of those is snapped to the nearest of
 * the eleven official colours, and the script REFUSES to write a file if any
 * colour is further than 15 away in RGB distance — which is close enough to be a
 * conversion artifact and far enough that a genuinely different colour would
 * stop the build instead of being silently rounded into the palette.
 *
 * Two ink values survive untouched inside the accent set: Signature Purple
 * #342c6b and Deep Indigo #362e6d appear in the SAME icons (the bulb's filament
 * bars and the person's shoulders are Deep Indigo, the bodies are Signature
 * Purple). They are 2 units apart and indistinguishable at icon size, but BOTH
 * are official colours, so they are left exactly as the designer's file has
 * them. Normalising them would be us editing the artwork.
 *
 * REQUIREMENTS: `pdftocairo` (poppler) and the identity PDF, which is not in the
 * repo. Run by hand when the artwork changes; the output is committed.
 *
 *   npx tsx scripts/extract-brand-icons.ts "/path/to/PRIMARY LOGO ….pdf"
 */

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const OUT_DIR = join(process.cwd(), "public", "brand", "icons")
const TMP = join(process.cwd(), ".icon-extract.tmp.svg")

const DEFAULT_PDF = join(
  homedir(),
  "Desktop/KHAT ASSETS/PRIMARY LOGO LOGO SPACING LOGO MARK PRIMARY TYPOGRAPHY.pdf",
)

/** Page 13 is the two-ink set; page 15 is the single-ink set. */
const ACCENT_PAGE = 13
const MONO_PAGE = 15

/**
 * Left-to-right on the page. The order is the artwork's, not ours — the script
 * sorts the detected tiles by x and zips them against this list, so a reordered
 * source page would produce mislabelled files. `tests/brand/icon-art.test.ts`
 * pins each name to a property of its own geometry so that cannot pass quietly.
 */
const NAMES = ["archive", "card", "idea", "conversation", "play", "guest"] as const
export type KhatIconName = (typeof NAMES)[number]

/** KHAT COLOR SYSTEM, p.12 + p.18 — the eleven, and nothing else. */
const PALETTE: Record<string, string> = {
  "#362e6d": "Deep Indigo",
  "#fd4f04": "KHAT Orange",
  "#f8f3ef": "Warm Ivory",
  "#d9d0c8": "Warm Stone",
  "#fff7f5": "Soft Blush",
  "#ffaa82": "Peach Glow",
  "#c83b0d": "Burnt Orange",
  "#342c6b": "Signature Purple",
  "#d9d5e8": "Lavender Mist",
  "#7570a3": "Dusty Violet",
  "#fff0e6": "Secondary Counter",
}

/** How far a converted ink may sit from an official colour before we refuse. */
const MAX_SNAP_DISTANCE = 15

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
}

/**
 * Bounding box of pdftocairo path data, which is absolute M/L/C/Z only.
 * Control points are included, so the box can overshoot a curve — that is fine
 * here, where this only ever has to recognise a square tile.
 */
export function pathBox(d: string): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const m of d.matchAll(/([MLC])([^MLCZmlcz]*)/g)) {
    const v = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
    for (let i = 0; i + 1 < v.length; i += 2) {
      if (v[i] < minX) minX = v[i]
      if (v[i] > maxX) maxX = v[i]
      if (v[i + 1] < minY) minY = v[i + 1]
      if (v[i + 1] > maxY) maxY = v[i + 1]
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

function pathsOf(svg: string): { el: string; box: Box }[] {
  const body = svg.includes("</defs>") ? svg.slice(svg.indexOf("</defs>") + 7) : svg
  return [...body.matchAll(/<path\b[^>]*?\sd="([^"]*)"[^>]*?\/>/g)].map((m) => ({
    el: m[0],
    box: pathBox(m[1]),
  }))
}

/** The six tiles: same size, same row. Detected, never hardcoded. */
function findTiles(svg: string): Box[] {
  const square = pathsOf(svg).filter(
    (p) => p.box.w > 120 && p.box.w < 320 && Math.abs(p.box.w - p.box.h) < 2,
  )
  const byRow = new Map<number, Box[]>()
  for (const p of square) {
    const row = Math.round(p.box.minY)
    byRow.set(row, [...(byRow.get(row) ?? []), p.box])
  }
  const tiles = [...byRow.values()].find((r) => r.length === NAMES.length)
  if (!tiles) {
    throw new Error(
      `expected ${NAMES.length} tiles in one row, found rows of sizes ` +
        [...byRow.values()].map((r) => r.length).join("/"),
    )
  }
  return tiles.sort((a, b) => a.minX - b.minX)
}

function toHex(rgbPercent: string): string {
  const m = /rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/.exec(rgbPercent)
  if (!m) throw new Error(`unparseable colour: ${rgbPercent}`)
  return (
    "#" +
    m
      .slice(1, 4)
      .map((v) => Math.round((Number(v) * 255) / 100).toString(16).padStart(2, "0"))
      .join("")
  )
}

function snap(hex: string): { hex: string; distance: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let best = hex
  let bd = Infinity
  for (const p of Object.keys(PALETTE)) {
    const [R, G, B] = [1, 3, 5].map((i) => parseInt(p.slice(i, i + 2), 16))
    const d = Math.hypot(r - R, g - G, b - B)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return { hex: best, distance: bd }
}

interface Extracted {
  name: KhatIconName
  svg: string
  inks: string[]
}

/**
 * The diamond is the dot of the خ. It signs four of the six glyphs and the
 * logo itself, and the identity file draws it at icon scale on p.13 — so it is
 * lifted out here as a mark in its own right rather than redrawn as a rotated
 * `<div>`, which is what the old logo lookalike did.
 *
 * Sourced from `card`, whose diamond is the largest on the page and therefore
 * carries the most precision. It is a standalone `<path>` in the artwork, so
 * "lifting it out" is literally taking that element.
 */
const DIAMOND_SOURCE: KhatIconName = "card"

function liftDiamond(icon: Extracted): { svg: string; ink: string } {
  const found = [...icon.svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"[^>]*?\/>/g)]
    .map((m) => ({ el: m[0], d: m[1], box: pathBox(m[1]) }))
    .filter(({ d }) => {
      const pts = [...d.matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map((p) => [
        Number(p[1]), Number(p[2]),
      ])
      // pdftocairo closes a subpath with `Z M <first point>`, so a four-sided
      // shape arrives with five points and the last repeating the first.
      const last = pts.at(-1)
      if (last && pts.length === 5 && last[0] === pts[0][0] && last[1] === pts[0][1]) {
        pts.pop()
      }
      if (pts.length !== 4 || /C/.test(d)) return false
      const sides = pts.map((p, i) => {
        const q = pts[(i + 1) % 4]
        return Math.hypot(q[0] - p[0], q[1] - p[1])
      })
      return Math.max(...sides) - Math.min(...sides) < 0.05 * Math.max(...sides)
    })
  if (found.length !== 1) {
    throw new Error(`diamond: expected one rhombus in ${icon.name}, found ${found.length}`)
  }
  const { el, box } = found[0]
  const ink = /fill="(#[0-9a-f]{6})"/.exec(el)?.[1]
  if (!ink) throw new Error("diamond: no fill on the rhombus")

  // `box` is in the glyph's own pre-wrapper space, and the wrapper is dropped
  // here, so the crop translates the path alone — squared off, since a rhombus
  // measured across its diagonals is not exactly square in path units.
  const size = Math.max(box.w, box.h)
  const dx = -box.minX + (size - box.w) / 2
  const dy = -box.minY + (size - box.h) / 2

  return {
    ink,
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.toFixed(2)} ${size.toFixed(2)}">` +
      `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})">${el}</g>` +
      `</svg>\n`,
  }
}

function extractPage(pdf: string, page: number, mono: boolean): Extracted[] {
  execFileSync("pdftocairo", ["-svg", "-f", String(page), "-l", String(page), pdf, TMP])
  const tiles = findTiles(readFileSync(TMP, "utf8"))
  const size = Math.round(tiles[0].w)

  const out: Extracted[] = []
  for (const [i, tile] of tiles.entries()) {
    // Crop with a 2-unit bleed so a glyph flush to the tile edge is not clipped.
    execFileSync("pdftocairo", [
      "-svg",
      "-f", String(page),
      "-l", String(page),
      "-x", String(Math.round(tile.minX) - 2),
      "-y", String(Math.round(tile.minY) - 2),
      "-W", String(size + 4),
      "-H", String(size + 4),
      pdf,
      TMP,
    ])
    let svg = readFileSync(TMP, "utf8")

    // pdftocairo translates the content but keeps the full-page viewBox, so the
    // tile has to be located again in the cropped coordinate space.
    const cropped = pathsOf(svg)
    const here = cropped.find(
      (p) => Math.abs(p.box.w - size) < 2 && Math.abs(p.box.h - size) < 2,
    )
    if (!here) throw new Error(`${NAMES[i]}: tile vanished after cropping`)

    // Drop the tile and the page ground (any path at least as large as the tile).
    for (const p of cropped) {
      if (p.box.w >= size - 2 && p.box.h >= size - 2) svg = svg.split(p.el).join("")
    }

    const inks = new Set<string>()
    svg = svg.replace(/rgb\([\d.]+%,\s*[\d.]+%,\s*[\d.]+%\)/g, (raw) => {
      const hex = toHex(raw)
      const s = snap(hex)
      if (s.distance > MAX_SNAP_DISTANCE) {
        throw new Error(
          `${NAMES[i]}: ${hex} is ${s.distance.toFixed(1)} from the nearest official ` +
            `colour (${s.hex} ${PALETTE[s.hex]}) — too far to be a conversion artifact`,
        )
      }
      inks.add(s.hex)
      return mono ? "currentColor" : s.hex
    })

    const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1] ?? ""
    const body = inner
      .replace(/<defs>[\s\S]*?<\/defs>/g, "")
      .replace(/<g clip-path="url\(#clip-\d+\)">\s*<\/g>/g, "")
      .trim()
      .replace(/\n\s*\n+/g, "\n")
    if (!/<path/.test(body)) throw new Error(`${NAMES[i]}: no artwork survived the crop`)

    // Anchor the viewBox at 0 0 — `parseBrandSvg` requires it, and a translate
    // wrapper does it without touching one number of the original path data.
    const dx = -here.box.minX
    const dy = -here.box.minY
    out.push({
      name: NAMES[i],
      inks: [...inks],
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
        `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})">${body}</g>` +
        `</svg>\n`,
    })
  }
  return out
}

function main() {
  const pdf = process.argv[2] ?? DEFAULT_PDF
  mkdirSync(OUT_DIR, { recursive: true })

  const accent = extractPage(pdf, ACCENT_PAGE, false)
  const mono = extractPage(pdf, MONO_PAGE, true)

  const accentInks = new Set(accent.flatMap((a) => a.inks))
  if (!accentInks.has("#fd4f04")) {
    throw new Error("the accent set carries no KHAT Orange — wrong source page?")
  }
  const monoInks = new Set(mono.flatMap((m) => m.inks))
  if (monoInks.size !== 1) {
    throw new Error(`the mono set should be one ink, found ${[...monoInks].join(", ")}`)
  }

  const diamond = liftDiamond(accent.find((a) => a.name === DIAMOND_SOURCE)!)
  if (diamond.ink !== "#fd4f04") {
    throw new Error(`the diamond should be KHAT Orange, got ${diamond.ink}`)
  }

  for (const a of accent) writeFileSync(join(OUT_DIR, `${a.name}.svg`), a.svg)
  for (const m of mono) writeFileSync(join(OUT_DIR, `${m.name}-mono.svg`), m.svg)
  writeFileSync(join(OUT_DIR, "diamond.svg"), diamond.svg)
  writeFileSync(
    join(OUT_DIR, "diamond-mono.svg"),
    diamond.svg.replaceAll(diamond.ink, "currentColor"),
  )
  rmSync(TMP, { force: true })

  for (const a of accent) {
    const m = mono.find((x) => x.name === a.name)!
    console.log(
      a.name.padEnd(14) +
        `${a.svg.length} B accent (${a.inks.map((i) => PALETTE[i]).join(" + ")})`.padEnd(58) +
        `${m.svg.length} B mono`,
    )
  }
  console.log(
    `diamond`.padEnd(14) +
      `${diamond.svg.length} B accent (${PALETTE[diamond.ink]}, lifted from ${DIAMOND_SOURCE})`,
  )
  console.log(`\nwrote ${accent.length * 2 + 2} files to ${OUT_DIR}`)
  console.log("next: npx tsx scripts/build-brand-icon-art.ts")
}

if (process.argv[1]?.endsWith("extract-brand-icons.ts")) main()
