/**
 * Regenerate `components/brand/khat-social-art.ts` from `public/brand/social/*.svg`.
 *
 * Same contract as `build-brand-icon-art.ts`: the SVG files are the canonical
 * artwork — split out of the designer's `SOCIAL MEDIA ICON/ICON.pdf` by
 * `scripts/extract-social-icons.ts`, never redrawn — and this emits the same
 * geometry in the form the app inlines, so a mark can inherit `currentColor`
 * from the footer it sits in. An `<img src>` cannot do that, which is why the
 * files are inlined rather than linked.
 *
 * `tests/brand/social-art.test.ts` fails if the module and the SVGs drift.
 *
 *   npx tsx scripts/build-social-icon-art.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { parseBrandSvg, type ParsedArt } from "./build-brand-art"

const SOCIAL_DIR = join(process.cwd(), "public", "brand", "social")
const OUT = join(process.cwd(), "components", "brand", "khat-social-art.ts")

/**
 * Left-to-right on the artboard. Must match `PLATFORMS` in the extractor.
 *
 * THIS IS THE WHOLE SET. The designer drew six platforms; where KHAT has an
 * account the identity does not cover (Facebook, Threads, Snapchat…), the stock
 * mark in `components/icons/` stays. Redrawing a seventh in this style would be
 * us designing the identity instead of applying it — the same rule the six
 * KHAT ICON SYSTEM glyphs follow.
 */
export const SOCIAL_NAMES = [
  "tiktok",
  "spotify",
  "instagram",
  "youtube",
  "podcast",
  "x",
] as const

/**
 * Not a seventh platform. The bare speech bubble sits under the six on the same
 * artboard; it is the identity's core shape, exported on its own and typed
 * apart so nothing iterating the platforms picks it up.
 */
const BUBBLE = "bubble"

export function readSocialArt(dir = SOCIAL_DIR): Record<string, ParsedArt> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()
  const out: Record<string, ParsedArt> = {}

  for (const file of files) {
    const name = file.replace(/\.svg$/, "")
    if (name !== BUBBLE && !(SOCIAL_NAMES as readonly string[]).includes(name)) {
      throw new Error(`public/brand/social/${file}: "${name}" is not a registered platform`)
    }
    const art = parseBrandSvg(readFileSync(join(dir, file), "utf8"), file)
    if (art.width !== art.height) {
      throw new Error(`${file}: marks must be square, got ${art.width}x${art.height}`)
    }
    // The ink has to follow the footer it sits in, and the accent has to not.
    if (!art.body.includes("currentColor")) {
      throw new Error(`${file}: no currentColor ink — the mark cannot follow its context`)
    }
    if (!art.body.includes("#fd4f04")) {
      throw new Error(`${file}: no KHAT Orange accent — every one of the six carries one`)
    }
    out[name.toUpperCase()] = art
  }

  const expected = [...SOCIAL_NAMES, BUBBLE].map((n) => n.toUpperCase())
  const missing = expected.filter((n) => !(n in out))
  if (missing.length) throw new Error(`missing social assets for: ${missing.join(", ")}`)
  return out
}

export function renderSocialArtModule(art: Record<string, ParsedArt>): string {
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

  const registry = SOCIAL_NAMES.map((n) => `  ${n}: ${n.toUpperCase()},`).join("\n")

  return `// GENERATED FILE — do not edit by hand.
// Source of truth: public/brand/social/*.svg, split out of the designer's
// SOCIAL MEDIA ICON/ICON.pdf by scripts/extract-social-icons.ts.
// Regenerate with: npx tsx scripts/build-social-icon-art.ts

import type { BrandArt } from "./khat-logo-art"

/** The six platforms the identity draws. */
export const KHAT_SOCIAL_NAMES = ${JSON.stringify(SOCIAL_NAMES)} as const
export type KhatSocialName = (typeof KHAT_SOCIAL_NAMES)[number]

${entries}
/**
 * All six share one viewBox side, so rendering them at a single size
 * reproduces the designer's row exactly — TikTok stays the tall narrow one,
 * YouTube the wide short one. Fitting each to its own tight box would silently
 * re-scale them against each other.
 */
export const KHAT_SOCIAL_ART: Record<KhatSocialName, BrandArt> = {
${registry}
}

/** The bare speech bubble from the same artboard — the identity's core shape. */
export const KHAT_BUBBLE_ART = BUBBLE
`
}

function main() {
  const art = readSocialArt()
  writeFileSync(OUT, renderSocialArtModule(art))
  for (const [name, a] of Object.entries(art)) {
    console.log(`${name.padEnd(12)} ${a.width} x ${a.height}  (${a.body.length} B)`)
  }
  console.log(`\nwrote ${OUT}`)
}

if (process.argv[1]?.endsWith("build-social-icon-art.ts")) main()
