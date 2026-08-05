/**
 * The podcast's own accounts — the ones Khaled links from every YouTube
 * description — into `podcast_platform_links`.
 *
 * WHY THE FOOTER WAS EMPTY. The table has 0 rows on production. Every public
 * surface reads it through `listPlatformsForSurface`, and the footer wraps
 * that in `.catch(() => [])`, so an empty table renders as no social row at
 * all and says nothing. Khaled noticed the accounts were missing from the
 * site; nothing in the app had.
 *
 * WHY NOT `scripts/seed-official-platforms.ts`. That script's URLs are
 * guesses, and two of them point at accounts that are not his:
 *
 *     it seeds   x.com/khatpodcast        real is  x.com/Khat_Podcast
 *     it seeds   instagram.com/KhatPodcast  real is  instagram.com/Khat.Podcast
 *
 * An underscore and a dot — the kind of wrong that looks right in a review and
 * sends a listener to a stranger's profile. So these URLs are not typed from
 * memory either: each was resolved by following the shortened link in the
 * episode descriptions (2u.pw / cutt.us) to its destination, and every one was
 * then fetched and returned 200. TikTok is the exception — it appears in no
 * description; Khaled supplied the handle directly.
 *
 * The audio platforms (Apple, Spotify, Anghami, RSS) are deliberately NOT
 * here. Their seeded URLs are guesses too, four of them 404, and Khaled has
 * said he will send the real ones. An empty «استمع» is better than four links
 * that go nowhere.
 *
 * Usage
 *   npx tsx scripts/seed-khat-social-links.ts --live          # dry run
 *   npx tsx scripts/seed-khat-social-links.ts --live --apply
 */

import { readFileSync } from "fs"
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

const DB_URL = readEnv(LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL")
if (!DB_URL) throw new Error(`${LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"} is not set`)

interface Platform {
  key: string
  name: string
  url: string
  handle: string
  icon: string
  category: "social" | "community" | "video"
  order: number
  /** Where this one appears. Community/video also ride the episode page. */
  episodePage?: boolean
  source: string
}

/** `icon_name` values must exist in components/platforms/platform-icon.tsx. */
export const SOCIAL_PLATFORMS: Platform[] = [
  { key: "youtube", name: "YouTube", url: "https://www.youtube.com/@KhatPodcast",
    handle: "@KhatPodcast", icon: "youtube", category: "video", order: 1, episodePage: true,
    source: "YOUTUBE_CHANNEL_HANDLE — the handle the episode sync itself reads" },
  { key: "instagram", name: "إنستغرام", url: "https://www.instagram.com/Khat.Podcast",
    handle: "@Khat.Podcast", icon: "instagram", category: "social", order: 2,
    source: "resolved from «بودكاست خط على إنستقرام» in the descriptions" },
  { key: "x", name: "إكس", url: "https://x.com/Khat_Podcast",
    handle: "@Khat_Podcast", icon: "x", category: "social", order: 3,
    source: "resolved from «بودكاست خط على تويتر»" },
  { key: "tiktok", name: "تيك توك", url: "https://www.tiktok.com/@khatpodcast",
    handle: "@khatpodcast", icon: "tiktok", category: "social", order: 4,
    source: "given by Khaled — appears in no description" },
  /* NO SNAPCHAT. Khaled, 2026-08-05: «شيل ايقونة سناب شات ما ابيها». The row
     was deleted from both databases; leaving the entry here would have put it
     straight back the next time anyone re-seeded, which is the whole reason a
     seed file has to be kept honest. The guest-side snapchat icon is a
     different thing and stays — see scripts/remove-rows-2026-08-05.ts. */
  { key: "threads", name: "ثريدز", url: "https://www.threads.com/@khat.podcast",
    handle: "@khat.podcast", icon: "threads", category: "social", order: 6,
    source: "resolved from «بودكاست خط على ثريدز»" },
  { key: "whatsapp", name: "قناة واتساب", url: "https://www.whatsapp.com/channel/0029VaE4SfPIN9ip2O3BBL3G",
    handle: "قناة خط", icon: "whatsapp", category: "community", order: 7, episodePage: true,
    source: "resolved from «بودكاست خط على الواتساب»" },
]

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY" : "dry run"}\n`)

  const before = await pool.query<{ platform_key: string }>(
    `select platform_key from podcast_platform_links`,
  )
  const existing = new Set(before.rows.map((r) => r.platform_key))
  console.log(`▸ ${before.rowCount} rows already present${before.rowCount ? `: ${[...existing].join(", ")}` : ""}\n`)

  for (const p of SOCIAL_PLATFORMS) {
    console.log(`  ${existing.has(p.key) ? "↻ update" : "+ insert"}  ${p.key.padEnd(10)} ${p.url}`)
    console.log(`             ↳ ${p.source}`)
  }

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const p of SOCIAL_PLATFORMS) {
      await client.query(
        `insert into podcast_platform_links
           (id, platform_key, platform_name, url, handle, icon_name, category,
            is_primary, is_active, sort_order,
            show_in_header, show_in_footer, show_on_homepage, show_on_episode_page,
            show_on_about_page, show_on_contact_page, show_on_guest_page, notes_internal)
         values ($1,$2,$3,$4,$5,$6,$7, false, true, $8,
                 false, true, true, $9, true, true, false, $10)
         on conflict (platform_key) do update set
            platform_name = excluded.platform_name,
            url           = excluded.url,
            handle        = excluded.handle,
            icon_name     = excluded.icon_name,
            category      = excluded.category,
            is_active     = true,
            sort_order    = excluded.sort_order,
            show_in_footer      = true,
            show_on_homepage    = true,
            show_on_episode_page = excluded.show_on_episode_page,
            show_on_about_page   = true,
            show_on_contact_page = true,
            notes_internal = excluded.notes_internal,
            updated_at    = now()`,
        [
          `plat-${p.key}`, p.key, p.name, p.url, p.handle, p.icon, p.category,
          p.order, p.episodePage ?? false, p.source,
        ],
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

  const after = await pool.query<{ n: string }>(
    `select count(*)::text n from podcast_platform_links where is_active`,
  )
  console.log(`\n▸ done — ${after.rows[0].n} active platforms.\n`)
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
