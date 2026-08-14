/**
 * Extract the six KHAT-styled social platform icons from the designer's
 * `SOCIAL MEDIA ICON/ICON.pdf` and emit one tight SVG per platform.
 *
 * The designer drew TikTok, Spotify, Instagram, YouTube, Podcast and X in the
 * KHAT identity — each carrying the orange diamond. The site had been using
 * stock marks recoloured to Dusty Violet, which is not the identity.
 *
 * The source is pure vector (0 raster images), so this is a lossless split:
 * every path is measured, clustered into its icon by position, and re-emitted
 * verbatim under a tight viewBox. Colours are snapped to the palette and
 * anything further than MAX_SNAP_DISTANCE from a brand colour aborts the run —
 * the same rule `extract-brand-icons.ts` uses.
 *
 *   npx tsx scripts/extract-social-icons.ts
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const SOURCE_PDF = path.join(
  os.homedir(),
  "Desktop/KHAT ASSETS/SOCIAL MEDIA ICON/ICON.pdf",
)
const OUT_DIR = path.join(process.cwd(), "public/brand/social")

/** KHAT Orange, the accent every one of the six carries. */
const KHAT_ORANGE = "#fd4f04"

/** The icon row on the artboard, in PDF points. */
const ICON_BAND = { top: 1085, bottom: 1215 }
/** The two bare speech-bubble marks below the icon row. */
const BUBBLE_BAND = { top: 1230, bottom: 1330 }
/** Paths per icon, left to right — a partial extraction must not ship silently. */
const EXPECTED_PATHS: Record<string, number> = {
  tiktok: 2,
  spotify: 4,
  instagram: 3,
  youtube: 2,
  podcast: 4,
  x: 4,
  bubble: 3,
}

/** Left-to-right on the artboard. */
const PLATFORMS = [
  "tiktok",
  "spotify",
  "instagram",
  "youtube",
  "podcast",
  "x",
] as const
type Platform = (typeof PLATFORMS)[number]

const PALETTE: Record<string, string> = {
  "#362e6d": "indigo",
  "#342c6b": "indigo",
  "#fd4f04": "orange",
  "#c83b0d": "burnt",
  "#f8f3ef": "ivory",
  "#fff7f5": "blush",
  "#d9d0c8": "stone",
  "#ffaa82": "peach",
  "#d9d5e8": "lavender",
  "#7570a3": "violet",
  "#fff0e6": "counter",
}
const MAX_SNAP_DISTANCE = 15

type Box = { x0: number; y0: number; x1: number; y1: number }
type Shape = { d: string; fill: string; box: Box }

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

/** Nearest brand colour, or null when nothing is close enough. */
function snap(hex: string): string | null {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let best: string | null = null
  let bestDist = Infinity
  for (const brand of Object.keys(PALETTE)) {
    const [br, bg, bb] = [1, 3, 5].map((i) =>
      parseInt(brand.slice(i, i + 2), 16),
    )
    const dist = Math.hypot(r - br, g - bg, b - bb)
    if (dist < bestDist) {
      bestDist = dist
      best = brand
    }
  }
  return bestDist <= MAX_SNAP_DISTANCE ? best : null
}

/**
 * Bounding box from the path's absolute coordinates. pdftocairo emits only
 * absolute M/L/C/Z with plain numbers, so every number pair in the data is a
 * point on (or a control point near) the curve — good enough to cluster and to
 * frame, and the control-point overshoot is bounded by the stroke geometry the
 * designer used, which is all filled outlines here.
 */
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

/**
 * Every shape on the artboard, keeping the raw hex. Snapping is deferred to
 * `emit()` so an off-palette colour elsewhere on the sheet (the lower-third
 * bar uses one) cannot block the icons, while an off-palette colour *inside*
 * an icon still aborts the run.
 */
function parseShapes(svg: string): Shape[] {
  const body = svg.slice(svg.indexOf("</defs>"))
  const shapes: Shape[] = []
  const re = /<path[^>]*fill="(rgb\([^)]*\))"[^>]*\sd="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    shapes.push({ d: m[2], fill: hexOf(m[1]), box: bboxOf(m[2]) })
  }
  return shapes
}

/** Group shapes into columns separated by horizontal gaps. */
function columns(shapes: Shape[]): Shape[][] {
  const sorted = [...shapes].sort((a, b) => a.box.x0 - b.box.x0)
  const groups: Shape[][] = []
  let current: Shape[] = []
  let edge = -Infinity
  for (const s of sorted) {
    if (current.length && s.box.x0 > edge + 12) {
      groups.push(current)
      current = []
    }
    current.push(s)
    edge = Math.max(edge, s.box.x1)
  }
  if (current.length) groups.push(current)
  return groups
}

/**
 * A square viewBox of side `side`, centred on the group's own centre.
 *
 * All six icons get the SAME side, so rendering them at one CSS size
 * reproduces the designer's row exactly — TikTok stays the tall narrow one,
 * YouTube the wide short one. Fitting each icon to its own tight box instead
 * would silently re-scale them relative to each other.
 */
