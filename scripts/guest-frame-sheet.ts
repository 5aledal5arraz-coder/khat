/**
 * Build a CONTACT SHEET of candidate portraits per guest, for a human to pick.
 *
 * WHY THIS REPLACES THE AUTOMATIC PICK. `guest-portrait-from-video.ts` chose
 * the frame whose subject mask reached furthest down — a purely geometric test.
 * It produced eighteen technically-correct, visually-poor portraits: جاسم
 * الزراعي with his hands knotted on his chest, باسم اللوغاني with the crop
 * through his head, جاسم عباس with half a face. «Body reaches 100% down the
 * frame» is not a definition of a good photograph, and no measurement I can
 * write is. A person has to look.
 *
 * So this only PREPARES the choice: it samples widely across the episode,
 * cuts each candidate, numbers them, and writes one sheet per guest under
 * `public/frames/`. Khaled opens the sheet, says the number, and
 * `--pick <n>` installs it.
 *
 *   npx tsx scripts/guest-frame-sheet.ts <videoId>            # build the sheet
 *   npx tsx scripts/guest-frame-sheet.ts <videoId> --pick 7   # install frame 7
 */
import "@/lib/jobs/load-env"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { db } from "@/lib/db"
import { episodes, guests } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const exec = promisify(execFile)
const CUTOUT_BIN = join(process.cwd(), ".cache", "subject-cutout")
const WORK = join(process.cwd(), ".cache", "frames")
const SHEETS = join(process.cwd(), "public", "frames")
const OUT = join(process.cwd(), "public", "guests", "cutout")
const BACKUP = join(process.cwd(), "public", "guests", "cutout-square-crops")

/** Sample the whole conversation, not one window — posture varies over hours. */
const WINDOWS = [900, 1800, 2700, 3600]
const PER_WINDOW = 3
const SPACING = 8

async function main() {
  const args = process.argv.slice(2)
  const videoId = args.find((a) => !a.startsWith("--"))
  if (!videoId) throw new Error("usage: guest-frame-sheet.ts <videoId> [--pick N]")
  const pickIdx = args.indexOf("--pick")
  const pick = pickIdx >= 0 ? Number(args[pickIdx + 1]) : null

  if (!db) throw new Error("no database")
  const [row] = await db
    .select({ guest: guests.name, photo: guests.photo_url })
    .from(episodes)
    .innerJoin(guests, eq(guests.id, episodes.guest_id))
    .where(eq(episodes.id, videoId))
    .limit(1)
  if (!row?.photo) throw new Error(`no guest with a photo for ${videoId}`)
  const hash = row.photo.split("/").pop()!.replace(/\.[^.]+$/, "")
  const dir = join(WORK, videoId)

  // ── install a chosen frame ────────────────────────────────────────────────
  if (pick !== null) {
    const src = join(dir, `cut-${String(pick).padStart(2, "0")}.png`)
    if (!existsSync(src)) throw new Error(`frame ${pick} not found — build the sheet first`)
    const target = join(OUT, `${hash}.png`)
    if (existsSync(target) && !existsSync(join(BACKUP, `${hash}.png`))) {
      mkdirSync(BACKUP, { recursive: true })
      copyFileSync(target, join(BACKUP, `${hash}.png`))
    }
    await sharp(src).toFile(target)
    console.log(`✓ ${row.guest} ← frame ${pick}`)
    process.exit(0)
  }

  // ── build the sheet ───────────────────────────────────────────────────────
  if (!existsSync(CUTOUT_BIN)) {
    mkdirSync(join(process.cwd(), ".cache"), { recursive: true })
    await exec("swiftc", ["-O", "scripts/native/subject-cutout.swift", "-o", CUTOUT_BIN])
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  mkdirSync(SHEETS, { recursive: true })

  let n = 0
  const tiles: { input: Buffer; left: number; top: number }[] = []
  const TW = 300
  const TH = 348
  const COLS = 4

  for (const start of WINDOWS) {
    const clip = join(dir, `w${start}.mp4`)
    try {
      await exec("yt-dlp", [
        "--no-update", "-f", "bv[height<=720]", "--downloader", "ffmpeg",
        "--download-sections", `*${start}-${start + PER_WINDOW * SPACING}`,
        "-o", clip, `https://www.youtube.com/watch?v=${videoId}`,
      ])
    } catch {
      console.log(`  (window ${start}s unavailable — skipped)`)
      continue
    }
    await exec("ffmpeg", ["-loglevel", "error", "-i", clip, "-vf", `fps=1/${SPACING}`, join(dir, `w${start}-%02d.png`)])

    for (const f of readdirSync(dir).filter((x) => x.startsWith(`w${start}-`)).sort()) {
      const src = join(dir, f)
      const m = await sharp(src).metadata()
      const half = join(dir, `h-${f}`)
      await sharp(src)
        .extract({ left: Math.round(m.width! * 0.14), top: 0, width: Math.round(m.width! * 0.48), height: m.height! })
        .resize(900, 1045, { fit: "fill" })
        .png()
        .toFile(half)
      const cut = join(dir, `cut-${String(n + 1).padStart(2, "0")}.png`)
      try {
        await exec(CUTOUT_BIN, [half, cut])
      } catch {
        continue
      }
      // Number every tile, on the indigo, so the sheet reads like the card.
      const tile = await sharp({
        create: { width: TW, height: TH, channels: 3, background: { r: 54, g: 46, b: 109 } },
      })
        .composite([
          { input: await sharp(cut).resize(TW, TH, { fit: "cover", position: "bottom" }).toBuffer(), top: 0, left: 0 },
          {
            input: Buffer.from(
              `<svg width="${TW}" height="${TH}"><rect x="8" y="8" width="46" height="34" rx="8" fill="#F4551E"/><text x="31" y="33" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">${n + 1}</text></svg>`,
            ),
            top: 0, left: 0,
          },
        ])
        .png()
        .toBuffer()
      tiles.push({ input: tile, left: (n % COLS) * TW, top: Math.floor(n / COLS) * TH })
      n++
    }
  }

  if (n === 0) throw new Error("no frames could be prepared for this episode")
  const rows = Math.ceil(n / COLS)
  const sheet = join(SHEETS, `${videoId}.jpg`)
  await sharp({ create: { width: COLS * TW, height: rows * TH, channels: 3, background: { r: 246, g: 241, b: 237 } } })
    .composite(tiles)
    .jpeg({ quality: 88 })
    .toFile(sheet)

  console.log(`${row.guest}: ${n} candidates → /frames/${videoId}.jpg`)
  console.log(`pick with:  npx tsx scripts/guest-frame-sheet.ts ${videoId} --pick <n>`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
