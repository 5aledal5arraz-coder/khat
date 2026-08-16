/**
 * Trim the transparent margin off every guest cut-out.
 *
 * WHY, in Khaled's words: «ابي الراس كامل … ملابس الضيف هي حدود الاطار وليس
 * اللون البنفسجي وكذلك الزاوية اليسار السفليه».
 *
 * Vision returns the subject centred on the original photo's canvas, so each
 * PNG carries dead transparent space on all four sides — 32px on every file
 * measured. On the guest card that space is what the indigo shows through, and
 * `object-cover` then has to scale the whole padded square up to hide it, which
 * eats the top of the head before it ever fills the bottom corners.
 *
 * Trimming left/right/bottom tight makes the CLOTHING the edge of the image, so
 * `cover` fills the panel by widening the shoulders rather than by cropping the
 * head. The TOP margin is kept: headroom above a head is composition, a head
 * flush to the top edge is a mistake.
 *
 *   npx tsx scripts/trim-guest-cutouts.ts          # all
 *   npx tsx scripts/trim-guest-cutouts.ts --dry    # report only
 */
import { readdirSync, renameSync, existsSync, mkdirSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

const DIR = join(process.cwd(), "public", "guests", "cutout")
const BACKUP = join(process.cwd(), "public", "guests", "cutout-untrimmed")
/** Alpha above this is the subject; below it is anti-alias haze. */
/*
 * 128, NOT 12. At 12 the trim stopped at the first barely-there pixel, so the
 * cut-out kept its FEATHERED edge — a band of 20–40% alpha that the indigo
 * shows straight through. On the card that reads as «شريط بنفسجي بسيط» under
 * the guest even though the layout measures a zero gap, because the gap is
 * inside the picture, not around it. Half-opacity is the honest boundary of
 * the subject.
 */
const ALPHA = 128

async function main() {
  const dry = process.argv.includes("--dry")
  if (!dry && !existsSync(BACKUP)) mkdirSync(BACKUP, { recursive: true })

  const files = readdirSync(DIR).filter((f) => f.endsWith(".png") && !f.startsWith("."))
  let trimmed = 0
  let already = 0

  for (const f of files) {
    const path = join(DIR, f)
    const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true })
    const ch = info.channels
    let minX = info.width
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * ch + 3] > ALPHA) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) {
      console.log(`  ⚠ ${f}: fully transparent — skipped`)
      continue
    }
    const cutL = minX
    const cutR = info.width - 1 - maxX
    const cutB = info.height - 1 - maxY
    if (cutL + cutR + cutB === 0) {
      already++
      continue
    }
    console.log(`  ${f}  L${cutL} R${cutR} B${cutB}  →  ${maxX - minX + 1}×${maxY + 1}`)
    if (dry) continue

    // Keep the original once, so this is reversible without re-running Vision.
    const keep = join(BACKUP, f)
    if (!existsSync(keep)) copyFileSync(path, keep)

    const tmp = path.replace(/\.png$/, ".tmp.png")
    await sharp(path)
      .extract({ left: minX, top: 0, width: maxX - minX + 1, height: maxY + 1 })
      .toFile(tmp)
    renameSync(tmp, path)
    trimmed++
  }

  console.log(`\n${files.length} cut-outs · ${trimmed} trimmed · ${already} already tight`)
  if (!dry) console.log(`originals kept in public/guests/cutout-untrimmed/`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
