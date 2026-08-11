/**
 * Generates the newsletter's social icons as hosted PNGs.
 *
 *   public/brand/social/{youtube,instagram,x,tiktok}.png   60×60 (2× of the 30px chip)
 *
 * WHAT THIS REPLACES. The footer used four Unicode glyphs as stand-ins:
 * `&#9679;` (● BLACK CIRCLE) for Instagram, `&#9654;` (▶ TRIANGLE) for YouTube,
 * `&#9836;` (♬ BEAMED NOTES) for TikTok and a mathematical-italic x for X. None
 * of them is the platform's mark, and because a glyph is drawn by whatever font
 * the mail client happens to pick, the same message rendered differently in
 * every inbox — Khaled's screenshot showed a circle, a play triangle and a
 * music note sitting in a row as if they meant something.
 *
 * WHY PNG AND NOT SVG — the same constraint `khatLockup()` documents a few lines
 * up in templates.ts: Gmail strips inline `<svg>` from message bodies and will
 * not load `<img src="*.svg">`, and Outlook's Word renderer cannot draw one. A
 * hosted raster is the only vector-quality option that survives every client.
 *
 * 2× because the chip is 30px and phone inboxes are retina; the `<img>` is
 * declared at 18px so the extra pixels only sharpen it.
 *
 * ONE INK: `STANDALONE_MUTED`, the same violet the chip's border and the
 * footer's text already use. Platform brand colours are deliberately NOT used —
 * four saturated logos under a muted footer would be the loudest thing in the
 * message, and the row reads as navigation, not as advertising.
 *
 * Run: npx tsx scripts/build-email-social-icons.ts
 */

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

import { STANDALONE_MUTED } from "../lib/brand/standalone-css"

/** Rendered size. The chip is 30px; the mark sits at 18px inside it. */
const CANVAS = 60
const MARK = 36

/**
 * Official marks, as single paths on a 24×24 grid.
 *
 * Simplified monochrome silhouettes — the shape each platform is recognised by,
 * which is what a 18px chip can carry. Nothing here is invented: an invented
 * social mark is the same class of mistake as the replica logo this file's
 * neighbour was written to end.
 */
const MARKS: Record<string, { label: string; path: string }> = {
  youtube: {
    label: "YouTube",
    path: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z",
  },
  instagram: {
    label: "Instagram",
    path: "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.9a5.9 5.9 0 1 0 0 11.8 5.9 5.9 0 0 0 0-11.8zm0 9.7a3.8 3.8 0 1 1 0-7.6 3.8 3.8 0 0 1 0 7.6zm7.5-9.9a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0z",
  },
  x: {
    label: "X",
    path: "M18.9 2.3h3.7l-8 9.1 9.4 12.4h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 2.3h7.6l5.2 6.9 6.1-6.9zm-1.3 19.3h2L6.5 4.3H4.3l13.3 17.3z",
  },
  tiktok: {
    label: "TikTok",
    path: "M16.6 0h3.4c.2 1.7 1.1 3.2 2.5 4.1 1 .7 2.2 1 3.4 1v3.5a9.2 9.2 0 0 1-5.4-1.8v7.9a7 7 0 1 1-6-6.9v3.6a3.4 3.4 0 1 0 2.4 3.3V0z",
  },
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "brand", "social")
  await mkdir(outDir, { recursive: true })

  const inset = (CANVAS - MARK) / 2

  for (const [key, { label, path: d }] of Object.entries(MARKS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <g transform="translate(${inset} ${inset}) scale(${MARK / 24})">
    <path d="${d}" fill="${STANDALONE_MUTED}"/>
  </g>
</svg>`

    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
    const file = path.join(outDir, `${key}.png`)
    await writeFile(file, png)
    console.log(`  ✓ ${label.padEnd(10)} → public/brand/social/${key}.png  (${png.length} bytes)`)
  }

  console.log(`\nDone — ${Object.keys(MARKS).length} icons at ${CANVAS}×${CANVAS}, ink ${STANDALONE_MUTED}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