function emit(shapes: Shape[], side: number): string {
  const cx =
    (Math.min(...shapes.map((s) => s.box.x0)) +
      Math.max(...shapes.map((s) => s.box.x1))) /
    2
  const cy =
    (Math.min(...shapes.map((s) => s.box.y0)) +
      Math.max(...shapes.map((s) => s.box.y1))) /
    2
  const x0 = cx - side / 2
  const y0 = cy - side / 2
  const paths = shapes
    .map((s) => {
      const brand = snap(s.fill)
      if (!brand) {
        throw new Error(
          `${s.fill} is more than ${MAX_SNAP_DISTANCE} from every KHAT colour — ` +
            `refusing to invent a palette entry`,
        )
      }
      // THE INK FOLLOWS ITS CONTEXT, THE ACCENT DOES NOT.
      //
      // The designer drew one version of each icon: indigo ink, one KHAT
      // Orange accent. Re-emitting the ink as `currentColor` is what lets that
      // single file sit on ivory in the site footer and on indigo in the email
      // footer — which is exactly how the social kit uses them (the story
      // templates carry the same strip on both grounds). The accent stays
      // baked, for the same reason the logo's fills are baked: "do not recolor"
      // is a rule in LOGO DO'S & DON'TS, and a token-derived orange breaks it
      // the first time a palette moves.
      const fill =
        PALETTE[brand] === "indigo"
          ? "currentColor"
          : PALETTE[brand] === "orange"
            ? KHAT_ORANGE
            : brand
      return `<path fill="${fill}" fill-rule="nonzero" d="${s.d}"/>`
    })
    .join("")
  // Anchored at 0 0 so `parseBrandSvg` accepts it; the translate carries the
  // paths, untouched, out of artboard space.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side.toFixed(2)} ${side.toFixed(2)}">` +
    `<g transform="translate(${(-x0).toFixed(2)} ${(-y0).toFixed(2)})">${paths}</g>` +
    `</svg>\n`
  )
}

function main() {
  if (!fs.existsSync(SOURCE_PDF)) {
    throw new Error(`source artwork not found: ${SOURCE_PDF}`)
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "khat-social-"))
  const svgPath = path.join(tmp, "icons.svg")
  execFileSync("pdftocairo", ["-svg", SOURCE_PDF, svgPath])
  const shapes = parseShapes(fs.readFileSync(svgPath, "utf8"))

  const inBand = (s: Shape, band: { top: number; bottom: number }) =>
    s.box.y0 >= band.top && s.box.y1 <= band.bottom

  const iconCols = columns(shapes.filter((s) => inBand(s, ICON_BAND)))
  if (iconCols.length !== PLATFORMS.length) {
    throw new Error(
      `expected ${PLATFORMS.length} icons in the band, measured ${iconCols.length} — ` +
        `the artboard changed; re-measure ICON_BAND before trusting this run`,
    )
  }

  // One square big enough for the tallest and the widest icon, plus a hair of
  // breathing room, shared by all six.
  const extents = iconCols.flatMap((g) => [
    Math.max(...g.map((s) => s.box.x1)) - Math.min(...g.map((s) => s.box.x0)),
    Math.max(...g.map((s) => s.box.y1)) - Math.min(...g.map((s) => s.box.y0)),
  ])
  // ONE SQUARE, SIZED AGAINST LUCIDE — the same rule `<KhatIcon>` follows.
  //
  // `lucide-react` draws every other icon on this site and its ink fills
  // 83.35% of its 24-unit box. These marks are drawn edge to edge, so a shared
  // square cut to the largest extent would render them ~20% bigger than the
  // lucide glyphs beside them in the same footer row. Dividing the set's MEAN
  // extent by lucide's fill ratio puts the two families on the same optical
  // size while keeping the six in the proportions the designer drew — TikTok
  // still the tall narrow one, YouTube still the wide short one.
  const LUCIDE_FILL_RATIO = 0.8335
  const meanExtent = extents.reduce((a, b) => a + b, 0) / extents.length
  const side = Math.max(
    meanExtent / LUCIDE_FILL_RATIO,
    // never clip: the widest mark must still fit
    Math.max(...extents) + 1,
  )

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const written: string[] = []
  const check = (name: string, count: number) => {
    if (count !== EXPECTED_PATHS[name]) {
      throw new Error(
        `${name}: measured ${count} paths, the artwork has ${EXPECTED_PATHS[name]} — ` +
          `a band or gap threshold is cutting the icon in half`,
      )
    }
  }
  iconCols.forEach((group, i) => {
    const name: Platform = PLATFORMS[i]
    check(name, group.length)
    fs.writeFileSync(path.join(OUT_DIR, `${name}.svg`), emit(group, side))
    written.push(`${name}  ${group.length} paths`)
  })

  const bubbleCols = columns(shapes.filter((s) => inBand(s, BUBBLE_BAND)))
  if (bubbleCols.length) {
    const b = bubbleCols[0]
    check("bubble", b.length)
    const bSide =
      Math.max(
        Math.max(...b.map((s) => s.box.x1)) - Math.min(...b.map((s) => s.box.x0)),
        Math.max(...b.map((s) => s.box.y1)) - Math.min(...b.map((s) => s.box.y0)),
      ) + 3
    fs.writeFileSync(path.join(OUT_DIR, "bubble.svg"), emit(b, bSide))
    written.push(`bubble  ${b.length} paths`)
  }
  written.push(`\nshared viewBox side: ${side.toFixed(2)}pt`)

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(written.join("\n"))
  console.log(`\n→ ${path.relative(process.cwd(), OUT_DIR)}`)
}

main()
