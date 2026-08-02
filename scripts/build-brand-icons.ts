/**
 * Generates the app's icon set from the real logo artwork.
 *
 *   app/icon.svg                        browser tab (modern)
 *   app/favicon.ico                     browser tab (legacy) — 16 + 32
 *   app/apple-icon.png                  iOS home screen, 180
 *   public/apple-touch-icon.png         the bare path iOS and crawlers probe
 *   public/brand/icon-192.png           PWA
 *   public/brand/icon-512.png           PWA, purpose "any"
 *   public/brand/icon-maskable-512.png  PWA, purpose "maskable"
 *   public/brand/khat-lockup-horizontal.png
 *                                       the Organization logo in the homepage
 *                                       JSON-LD, which wants a raster with real
 *                                       pixel dimensions
 *
 * ONE TREATMENT: the ivory mark on an indigo tile, on every icon surface.
 *
 * It used to be two. The tab icon (icon.svg + favicon.ico) shipped as the indigo
 * mark on transparency while every home-screen surface shipped as the tile, and
 * nothing said so out loud — the split lived only in the shape of this file.
 *
 * The transparent tab icon inherits whatever the browser paints behind it, and
 * that is measurably a bug, not a preference: #362e6d on a light tab strip is
 * 11.87:1, but on Chrome's dark tab strip (#202124) it is 1.36:1 — invisible.
 * The tile fixes the contrast at 10.78:1 in both themes. It is also the only
 * treatment that survives the platform: iOS and Android paint their own
 * background behind a transparent icon, so the mark would otherwise float on
 * whatever the user's wallpaper happens to be.
 *
 * THE TRADE-OFF, stated because it is real: a tile costs canvas. At the 16px
 * favicon slot the mark goes from 11.4px tall to 9.8px, and solid ink drops
 * from 13.7% of the canvas to about 9%. That buys contrast that works in both
 * themes, and a recognisable indigo block, which is most of what a favicon does
 * at that size.
 *
 * The ivory-on-indigo tile is the identity file's own reversed treatment (p.11
 * is exactly this, as an app icon), not a recolour: the mark keeps one flat
 * brand colour. The full lockup is never used for an icon — at 48px the
 * `PODCAST KHAT` line is about four pixels tall.
 *
 * Run: npx tsx scripts/build-brand-icons.ts
 * The generated files are committed; nothing at runtime depends on this script.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"

import { KHAT_INDIGO, MARK, MARK_REVERSED, LOCKUP_HORIZONTAL } from "../components/brand/khat-logo-art"
import { EMAIL_LOCKUP_HEIGHT, MIN_HEIGHT } from "../components/brand/khat-logo-geometry"

const ROOT = path.join(__dirname, "..")
const APP = path.join(ROOT, "app")
const BRAND = path.join(ROOT, "public", "brand")

/**
 * Margin between the mark and the tile edge — ONE value, every icon.
 *
 * Deliberately NOT the identity file's clear space (x = ⅙ of the logo's width).
 * Clear space is a rule about what may sit *beside* the logo inside a layout;
 * an icon canvas is a dedicated surface with nothing else on it, so applying
 * the layout rule there just shrinks the mark for no protection. Half of it
 * reads as a normal app tile and buys back 1.2px of mark at the 16px slot,
 * which at that size is the difference between a shape and a smudge.
 */
const TILE_PAD = MARK.width / 12

/** Canvas side, and the fraction of it the mark's height occupies. */
const TILE_SIDE = MARK.width + TILE_PAD * 2
const MARK_FRACTION = MARK.height / TILE_SIDE

