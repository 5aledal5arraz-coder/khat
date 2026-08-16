/**
 * Pull a HALF-BODY portrait for each guest out of their own episode.
 *
 * WHY. Our guest photos are square head-and-shoulders crops. The designer's
 * card is built on a half-body shot — head, shoulders, chest — whose clothing
 * runs off the bottom edge of the frame. No amount of CSS makes a square crop
 * fill a tall panel: there is no chest in the file to fill it with, which is
 * what seven attempts at `contain`/`cover`/trimming/box-width all failed on.
 *
 * The episodes themselves are full of the right shot. This samples frames from
 * a mid-episode window (past the intro, into the conversation), keeps the one
 * whose subject mask reaches furthest down the frame — that is the half-body
 * framing rather than a close-up — cuts the background with Vision, and trims.
 *
 *   npx tsx scripts/guest-portrait-from-video.ts            # every season-one guest
 *   npx tsx scripts/guest-portrait-from-video.ts <videoId>  # one episode
 */
import "@/lib/jobs/load-env"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtempSync, rmSync, existsSync, readdirSync, copyFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { db } from "@/lib/db"
import { episodes, guests, episodeCategories } from "@/lib/db/schema"
import { eq, like } from "drizzle-orm"

const exec = promisify(execFile)
const CUTOUT_BIN = join(process.cwd(), ".cache", "subject-cutout")
const OUT = join(process.cwd(), "public", "guests", "cutout")
const BACKUP = join(process.cwd(), "public", "guests", "cutout-square-crops")

/** Sample here: past the intro, inside the conversation. */
const WINDOW_START = 1200 // 20:00
const WINDOW_LEN = 60
const EVERY = 6 // seconds between samples → 10 candidates

async function buildCutoutBinary() {
  if (existsSync(CUTOUT_BIN)) return
  mkdirSync(join(process.cwd(), ".cache"), { recursive: true })
  await exec("swiftc", ["-O", "scripts/native/subject-cutout.swift", "-o", CUTOUT_BIN])
}

/** How far down the frame the subject reaches, 0–1. Higher = more body. */
async function bodyReach(png: string): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  let lowest = 0
  for (let y = info.height - 1; y >= 0; y--) {
    let opaque = 0
    for (let x = 0; x < info.width; x += 4) {
      if (data[(y * info.width + x) * ch + 3] > 128) opaque++
    }
    // A row counts as "body" only when the subject spans a real width of it —
    // one stray arm is not a torso.
    if (opaque > info.width / 4 / 3) {
      lowest = y
      break
    }
  }
  return lowest / info.height
}

async function portraitFor(videoId: string, hash: string) {
  const dir = mkdtempSync(join(tmpdir(), "khat-portrait-"))
  try {
    const clip = join(dir, "clip.mp4")
    await exec("yt-dlp", [
      // NO `[ext=mp4]`. That filter pins itag 398, and YouTube answered 403
      // Forbidden for it on ten of nineteen episodes while the same videos
      // downloaded fine without it. Let yt-dlp pick the best ≤720 stream.
      // `player_client=web`: the default ANDROID_VR client had its media URLs
      // refused with 403 on حسام مطر's episode while every other one worked —
      // per-video, not per-account, and no amount of pacing moved it.
      "--no-update", "--extractor-args", "youtube:player_client=web",
      "-f", "bv[height<=720]",
      "--downloader", "ffmpeg",
      "--download-sections", `*${WINDOW_START}-${WINDOW_START + WINDOW_LEN}`,
      "-o", clip, `https://www.youtube.com/watch?v=${videoId}`,
    ])
    await exec("ffmpeg", ["-loglevel", "error", "-i", clip, "-vf", `fps=1/${EVERY}`, join(dir, "f%02d.png")])

    const frames = readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort()
    if (frames.length === 0) throw new Error("no frames extracted")

    let best: { path: string; reach: number } | null = null
    for (const f of frames) {
      const src = join(dir, f)
      // The guest sits on the right of a 16:9 frame in this studio setup.
      const m = await sharp(src).metadata()
      const half = join(dir, `h-${f}`)
      await sharp(src)
        .extract({ left: Math.round(m.width! * 0.14), top: 0, width: Math.round(m.width! * 0.48), height: m.height! })
        .resize(900, 1045, { fit: "fill" })
        .png()
        .toFile(half)
      const cut = join(dir, `c-${f}`)
      try {
        await exec(CUTOUT_BIN, [half, cut])
      } catch {
        continue
      }
      const reach = await bodyReach(cut)
      if (!best || reach > best.reach) best = { path: cut, reach }
    }
    if (!best) throw new Error("Vision found no subject in any frame")

    const target = join(OUT, `${hash}.png`)
    if (existsSync(target) && !existsSync(join(BACKUP, `${hash}.png`))) {
      mkdirSync(BACKUP, { recursive: true })
      copyFileSync(target, join(BACKUP, `${hash}.png`))
    }
    await sharp(best.path).toFile(target)
    return best.reach
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  await buildCutoutBinary()
  if (!db) throw new Error("no database")

  const only = process.argv.slice(2).find((a) => !a.startsWith("--"))
  const rows = await db
    .select({ vid: episodes.id, guest: guests.name, photo: guests.photo_url })
    .from(episodes)
    .innerJoin(guests, eq(guests.id, episodes.guest_id))
    .innerJoin(episodeCategories, eq(episodeCategories.id, episodes.category_id))
    .where(like(episodeCategories.name, "%الموسم الاول%"))

  const todo = rows.filter((r) => r.photo && (!only || r.vid === only))
  console.log(`${todo.length} guests\n`)

  let ok = 0
  for (const r of todo) {
    const hash = r.photo!.split("/").pop()!.replace(/\.[^.]+$/, "")
    process.stdout.write(`${r.guest} … `)
    try {
      const reach = await portraitFor(r.vid, hash)
      console.log(`✓ body reaches ${(reach * 100).toFixed(0)}% down the frame`)
      ok++
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message.slice(0, 70) : e}`)
    }
  }
  console.log(`\n${ok}/${todo.length} portraits replaced`)
  console.log(`squares kept in public/guests/cutout-square-crops/`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
