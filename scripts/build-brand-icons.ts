/**
 * Generates the app's icon set from the real logo artwork.
 *
 *   app/icon.svg                  browser tab (modern) — indigo mark, transparent
 *   app/favicon.ico               browser tab (legacy) — 16 + 32, same treatment
 *   app/apple-icon.png            iOS home screen, 180 — ivory mark on an indigo tile
 *   public/brand/icon-192.png     PWA
 *   public/brand/icon-512.png     PWA
 *   public/brand/khat-lockup-horizontal.png
 *                                 the Organization logo in the homepage JSON-LD,
 *                                 which wants a raster with real pixel dimensions
 *
 * TWO TREATMENTS, ON PURPOSE. The tab favicon is the mark on its own, because a
 * 16px tile is mostly container and the glyph inside it lands at ~10px. The home
 * screen icon is the mark inside an indigo tile, because iOS and Android draw
 * their own background behind a transparent icon and the mark would float on
 * whatever wallpaper is underneath. The full lockup is never used for either:
 * at 48px the `PODCAST KHAT` line is about four pixels tall.
 *
 * The ivory-on-indigo tile is the identity file's own reversed treatment (the
 * reversed lockup page), not a recolour: the mark keeps a single flat brand
 * colour and its counter shows the tile through, exactly as it does there.
 *
 * Run: npx tsx scripts/build-brand-icons.ts
 * The generated files are committed; nothing at runtime depends on this script.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"

import { KHAT_INDIGO, MARK, MARK_REVERSED, LOCKUP_HORIZONTAL } from "../components/brand/khat-logo-art"

const ROOT = path.join(__dirname, "..")
const APP = path.join(ROOT, "app")
const BRAND = path.join(ROOT, "public", "brand")

/** Clear space, per the identity file: x = ⅙ of the logo's width. */
const PAD = MARK.width / 6

/**
 * The mark centred on a square canvas.
 *
 * `pad` is the clear space. The home-screen tile gets it — it is a composition,
 * and iOS rounds the corners in. The 16px tab icon gets none: clear space
 * governs what may sit *beside* the logo in a layout, not the inside of an icon
 * canvas, and spending 2 of 16 pixels on margin is what turns the mark into a
 * smudge.
 */
function squareMarkSvg(body: string, background: string | null, pad: number): string {
  const round = (n: number) => Math.round(n * 100) / 100
  const side = round(MARK.width + pad * 2)
  // Vertical centring only — the mark is 1.4:1 and the canvas is square. This
  // is the one transform in the icon set, and it must never become a scale.
  const y = round((side - MARK.height) / 2 - pad)
  const tile = background
    ? `<rect x="${round(-pad)}" y="${round(-pad)}" width="${side}" height="${side}" fill="${background}"/>`
    : ""
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(-pad)} ${round(-pad)} ${side} ${side}">` +
    `${tile}<g transform="translate(0 ${y})">${body}</g></svg>`
  )
}

const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

/**
 * Minimal ICO container holding PNG payloads — what every browser released this
 * decade reads, and far smaller than the BMP form.
 */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries: Buffer[] = []
  for (const img of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    e.writeUInt8(0, 2) // palette
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(img.data.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += img.data.length
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

async function main() {
  mkdirSync(BRAND, { recursive: true })

  // Tab icon — the mark alone, no tile.
  const tabSvg = squareMarkSvg(MARK.body, null, 0)
  writeFileSync(path.join(APP, "icon.svg"), tabSvg + "\n")

  writeFileSync(
    path.join(APP, "favicon.ico"),
    ico([
      { size: 16, data: await png(tabSvg, 16) },
      { size: 32, data: await png(tabSvg, 32) },
    ]),
  )

  // Home-screen icons — ivory mark on an indigo tile.
  const tileSvg = squareMarkSvg(MARK_REVERSED.body, KHAT_INDIGO, PAD)
  const tile180 = await png(tileSvg, 180)
  writeFileSync(path.join(APP, "apple-icon.png"), tile180)
  // iOS and some crawlers probe /apple-touch-icon.png directly, ignoring the
  // <link> Next emits. That path held a 1.4MB copy of the RETIRED gold logo.
  writeFileSync(path.join(ROOT, "public", "apple-touch-icon.png"), tile180)
  writeFileSync(path.join(BRAND, "icon-192.png"), await png(tileSvg, 192))
  writeFileSync(path.join(BRAND, "icon-512.png"), await png(tileSvg, 512))

  // Raster lockup for structured data.
  const lockupSvg = readFileSync(path.join(BRAND, "khat-lockup-horizontal.svg"))
  const lockupWidth = 1200
  writeFileSync(
    path.join(BRAND, "khat-lockup-horizontal.png"),
    await sharp(lockupSvg)
      .resize({ width: lockupWidth })
      .flatten({ background: "#ffffff" }) // JSON-LD consumers composite on unknown surfaces
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )

  console.log("icons written:")
  for (const f of [
    "app/icon.svg",
    "app/favicon.ico",
    "app/apple-icon.png",
    "public/apple-touch-icon.png",
    "public/brand/icon-192.png",
    "public/brand/icon-512.png",
    "public/brand/khat-lockup-horizontal.png",
  ]) {
    console.log(`  ${f}`)
  }
  console.log(
    `\nlockup raster: ${lockupWidth}x${Math.round(
      (lockupWidth * LOCKUP_HORIZONTAL.height) / LOCKUP_HORIZONTAL.width,
    )}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