/**
 * The one place the icon pipeline is allowed to fall below `MIN_HEIGHT.mark`.
 *
 * `KhatLogo` clamps every layout logo to 20px and warns. The icon path cannot
 * clamp: a browser tab slot is 16 or 32 device-independent pixels and there is
 * no larger option to render into. So the rule genuinely does not reach here —
 * but "does not reach here" has to be written down and checked, not inferred
 * from a missing call. `assertMinHeightPolicy` below fails the build if any
 * icon outside this list renders the mark under the minimum, which is what
 * stops the exemption from quietly spreading to a new surface.
 *
 * At the current TILE_PAD the first canvas that satisfies MIN_HEIGHT.mark is
 * 33px, so 16 and 32 are exactly the sizes that cannot — and every home-screen
 * and PWA size (180 and up) clears it several times over. The build prints the
 * effective mark height for every size so this stays checkable rather than
 * asserted in prose.
 */
const MIN_HEIGHT_EXEMPT: readonly number[] = [16, 32]

function assertMinHeightPolicy(sizes: number[]): void {
  const offenders = sizes.filter(
    (s) => !MIN_HEIGHT_EXEMPT.includes(s) && s * MARK_FRACTION < MIN_HEIGHT.mark,
  )
  if (offenders.length) {
    throw new Error(
      `icon sizes ${offenders.join(", ")} render the mark below MIN_HEIGHT.mark ` +
        `(${MIN_HEIGHT.mark}px) and are not in MIN_HEIGHT_EXEMPT. Either raise the ` +
        `size or add it to the exemption list with a reason.`,
    )
  }
}

/**
 * The mark centred on a square canvas.
 *
 * `pad` is the margin between the mark and the tile edge — TILE_PAD for every
 * shipped icon, except the maskable one, which passes MASKABLE_PAD because
 * Android crops that canvas to a circle.
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

/**
 * Padding for the `maskable` icon.
 *
 * Android may crop a maskable icon to any shape inside a circle of 80% of the
 * canvas — everything outside is expendable. The manifest used to declare ONE
 * 512 asset for both `any` and `maskable`, and that asset reached 98.2% of the
 * safe radius: it fit, with 1.8% to spare, which is not a margin. On the
 * current tile the same reuse would reach 112% and the bubble's tail would be
 * cropped off on a Pixel with nothing here to say so. Hence a separate asset.
 *
 * The mark's extreme radius from the canvas centre is a property of the artwork
 * alone (it is centred on both axes), so widening the canvas is the only lever.
 * This value lands the artwork at ~84% of the safe radius, and
 * `assertMaskableSafeZone` re-measures it from the rendered pixels every build
 * rather than trusting the arithmetic.
 */
const MASKABLE_PAD = 71

/** Fraction of the canvas diameter Android guarantees it will not crop. */
const MASKABLE_SAFE_FRACTION = 0.8

/**
 * How much of the maskable safe circle the artwork actually uses, measured from
 * the rendered pixels rather than derived: the point that matters is on a
 * bezier, and eyeballing a bounding box is how the tail gets clipped.
 *
 * Returns a ratio of the safe radius; > 1 means Android may crop the artwork.
 * Only the icon declared `purpose: "maskable"` has to satisfy this — the `any`
 * icon is drawn as-is and is allowed to fill its canvas.
 */
async function safeZoneUsage(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: c } = info
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  // The tile is flat indigo; anything lighter than it is mark.
  const [ir, ig, ib] = [0x36, 0x2e, 0x6d]
  let maxR = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c
      const isMark =
        Math.abs(data[i] - ir) + Math.abs(data[i + 1] - ig) + Math.abs(data[i + 2] - ib) > 60
      if (!isMark) continue
      const r = Math.hypot(x - cx, y - cy)
      if (r > maxR) maxR = r
    }
  }
  return maxR / ((MASKABLE_SAFE_FRACTION / 2) * w)
}

