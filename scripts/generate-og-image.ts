/**
 * Generates `public/og-image.png` — the site-wide Open Graph card.
 *
 * WHY THIS EXISTS
 * `site_settings.seo.defaultOgImage` ships as "/og-image.png" (seeded from
 * config/site-settings.json), and the root layout feeds that value into
 * `openGraph.images` + `twitter:image` for every page that does not override it.
 * The asset itself was never created, so ~10 public pages advertised a 404 image
 * on a `summary_large_image` card — every WhatsApp / X / LinkedIn share rendered
 * blank. This script produces the missing asset at the canonical OG size.
 *
 * WHAT IT USED TO DO, AND WHY THAT WAS WRONG
 * The card was assembled out of `public/logo-wide.jpg`, greyscaled and inverted
 * into a white mask, on a three-stop gradient. Three separate problems, all of
 * them visible to everyone who ever shared a link:
 *
 *  1. `logo-wide.jpg` is not the logo. It is a SLOGAN lockup — «كالعبارات التي
 *     تضع تحتها خطاً» — set in a periwinkle purple that is in no KHAT palette.
 *     So the card advertised neither the mark nor the wordmark.
 *  2. The gradient stops (#54409f, #493597, #2f2560) and the orange (#f36a1b)
 *     were invented values, two of them the CSS lookalike's own.
 *  3. A gradient plus a radial glow behind the identity is two of the six formal
 *     "don'ts" in the identity guide.
 *
 * WHAT IT DOES NOW
 * The reversed vertical lockup — real artwork, already ivory, already carrying
 * «بودكاست خط / PODCAST KHAT» — centred on a flat indigo field. That pairing is
 * the identity file's own reversed treatment, not a recolour. No gradient, no
 * glow, no text rendered by this script: Arabic shaping in an SVG rasteriser is
 * unreliable, which is why the artwork travels as vector geometry instead.
 *
 * Run: npx tsx scripts/generate-og-image.ts
 * The generated PNG is committed; nothing at runtime depends on this script.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"

import {
  KHAT_INDIGO,
  LOCKUP_VERTICAL_REVERSED,
} from "../components/brand/khat-logo-art"

/** Open Graph canonical card size (1.91:1) — what WhatsApp / X / LinkedIn crop to. */
const WIDTH = 1200
const HEIGHT = 630

/**
 * Lockup height as a fraction of the card height.
 *
 * The binding constraint is the identity file's clear space, x = ⅙ of the
 * logo's width, which nothing may intrude on — including the card edge. At this
 * size the reserved margin is far smaller than the space actually left around
 * the mark, so the rule holds with room to spare; `assertClearSpace` below
 * checks it rather than trusting this comment.
 */
const LOCKUP_FRACTION = 0.46

const ROOT = path.join(__dirname, "..")
const BRAND = path.join(ROOT, "public", "brand")
const OUTPUT = path.join(ROOT, "public", "og-image.png")

function assertClearSpace(w: number, h: number, left: number, top: number): void {
  const clear = w / 6
  const gaps = { start: left, end: WIDTH - (left + w), top, bottom: HEIGHT - (top + h) }
  const tight = Object.entries(gaps).filter(([, g]) => g < clear)
  if (tight.length) {
    throw new Error(
      `og card: ${tight.map(([k, g]) => `${k} gap ${Math.round(g)}px`).join(", ")} ` +
        `is inside the mandated clear space of ${Math.round(clear)}px. Lower LOCKUP_FRACTION.`,
    )
  }
}

async function main() {
  const lockupHeight = Math.round(HEIGHT * LOCKUP_FRACTION)
  const lockupWidth = Math.round(
    (lockupHeight * LOCKUP_VERTICAL_REVERSED.width) / LOCKUP_VERTICAL_REVERSED.height,
  )
  const left = Math.round((WIDTH - lockupWidth) / 2)
  const top = Math.round((HEIGHT - lockupHeight) / 2)
  assertClearSpace(lockupWidth, lockupHeight, left, top)

  // The vector, scaled — never a raster of a raster.
  const lockup = await sharp(path.join(BRAND, "khat-lockup-vertical-reversed.svg"))
    .resize({ height: lockupHeight })
    .png()
    .toBuffer()

  const card = sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: KHAT_INDIGO },
  })

  writeFileSync(
    OUTPUT,
    await card.composite([{ input: lockup, top, left }]).png({ compressionLevel: 9 }).toBuffer(),
  )

  console.log(
    `Wrote ${OUTPUT} (${WIDTH}x${HEIGHT}, ${readFileSync(OUTPUT).length} bytes)\n` +
      `  lockup ${lockupWidth}x${lockupHeight} at ${left},${top} on flat ${KHAT_INDIGO}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
