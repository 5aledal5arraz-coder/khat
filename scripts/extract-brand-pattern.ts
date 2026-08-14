/**
 * Extract KHAT PATTERN SYSTEM out of the identity file into `public/brand/pattern/pattern.svg`.
 *
 * The identity has a pattern page the site never used: the خط letterforms —
 * the alif's bar, the khaa's shoulder, the taa — scattered with the orange
 * diamond between them. The designer puts it behind story and thumbnail
 * artwork at very low contrast, as a ground rather than a decoration.
 *
 * IT IS NOT A MATHEMATICAL TILE, AND IT IS NOT TURNED INTO ONE HERE.
 * Measured on the diamonds alone (the simplest shape, so the least bbox
 * error), the row pitch runs 151.02, 140.95, 145.99, 151.02, 143.27, 151.02,
 * 161.69 … and the column pitch alternates 506 / 565. He placed them by hand.
 * Regularising that into a repeating unit would be us redrawing his pattern to
 * make our CSS easier — so the whole block ships as he drew it, 1920 wide,
 * which is wider than any viewport that will show it.
 *
 * ONE BAKED INK. A CSS `background-image` gets no `currentColor` from the page
 * that references it, so the ink is resolved here and the presence is set by
 * the layer's opacity instead — which is how the designer varies it too.
 *
 * NOTHING RENDERS THIS TODAY. The pattern was laid behind the homepage's
 * statement band on 2026-08-15 and Khaled removed it on sight — «الخلفيه ما
 * اعجبتني النقشه». The component and the generated SVGs were deleted with it,
 * so this script's output directory is empty until someone asks for the pattern
 * again. It is kept because the extraction is the part that took the
 * measurement: run it and `public/brand/pattern/` comes back in one command.
 *
 *   npx tsx scripts/extract-brand-pattern.ts
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const SOURCE_PDF = path.join(os.homedir(), "Desktop/KHAT ASSETS/ملف عرض الشعار.pdf")
/** As the pattern page draws it: indigo letterforms, orange diamonds. */
const OUT = path.join(process.cwd(), "public/brand/pattern/pattern.svg")
/**
 * As he APPLIES it. The pattern page is two inks, but every place the pattern
 * is actually used as a ground it is one — measured on
 * `STORY AFTER BEFOR/STORY PUB-01.jpg`, where every non-ground pixel in the
 * pattern area is #e0d4d4 ± 1 and there is no orange anywhere. Shipping the
 * two-ink version as a background would put faint pink diamonds on a surface
 * he keeps monochrome.
 */
const OUT_GROUND = path.join(process.cwd(), "public/brand/pattern/pattern-ground.svg")

/** The pattern block on the artboard, in PDF points (the page is 1920 x 8089). */
const BAND = { top: 4600, bottom: 8089 }
/** The section heading and the page's full-bleed plates are not the pattern. */
const MAX_GLYPH = 300

const KHAT_INDIGO = "#362e6d"
const KHAT_ORANGE = "#fd4f04"

/** Distance beyond which a converted colour is not a KHAT colour at all. */
const MAX_SNAP_DISTANCE = 15

type Box = { x0: number; y0: number; x1: number; y1: number }

function hexOf(rgbFn: string): string {
  const nums = rgbFn.match(/[\d.]+/g)
  if (!nums || nums.length < 3) throw new Error(`unreadable fill: ${rgbFn}`)
  const to255 = (pct: string) => Math.round((Number(pct) / 100) * 255)
  return (
    "#" +
    [to255(nums[0]), to255(nums[1]), to255(nums[2])]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  )
}

function distance(a: string, b: string): number {
  const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [ar, ag, ab] = ch(a)
  const [br, bg, bb] = ch(b)
  return Math.hypot(ar - br, ag - bg, ab - bb)
}

function bboxOf(d: string): Box {
  const nums = d.match(/-?[\d.]+/g)?.map(Number) ?? []
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i])
    x1 = Math.max(x1, nums[i])
    y0 = Math.min(y0, nums[i + 1])
    y1 = Math.max(y1, nums[i + 1])
  }
  return { x0, y0, x1, y1 }
}

function main() {
  if (!fs.existsSync(SOURCE_PDF)) throw new Error(`source artwork not found: ${SOURCE_PDF}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "khat-pattern-"))
  const svgPath = path.join(tmp, "doc.svg")
  execFileSync("pdftocairo", ["-svg", SOURCE_PDF, svgPath])

  const doc = fs.readFileSync(svgPath, "utf8")
  const body = doc.slice(doc.indexOf("</defs>"))
  const re = /<path[^>]*fill="(rgb\([^)]*\))"[^>]*\sd="([^"]*)"/g

  const glyphs: { d: string; ink: string; box: Box }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const box = bboxOf(m[2])
    if (box.y0 < BAND.top || box.y1 > BAND.bottom) continue
    if (box.x1 - box.x0 > MAX_GLYPH || box.y1 - box.y0 > MAX_GLYPH) continue

    const hex = hexOf(m[1])
    const toOrange = distance(hex, KHAT_ORANGE)
    const toIndigo = distance(hex, KHAT_INDIGO)
    const ink = toOrange < toIndigo ? KHAT_ORANGE : KHAT_INDIGO
    if (Math.min(toOrange, toIndigo) > MAX_SNAP_DISTANCE) {
      throw new Error(
        `${hex} is neither KHAT Indigo nor KHAT Orange — the pattern uses two inks and ` +
          `this is a third; re-measure BAND before trusting this run`,
      )
    }
    glyphs.push({ d: m[2], ink, box })
  }

  if (glyphs.length < 300) {
    throw new Error(`only ${glyphs.length} glyphs in the band — BAND is cutting the pattern`)
  }

  const x0 = Math.min(...glyphs.map((g) => g.box.x0))
  const y0 = Math.min(...glyphs.map((g) => g.box.y0))
  const w = Math.max(...glyphs.map((g) => g.box.x1)) - x0
  const h = Math.max(...glyphs.map((g) => g.box.y1)) - y0

  const emit = (mono: boolean) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}">` +
    `<g transform="translate(${(-x0).toFixed(2)} ${(-y0).toFixed(2)})">` +
    glyphs
      .map(
        (g) =>
          `<path fill="${mono ? KHAT_INDIGO : g.ink}" fill-rule="nonzero" d="${g.d}"/>`,
      )
      .join("") +
    `</g></svg>\n`

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, emit(false))
  fs.writeFileSync(OUT_GROUND, emit(true))

  fs.rmSync(tmp, { recursive: true, force: true })
  const orange = glyphs.filter((g) => g.ink === KHAT_ORANGE).length
  console.log(
    `${glyphs.length} glyphs (${orange} diamonds) — ${w.toFixed(0)} x ${h.toFixed(0)}\n` +
      `→ ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} B)  two inks, as the pattern page draws it\n` +
      `→ ${path.relative(process.cwd(), OUT_GROUND)} (${fs.statSync(OUT_GROUND).size} B)  one ink, as he applies it`,
  )
}

main()
