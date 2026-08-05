/**
 * The audio platforms KHAT is actually on — resolved, not guessed.
 *
 * ── WHY THIS REPLACES scripts/seed-official-platforms.ts FOR THE AUDIO ROWS ──
 * That script wrote four `audio` rows whose URLs were INVENTED from the show's
 * name — `podcasts.apple.com/podcast/khatpodcast`,
 * `open.spotify.com/show/khatpodcast`, `play.anghami.com/podcast/khatpodcast`.
 * None of them resolve. They were left `is_active = false` so nothing broken
 * shipped, and production never received them at all, which is why `/listen`
 * has been empty since it was built.
 *
 * Khaled gave the real source on 2026-08-05: the RSS.com feed
 * (media.rss.com/khatpodcast/feed.xml) and, behind it, the RSS.com show page
 * — which is where a podcast host publishes the distribution links it actually
 * created. The three below came off that page and each one was opened and
 * checked: Apple and Spotify return 200 AND their `<title>` says «بودكاست خط»,
 * so they are the right show and not a search page that happens to answer 200.
 *
 * ── THE GUARD, WHICH IS THE POINT OF THE FILE ──────────────────────────────
 * `--apply` REFUSES to write a URL that does not resolve. A URL nobody checked
 * is how the last set got here, and the cost was invisible: an inactive row
 * says nothing, an active row with a dead URL sends a listener to a 404, and
 * neither reports anything. The check runs at write time, against the live
 * web, every time.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 * ANGHAMI. Anghami answers 406 to every automated request — including a URL
 * with a nonsense id — so nothing about it can be verified from here, and an
 * unverifiable URL is precisely the thing this script exists to refuse. If
 * KHAT is on Anghami, Khaled pastes the URL from his own browser and it goes
 * in the same way. It is better for `/listen` to show three platforms that
 * work than four with one that lies.
 *
 * Usage
 *   npx tsx scripts/set-official-audio-platforms.ts            # local, dry run
 *   npx tsx scripts/set-official-audio-platforms.ts --apply
 *   npx tsx scripts/set-official-audio-platforms.ts --live --apply
 */

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { Pool } from "pg"

const argv = process.argv.slice(2)
const APPLY = argv.includes("--apply")
const LIVE = argv.includes("--live")

function readEnv(name: string): string {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  return (file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "")
}

const KEY = LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"
const DB_URL = readEnv(KEY)
if (!DB_URL) throw new Error(`${KEY} is not set`)

type Row = {
  platform_key: string
  platform_name: string
  url: string
  icon_name: string
  sort_order: number
  /** `rss` is the raw feed — /listen renders it separately, below the tiles. */
  is_primary: boolean
}

/**
 * Order is the order of the tiles on /listen. Apple and Spotify lead because
 * they are where Arabic podcast listening actually happens; the feed is last
 * because it is for podcast apps, not for people.
 */
export const AUDIO_PLATFORMS: Row[] = [
  {
    platform_key: "apple_podcasts",
    platform_name: "Apple Podcasts",
    url: "https://podcasts.apple.com/us/podcast/khatpodcast/id1701324741",
    icon_name: "apple_podcasts",
    sort_order: 1,
    is_primary: true,
  },
  {
    platform_key: "spotify",
    platform_name: "Spotify",
    url: "https://open.spotify.com/show/6DVDvDO6oCdNTG0snPlpGn",
    icon_name: "spotify",
    sort_order: 2,
    is_primary: true,
  },
  {
    platform_key: "amazon_music",
    platform_name: "Amazon Music",
    // KHALED'S OWN URL, from his browser — the canonical form, with the show's
    // name in the path. The bare-UUID form I scraped off the RSS.com page also
    // answers 200 and Amazon redirects it here, so both work; this one is
    // preferred because it is the one Amazon itself settles on, and because it
    // is the only one a human can read.
    //
    // IT ALSO SUPPLIED THE VERIFICATION THE OTHER THREE HAD AND THIS ONE DID
    // NOT. Apple and Spotify were confirmed by «بودكاست خط» in their <title>;
    // Amazon's page renders its title client-side, so it came back empty and
    // all I had was a 200 — which a search page returns too. The slug here
    // decodes to «بودكاست-خط», so the show is now named in the URL itself.
    url: "https://music.amazon.com/podcasts/6030a0a2-9f89-4d3e-be75-510af25c2ba2/%D8%A8%D9%88%D8%AF%D9%83%D8%A7%D8%B3%D8%AA-%D8%AE%D8%B7",
    // No amazon entry in ICON_MAP (components/platforms/platform-icon.tsx);
    // `getPlatformIcon` falls back to Headphones, which is correct for an audio
    // platform and not a broken glyph. Add a real mark there when one exists.
    icon_name: "amazon_music",
    sort_order: 3,
    is_primary: false,
  },
  {
    platform_key: "rss",
    platform_name: "RSS",
    // THE ONE URL THE OLD SEED GOT RIGHT — it is the host's own feed, so it
    // could not be invented. Kept, and now switched on.
    url: "https://media.rss.com/khatpodcast/feed.xml",
    icon_name: "rss",
    sort_order: 9,
    is_primary: false,
  },
]

