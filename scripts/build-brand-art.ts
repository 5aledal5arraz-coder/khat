/**
 * Regenerate `components/brand/khat-logo-art.ts` from the SVG assets in
 * `public/brand/`.
 *
 * The SVG files are the canonical artwork — they were cropped straight out of
 * the official Illustrator source (`PRIMARY LOGO LOGO SPACING LOGO MARK
 * PRIMARY TYPOGRAPHY.ai`) with no redraw, and they are what a designer or a
 * partner downloads. The generated TS module is the same geometry in a form
 * the app can inline: `<KhatLogo>` renders it, and the two print documents
 * (`lib/pdf/proposal-pdf.ts`, `app/admin/media-kit/page.tsx`) interpolate it
 * into their self-contained HTML, where a `/brand/*.svg` URL would not survive
 * "Save as PDF".
 *
 * One geometry, two representations, and `tests/brand/logo-art.test.ts` fails
 * if they ever drift.
 *
 *   npx tsx scripts/build-brand-art.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const BRAND_DIR = join(process.cwd(), "public", "brand")
const OUT = join(process.cwd(), "components", "brand", "khat-logo-art.ts")

/** file name (without .svg) → exported constant name */
const EXPORT_NAMES: Record<string, string> = {
  "khat-lockup-horizontal": "LOCKUP_HORIZONTAL",
  "khat-lockup-vertical": "LOCKUP_VERTICAL",
  "khat-lockup-vertical-reversed": "LOCKUP_VERTICAL_REVERSED",
  "khat-mark": "MARK",
  "khat-mark-orange": "MARK_ORANGE",
  "khat-mark-reversed": "MARK_REVERSED",
  "khat-secondary-mark": "SECONDARY_MARK",
}

export interface ParsedArt {
  width: number
  height: number
  body: string
}

/** Pull the viewBox dimensions and the inner markup out of a cropped asset. */
export function parseBrandSvg(svg: string, label: string): ParsedArt {
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  if (!viewBox) {
    throw new Error(`${label}: expected a viewBox anchored at 0 0 (asset is not cropped)`)
  }
  const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1]?.trim()
  if (!body) throw new Error(`${label}: no markup inside <svg>`)
  if (body.includes("<rect")) {
    throw new Error(`${label}: still carries a background <rect> — crop it out`)
  }
  return { width: Number(viewBox[1]), height: Number(viewBox[2]), body }
}

export function readBrandArt(dir = BRAND_DIR): Record<string, ParsedArt> {
  const out: Record<string, ParsedArt> = {}
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".svg")) continue
    const key = file.replace(/\.svg$/, "")
    const name = EXPORT_NAMES[key]
    if (!name) throw new Error(`public/brand/${file}: no export name registered in EXPORT_NAMES`)
    out[name] = parseBrandSvg(readFileSync(join(dir, file), "utf8"), file)
  }
  const missing = Object.values(EXPORT_NAMES).filter((n) => !(n in out))
  if (missing.length) throw new Error(`missing assets for: ${missing.join(", ")}`)
  return out
}

export function renderArtModule(art: Record<string, ParsedArt>): string {
  const entries = Object.entries(art)
    .map(
      ([name, a]) =>
        `export const ${name}: BrandArt = {\n` +
        `  width: ${a.width},\n` +
        `  height: ${a.height},\n` +
        `  body:\n    ${JSON.stringify(a.body)},\n` +
        `}\n`,
    )
    .join("\n")

  return `// GENERATED FILE — do not edit by hand.
// Source of truth: public/brand/*.svg (cropped from the official Illustrator
// artwork). Regenerate with: npx tsx scripts/build-brand-art.ts
//
// The colours below are baked into the path fills, exactly as the brand file
// defines them. They are NOT props and NOT theme tokens: "do not change the
// logo colours" is a binding rule in the identity guide, and a token-derived
// fill would break it the first time a palette moves.

/** The official primary palette (KHAT COLOR SYSTEM, p.12 of the identity file). */
export const KHAT_INDIGO = "#362e6d"
export const KHAT_ORANGE = "#fd4f04"
export const KHAT_IVORY = "#f8f3ef"

export interface BrandArt {
  /** Intrinsic width in viewBox units. */
  readonly width: number
  /** Intrinsic height in viewBox units. */
  readonly height: number
  /** The \`<path>\` elements, ready to drop inside an \`<svg>\`. */
  readonly body: string
}

${entries}`
}

function main() {
  const art = readBrandArt()
  writeFileSync(OUT, renderArtModule(art))
  for (const [name, a] of Object.entries(art)) {
    console.log(`${name.padEnd(26)} ${a.width} x ${a.height}  (${a.body.length} B)`)
  }
  console.log(`\nwrote ${OUT}`)
}

if (process.argv[1]?.endsWith("build-brand-art.ts")) main()