async function assertMaskableSafeZone(png: Buffer, label: string): Promise<number> {
  const used = await safeZoneUsage(png)
  if (used > 1) {
    throw new Error(
      `${label}: artwork reaches ${(used * MASKABLE_SAFE_FRACTION * 100).toFixed(1)}% of the ` +
        `canvas diameter, outside the ${MASKABLE_SAFE_FRACTION * 100}% maskable safe zone. ` +
        `Raise MASKABLE_PAD.`,
    )
  }
  return used
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

  // ONE tile for every surface: ivory mark, indigo ground, identity clear space.
  const tileSvg = squareMarkSvg(MARK_REVERSED.body, KHAT_INDIGO, TILE_PAD)
  assertMinHeightPolicy([16, 32, 180, 192, 512])

  // Tab icons.
  writeFileSync(path.join(APP, "icon.svg"), tileSvg + "\n")
  writeFileSync(
    path.join(APP, "favicon.ico"),
    ico([
      { size: 16, data: await png(tileSvg, 16) },
      { size: 32, data: await png(tileSvg, 32) },
    ]),
  )

  // Home-screen icons.
  const tile180 = await png(tileSvg, 180)
  writeFileSync(path.join(APP, "apple-icon.png"), tile180)
  // iOS and some crawlers probe /apple-touch-icon.png directly, ignoring the
  // <link> Next emits. That path held a 1.4MB copy of the RETIRED gold logo.
  writeFileSync(path.join(ROOT, "public", "apple-touch-icon.png"), tile180)
  writeFileSync(path.join(BRAND, "icon-192.png"), await png(tileSvg, 192))
  writeFileSync(path.join(BRAND, "icon-512.png"), await png(tileSvg, 512))

  // Maskable icon — same treatment, wider canvas so Android's circular crop
  // cannot reach the artwork.
  const maskableSvg = squareMarkSvg(MARK_REVERSED.body, KHAT_INDIGO, MASKABLE_PAD)
  const maskable512 = await png(maskableSvg, 512)
  writeFileSync(path.join(BRAND, "icon-maskable-512.png"), maskable512)
  const maskableUse = await assertMaskableSafeZone(maskable512, "icon-maskable-512.png")
  // Informational: what the plain tile WOULD have cost if it were still doing
  // double duty as the maskable icon, which is how it shipped before.
  const anyUse = await safeZoneUsage(await png(tileSvg, 512))

  // Raster lockup for email. Email clients are the one surface that cannot take
  // the vector: Gmail strips inline <svg> and refuses <img src="*.svg">, and
  // Outlook's Word engine renders neither. So the logo travels as a PNG at an
  // absolute URL — which is why it is generated here, from the same artwork,
  // instead of being redrawn in table HTML (which is what used to happen).
  // 2x the 40px display height, for retina; see lib/email/templates.ts.
  const emailLockupHeight = EMAIL_LOCKUP_HEIGHT * 2
  writeFileSync(
    path.join(BRAND, "email-lockup.png"),
    await sharp(readFileSync(path.join(BRAND, "khat-lockup-horizontal.svg")))
      .resize({ height: emailLockupHeight })
      // Email bodies composite on the client's own surface; the newsletter card
      // is white, and a transparent PNG turns the indigo artwork invisible in
      // clients that force a dark background.
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )

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
    "public/brand/icon-maskable-512.png",
    "public/brand/email-lockup.png",
    "public/brand/khat-lockup-horizontal.png",
  ]) {
    console.log(`  ${f}`)
  }

  console.log(`\nmark height per canvas (MIN_HEIGHT.mark = ${MIN_HEIGHT.mark}px):`)
  for (const size of [16, 32, 180, 192, 512]) {
    const eff = size * MARK_FRACTION
    const flag = eff < MIN_HEIGHT.mark ? "  ← exempt (browser-dictated tab slot)" : ""
    console.log(`  ${String(size).padStart(3)}px canvas → ${eff.toFixed(1)}px mark${flag}`)
  }
  console.log(
    `\nmaskable safe zone used: ${(maskableUse * 100).toFixed(1)}% ` +
      `(icon-512 "any" would have used ${(anyUse * 100).toFixed(1)}%)`,
  )
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
