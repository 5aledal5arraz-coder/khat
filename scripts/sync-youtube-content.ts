/**
 * Copy an already-published episode's YouTube content onto its site page.
 *
 * Khaled's rule (2026-08-04): an episode that is already on YouTube gets NO
 * generated content. YouTube's own description and YouTube's own hand-written
 * index are the truth, and they are copied across verbatim. Generation is for
 * NEW episodes only — the ones whose audio he uploads before publishing.
 *
 * This replaces content that was demonstrably wrong. On episode 018 the live
 * page carried a generated index reading «2:00:00 الختام» on an 86-minute
 * episode, while the YouTube description carried Khaled's own 16-chapter index
 * ending at 1:23:30.
 *
 * Reads through the official YouTube Data API (`videos.list`), NOT yt-dlp:
 * the droplet's IP is bot-blocked by YouTube, and the API is unaffected.
 *
 * SAFETY
 *   - Dry run unless `--apply` is passed.
 *   - `--apply` first writes every affected row, as it is now, to a JSON
 *     backup file and prints the path. Nothing is overwritten before that
 *     file exists on disk.
 *   - A parsed chapter at or past the video's own duration is DROPPED, not
 *     shifted — that is the exact defect being fixed here, and re-introducing
 *     a plausible-looking wrong number would be worse than dropping it.
 *   - An episode whose description has no chapters gets NO index. Empty beats
 *     invented.
 *
 * Usage
 *   npx tsx scripts/sync-youtube-content.ts                  # dry run, local DB
 *   npx tsx scripts/sync-youtube-content.ts --apply          # write, local DB
 *   npx tsx scripts/sync-youtube-content.ts --live           # dry run, prod DB
 *   npx tsx scripts/sync-youtube-content.ts --live --apply   # write, prod DB
 *   ... --only=knyKlUZIwYQ,oNyFz82BVzY                       # limit to some ids
 *   ... --clear-generated                                    # also blank the
 *                                                              generated summary
 *                                                              and takeaways
 */

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { Pool } from "pg"

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const APPLY = argv.includes("--apply")
const LIVE = argv.includes("--live")
const CLEAR_GENERATED = argv.includes("--clear-generated")
const ONLY = (argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// ─── env ─────────────────────────────────────────────────────────────────────

function readEnv(name: string): string {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  const m = file.match(new RegExp(`^${name}=(.*)$`, "m"))
  return (m?.[1] ?? "").trim().replace(/^["']|["']$/g, "")
}

const DB_URL = readEnv(LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL")
const YT_KEY = readEnv("YOUTUBE_API_KEY")

if (!DB_URL) throw new Error(`${LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"} is not set`)
if (!YT_KEY) throw new Error("YOUTUBE_API_KEY is not set")

// ─── chapter parsing ─────────────────────────────────────────────────────────

/** An 11-char YouTube id is what `episodes.id` holds for a synced episode. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * `HH:MM:SS` / `MM:SS` at the start of a line, then the chapter title.
 * The separator between the two is optional and may be a dash, so all of
 * these (real, from KHAT descriptions) parse the same way:
 *   `00:00 المقدمه`
 *   `03:33 - البدايات: تجربة جاسم الدراسية…`
 *   `1:09:00 فاصل مع فلاش`
 */
const CHAPTER_RE = /^[ \t]*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[ \t]*[-–—:]?[ \t]*(\S.*?)[ \t]*$/

export interface ParsedChapter {
  time_seconds: number
  title: string
}

/** ISO-8601 (`PT1H26M18S`) → seconds. */
export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/**
 * Chapters from a YouTube description.
 *
 * @param description the raw description text
 * @param durationSeconds the video's true length; a chapter at or past it is
 *   dropped as unusable. Pass 0 to skip that check.
 * @returns chapters in ascending time order, de-duplicated by timestamp, plus
 *   whatever was dropped and why — the caller reports it rather than swallowing it.
 */
export function parseChapters(
  description: string,
  durationSeconds: number,
): { chapters: ParsedChapter[]; dropped: { time_seconds: number; title: string; reason: string }[] } {
  const chapters: ParsedChapter[] = []
  const dropped: { time_seconds: number; title: string; reason: string }[] = []
  const seen = new Set<number>()

  for (const line of description.split("\n")) {
    const m = CHAPTER_RE.exec(line)
    if (!m) continue
    const [, hh, mm, ss, rawTitle] = m
    const time_seconds = Number(hh ?? 0) * 3600 + Number(mm) * 60 + Number(ss)
    // Strip a leading dash the separator class already allowed for, plus any
    // stray bullet, so titles read the same whichever style the line used.
    const title = rawTitle.replace(/^[-–—•*]\s*/, "").trim()
    if (!title) continue

    if (durationSeconds > 0 && time_seconds >= durationSeconds) {
      dropped.push({ time_seconds, title, reason: "past the end of the video" })
      continue
    }
    if (seen.has(time_seconds)) {
      dropped.push({ time_seconds, title, reason: "duplicate timestamp" })
      continue
    }
    seen.add(time_seconds)
    chapters.push({ time_seconds, title })
  }

  chapters.sort((a, b) => a.time_seconds - b.time_seconds)
  return { chapters, dropped }
}

// ─── youtube ─────────────────────────────────────────────────────────────────

interface YtVideo {
  id: string
  title: string
  description: string
  durationSeconds: number
}

async function fetchVideos(ids: string[]): Promise<Map<string, YtVideo>> {
  const out = new Map<string, YtVideo>()
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const url = new URL("https://www.googleapis.com/youtube/v3/videos")
    url.searchParams.set("part", "snippet,contentDetails")
    url.searchParams.set("id", batch.join(","))
    const res = await fetch(url, { headers: { "X-goog-api-key": YT_KEY } })
    const body = (await res.json()) as {
      items?: { id: string; snippet: { title: string; description: string }; contentDetails: { duration: string } }[]
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(`YouTube API ${res.status}: ${body.error?.message ?? "unknown error"}`)
    }
    for (const v of body.items ?? []) {
      out.set(v.id, {
        id: v.id,
        title: v.snippet.title,
        description: v.snippet.description,
        durationSeconds: parseIsoDuration(v.contentDetails.duration),
      })
    }
  }
  return out
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })

  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY (writes)" : "dry run"}`)
  if (CLEAR_GENERATED) console.log("▸ generated summary + takeaways will be cleared")

  const epRows = await pool.query<{ id: string; episode_number: number | null; description: string | null }>(
    `select id, episode_number, description from episodes order by release_date nulls last`,
  )
  const episodes = epRows.rows.filter(
    (e) => VIDEO_ID_RE.test(e.id) && (ONLY.length === 0 || ONLY.includes(e.id)),
  )
  console.log(`▸ ${episodes.length} synced episodes to process\n`)

  const videos = await fetchVideos(episodes.map((e) => e.id))

  const plan: {
    id: string
    num: number | null
    descChanged: boolean
    chapters: ParsedChapter[]
    dropped: { time_seconds: number; title: string; reason: string }[]
    beforeCount: number
  }[] = []

  for (const ep of episodes) {
    const v = videos.get(ep.id)
    if (!v) {
      console.log(`  ${String(ep.episode_number ?? "--").padStart(3)}  ${ep.id}  ⚠️  not returned by the API (private or removed?)`)
      continue
    }
    const { chapters, dropped } = parseChapters(v.description, v.durationSeconds)
    const before = await pool.query<{ n: number }>(
      `select coalesce(jsonb_array_length(timestamps), 0)::int n
         from episode_enrichments where episode_id = $1`,
      [ep.id],
    )
    const beforeCount = before.rows[0]?.n ?? 0
    plan.push({
      id: ep.id,
      num: ep.episode_number,
      descChanged: (ep.description ?? "") !== v.description,
      chapters,
      dropped,
      beforeCount,
    })

    const flag = dropped.length > 0 ? ` ⚠️ dropped ${dropped.length}` : ""
    console.log(
      `  ${String(ep.episode_number ?? "--").padStart(3)}  ${ep.id}` +
        `  index ${String(beforeCount).padStart(2)} → ${String(chapters.length).padStart(2)}` +
        `  desc ${(ep.description ?? "") !== v.description ? "UPDATE" : "same  "}${flag}`,
    )
    for (const d of dropped) {
      const mm = Math.floor(d.time_seconds / 60)
      console.log(`         ↳ dropped ${mm}:${String(d.time_seconds % 60).padStart(2, "0")} «${d.title}» — ${d.reason}`)
    }
  }

  const withIndex = plan.filter((p) => p.chapters.length > 0).length
  const losingIndex = plan.filter((p) => p.beforeCount > 0 && p.chapters.length === 0)
  console.log(
    `\n▸ ${withIndex}/${plan.length} episodes get a real index from YouTube.` +
      `\n▸ ${plan.filter((p) => p.descChanged).length} descriptions differ from YouTube and would be updated.`,
  )
  if (losingIndex.length > 0) {
    console.log(
      `▸ ⚠️  ${losingIndex.length} episode(s) currently show an index but YouTube has none — ` +
        `their index would be REMOVED (episodes ${losingIndex.map((p) => p.num).join(", ")}).`,
    )
  }

  if (!APPLY) {
    console.log("\nDry run — nothing was written. Re-run with --apply to write.\n")
    await pool.end()
    return
  }

  // ── backup before the first write ──────────────────────────────────────────
  const backupRows = await pool.query(
    `select e.id, e.description, en.*
       from episodes e
       left join episode_enrichments en on en.episode_id = e.id
      where e.id = any($1::text[])`,
    [plan.map((p) => p.id)],
  )
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `youtube-sync-backup-${target}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(backupRows.rows, null, 1), "utf8")
  console.log(`\n▸ backup of ${backupRows.rowCount} rows written to:\n  ${backupPath}\n`)

  let updated = 0
  for (const p of plan) {
    const v = videos.get(p.id)!
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`update episodes set description = $2, updated_at = now() where id = $1`, [
        p.id,
        v.description,
      ])
      const cleared = CLEAR_GENERATED
        ? `, full_summary = null, hero_summary = null, takeaways = null`
        : ``
      await client.query(
        `insert into episode_enrichments (episode_id, timestamps, updated_at)
              values ($1, $2::jsonb, now())
         on conflict (episode_id) do update
                set timestamps = excluded.timestamps, updated_at = now()${cleared}`,
        [p.id, JSON.stringify(p.chapters.length > 0 ? p.chapters : null)],
      )
      await client.query("COMMIT")
      updated++
    } catch (err) {
      await client.query("ROLLBACK")
      console.log(`  ✗ ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      client.release()
    }
  }

  console.log(`\n▸ ${updated}/${plan.length} episodes updated.`)
  console.log(`▸ restore with the backup file above if anything looks wrong.\n`)
  await pool.end()
}

/**
 * Run only when this file IS the entry point. Without this guard, importing
 * `parseChapters` from a test executed the whole sync — the test run opened a
 * database connection and called the YouTube API as a side effect of an
 * `import`. Caught by the parser tests printing the script's own banner.
 */
const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
