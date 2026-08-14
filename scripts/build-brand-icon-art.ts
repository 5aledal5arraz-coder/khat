/**
 * Regenerate `components/brand/khat-icon-art.ts` from `public/brand/icons/*.svg`.
 *
 * Same contract as `build-brand-art.ts`, one level down: the SVG files are the
 * canonical artwork (cropped from the identity file by
 * `scripts/extract-brand-icons.ts`, never redrawn) and this emits the geometry
 * in the form the app inlines. Inlining rather than `<img src>` is what lets a
 * mono glyph inherit `currentColor` from the element that contains it — an
 * `<img>` cannot, and that is the whole reason the mono variant exists.
 *
 * `tests/brand/icon-art.test.ts` fails if the module and the SVGs drift.
 *
 *   npx tsx scripts/build-brand-icon-art.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { parseBrandSvg, type ParsedArt } from "./build-brand-art"

const ICON_DIR = join(process.cwd(), "public", "brand", "icons")
const OUT = join(process.cwd(), "components", "brand", "khat-icon-art.ts")

/** Left-to-right on p.13/p.15 of the identity file. Must match the extractor. */
export const ICON_NAMES = ["archive", "card", "idea", "conversation", "play", "guest"] as const

/**
 * Not a seventh glyph. The diamond is the dot of the خ — the accent that signs
 * four of the six and the logo itself — so it is exported on its own and typed
 * apart from `KhatIconName`, which keeps it out of anywhere that iterates the
 * icon set.
 */
const DIAMOND = "diamond"

const CONST = (name: string, mono: boolean) =>
  `${name.toUpperCase()}${mono ? "_MONO" : ""}`

export function readIconArt(dir = ICON_DIR): Record<string, ParsedArt> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()
  const out: Record<string, ParsedArt> = {}

  for (const file of files) {
    const key = file.replace(/\.svg$/, "")
    const mono = key.endsWith("-mono")
    const name = mono ? key.slice(0, -"-mono".length) : key
    if (name !== DIAMOND && !(ICON_NAMES as readonly string[]).includes(name)) {
      throw new Error(`public/brand/icons/${file}: "${name}" is not a registered icon`)
    }
    const art = parseBrandSvg(readFileSync(join(dir, file), "utf8"), file)
    if (art.width !== art.height) {
      throw new Error(`${file}: icons must be square, got ${art.width}x${art.height}`)
    }
    // A mono glyph that still carries a baked fill cannot follow its context,
    // and an accent glyph that carries currentColor would lose the orange.
    if (mono && !art.body.includes("currentColor")) {
      throw new Error(`${file}: mono variant has no currentColor fill`)
    }
    if (!mono && art.body.includes("currentColor")) {
      throw new Error(`${file}: accent variant must carry baked fills, not currentColor`)
    }
    out[CONST(name, mono)] = art
  }

  const expected = [...ICON_NAMES, DIAMOND].flatMap((n) => [CONST(n, false), CONST(n, true)])
  const missing = expected.filter((n) => !(n in out))
  if (missing.length) throw new Error(`missing icon assets for: ${missing.join(", ")}`)
  return out
}

export function renderIconArtModule(art: Record<string, ParsedArt>): string {
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

  const registry = ICON_NAMES.map(
    (n) => `  ${n}: { accent: ${CONST(n, false)}, mono: ${CONST(n, true)} },`,
  ).join("\n")

  return `// GENERATED FILE — do not edit by hand.
// Source of truth: public/brand/icons/*.svg, cropped from the official
// Illustrator artwork by scripts/extract-brand-icons.ts.
// Regenerate with: npx tsx scripts/build-brand-icon-art.ts

import type { BrandArt } from "./khat-logo-art"

/** The six glyphs of KHAT ICON SYSTEM (identity file, p.13-16). */
export const KHAT_ICON_NAMES = ${JSON.stringify(ICON_NAMES)} as const
export type KhatIconName = (typeof KHAT_ICON_NAMES)[number]

${entries}
/**
 * \`accent\` is p.13 — two inks, baked, exactly like the logo's fills.
 * \`mono\` is p.15 — one ink, re-emitted as \`currentColor\` so a glyph can take
 * the colour of the control it sits in. Both are the identity's own artwork.
 */
export const KHAT_ICON_ART: Record<KhatIconName, { accent: BrandArt; mono: BrandArt }> = {
${registry}
}

/**
 * The dot of the خ, lifted out of the \`card\` glyph. It is the identity's
 * signature accent, not a seventh icon — deliberately typed apart from
 * \`KhatIconName\` so nothing that iterates the set picks it up.
 */
export const KHAT_DIAMOND_ART = { accent: DIAMOND, mono: DIAMOND_MONO } as const
`
}

function main() {
  const art = readIconArt()
  writeFileSync(OUT, renderIconArtModule(art))
  for (const [name, a] of Object.entries(art)) {
    console.log(`${name.padEnd(22)} ${a.width} x ${a.height}  (${a.body.length} B)`)
  }
  console.log(`\nwrote ${OUT}`)
}

if (process.argv[1]?.endsWith("build-brand-icon-art.ts")) main()