/** A URL is usable if it answers, follows redirects, and is not a 4xx/5xx. */
async function resolves(url: string): Promise<{ ok: boolean; status: number | string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      signal: AbortSignal.timeout(25_000),
    })
    return { ok: res.status < 400, status: res.status }
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.name : "failed" }
  }
}

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY" : "dry run"}\n`)

  const existing = (
    await pool.query<{ platform_key: string; url: string; is_active: boolean }>(
      `select platform_key, url, is_active from podcast_platform_links where category = 'audio'`,
    )
  ).rows
  const byKey = new Map(existing.map((r) => [r.platform_key, r]))

  console.log("▸ checking every URL against the live web before writing anything\n")
  const checked: (Row & { status: number | string; ok: boolean })[] = []
  for (const row of AUDIO_PLATFORMS) {
    const { ok, status } = await resolves(row.url)
    checked.push({ ...row, ok, status })
    const was = byKey.get(row.platform_key)
    console.log(`  ${ok ? "✅" : "❌"} ${String(status).padEnd(6)} ${row.platform_name}`)
    console.log(`       ${row.url}`)
    if (was && was.url !== row.url) console.log(`       was: ${was.url}  (${was.is_active ? "active" : "inactive"})`)
    if (!was) console.log(`       new row`)
  }

  const bad = checked.filter((r) => !r.ok)
  if (bad.length) {
    console.log(`\n✗ ${bad.length} URL(s) did not resolve. Nothing written.`)
    console.log("  A URL nobody checked is how the previous set of dead links got here.")
    await pool.end()
    process.exitCode = 1
    return
  }

  // Any audio row we are NOT writing is stale — an invented URL from the old
  // seed. Report it rather than deleting: removing a row is Khaled's call.
  const keys = new Set(AUDIO_PLATFORMS.map((r) => r.platform_key))
  const orphans = existing.filter((r) => !keys.has(r.platform_key))
  if (orphans.length) {
    console.log(`\n▸ ${orphans.length} audio row(s) left untouched — not in this list:`)
    for (const o of orphans) console.log(`    ${o.platform_key}  ${o.is_active ? "ACTIVE" : "inactive"}  ${o.url}`)
    console.log("  Deleting a row is Khaled's decision, not this script's.")
  }

  console.log(`\n▸ ${AUDIO_PLATFORMS.length} row(s) to write, all verified.`)
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `audio-platforms-backup-${LIVE ? "prod" : "local"}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(existing, null, 1), "utf8")
  console.log(`\n▸ backup of the ${existing.length} existing audio row(s):\n  ${backupPath}\n`)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const r of AUDIO_PLATFORMS) {
      await client.query(
        // `id` IS SUPPLIED HERE ON PURPOSE. The column's default lives in
        // Drizzle (`$defaultFn(() => crypto.randomUUID())`), not in Postgres,
        // so a raw INSERT that omits it fails the not-null constraint — the
        // same trap `guests.id` sprang on the guest backfill. Anything writing
        // this table with SQL rather than the ORM has to generate its own.
        `insert into podcast_platform_links
           (id, platform_key, platform_name, url, icon_name, category, is_primary,
            is_active, sort_order, show_in_footer, show_on_homepage, show_on_episode_page, updated_at)
         values ($7,$1,$2,$3,$4,'audio',$5,true,$6,true,true,true, now())
         on conflict (platform_key) do update set
           platform_name = excluded.platform_name,
           url           = excluded.url,
           icon_name     = excluded.icon_name,
           category      = 'audio',
           is_primary    = excluded.is_primary,
           is_active     = true,
           sort_order    = excluded.sort_order,
           show_in_footer       = true,
           show_on_homepage     = true,
           show_on_episode_page = true,
           updated_at    = now()`,
        [r.platform_key, r.platform_name, r.url, r.icon_name, r.is_primary, r.sort_order, crypto.randomUUID()],
      )
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    console.log(`✗ rolled back: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  } finally {
    client.release()
  }

  console.log(`▸ ${AUDIO_PLATFORMS.length} audio platform(s) written and switched on.\n`)
  await pool.end()
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
