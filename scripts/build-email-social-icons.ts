/**
 * Rasterises the newsletter's social icons from the identity's own artwork.
 *
 *   public/brand/social/{key}.svg  →  public/brand/social/{key}.png   (2× of the 30px chip)
 *
 * WHAT THIS REPLACES — TWICE OVER. The footer first used four Unicode glyphs as
 * stand-ins: `&#9679;` (● BLACK CIRCLE) for Instagram, `&#9654;` (▶ TRIANGLE)
 * for YouTube, `&#9836;` (♬ BEAMED NOTES) for TikTok and a mathematical-italic x
 * for X. None of them is the platform's mark, and because a glyph is drawn by
 * whatever font the mail client picks, the same message rendered differently in
 * every inbox.
 *
 * They were then replaced by hand-written monochrome silhouettes of each
 * platform's official mark, in one muted violet. Better, but still not KHAT: a
 * stock Instagram glyph tinted violet is a stock glyph, sitting one row under a
 * logo that is the real thing.
 *
 * The designer had already drawn all six — TikTok, Spotify, Instagram, YouTube,
 * Podcast and X, each carrying the diamond that signs the logo
 * (`SOCIAL MEDIA ICON/ICON.pdf`). This file now rasterises THAT, so the footer
 * and the site render the same marks from the same source
 * (`scripts/extract-social-icons.ts` → `public/brand/social/*.svg`).
 *
 * WHY PNG AND NOT SVG — the same constraint `khatLockup()` documents in
 * templates.ts: Gmail strips inline `<svg>` from message bodies and will not
 * load `<img src="*.svg">`, and Outlook's Word renderer cannot draw one. A
 * hosted raster is the only vector-quality option that survives every client.
 *
 * 2× because the chip is 30px and phone inboxes are retina; the `<img>` is
 * declared at 15px so the extra pixels only sharpen it.
 *
 * TWO INKS, BOTH THE IDENTITY'S. The marks are drawn in KHAT Indigo with a KHAT
 * Orange diamond, and that is what ships — `currentColor` has no meaning inside
 * a PNG, so the ink is resolved here. The previous single muted violet was
 * chosen to keep four saturated *platform* logos from shouting; that argument
 * does not apply to KHAT's own two colours, which is what these are.
 *
 * Run: npx tsx scripts/build-email-social-icons.ts
 */

import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

import { KHAT_INDIGO } from "../components/brand/khat-logo-art"

/** Rendered size. The chip is 30px; the mark sits at 15px inside it. */
const CANVAS = 60

const LABELS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
  spotify: "Spotify",
  podcast: "Podcast",
}

async function main() {
  const dir = path.join(process.cwd(), "public", "brand", "social")
  const files = (await readdir(dir)).filter((f) => f.endsWith(".svg")).sort()

  const rendered: string[] = []
  for (const file of files) {
    const key = file.replace(/\.svg$/, "")
    const label = LABELS[key]
    // `bubble.svg` shares this directory and is not a platform.
    if (!label) continue

    const source = await readFile(path.join(dir, file), "utf8")
    if (!source.includes("currentColor")) {
      throw new Error(`${file}: no currentColor ink to resolve — artwork changed shape`)
    }

    const svg = source
      .replace(/currentColor/g, KHAT_INDIGO)
      .replace("<svg ", `<svg width="${CANVAS}" height="${CANVAS}" `)

    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
    await writeFile(path.join(dir, `${key}.png`), png)
    rendered.push(`  ✓ ${label.padEnd(10)} → public/brand/social/${key}.png  (${png.length} bytes)`)
  }

  if (!rendered.length) {
    throw new Error("no platform artwork found — run scripts/extract-social-icons.ts first")
  }
  console.log(rendered.join("\n"))
  console.log(`\nDone — ${rendered.length} icons at ${CANVAS}×${CANVAS}, ink ${KHAT_INDIGO} + the orange diamond.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
