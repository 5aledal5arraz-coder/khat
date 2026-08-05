/**
 * Three row deletions Khaled approved on 2026-08-05.
 *
 *   1. `teasers` — the `preview-demo` row. A fixture I created to look at the
 *      teaser section; it exists on LOCAL ONLY and is one of the last things
 *      keeping the two databases from matching.
 *   2. `podcast_platform_links` — the `anghami` row. Its URL was invented from
 *      the show's name and has never resolved; it has sat INACTIVE since
 *      scripts/set-official-audio-platforms.ts refused to verify it. LOCAL
 *      ONLY — production never received it. If KHAT is on Anghami, Khaled
 *      pastes the real URL and it goes back in properly.
 *   3. `podcast_platform_links` — the `snapchat` row: «شيل ايقونة سناب شات ما
 *      ابيها». This one is ACTIVE and on BOTH sides, so it runs against both.
 *
 * ── WHAT IS NOT TOUCHED, AND WHY IT LOOKS LIKE IT SHOULD BE ────────────────
 * The Snapchat ICON COMPONENT stays, and so do the icon maps in
 * `app/guests/[slug]/page.tsx` and `components/episodes/guest-intro-section.tsx`.
 * Those render a GUEST's snapchat, not KHAT's — a different person's account on
 * a page about them. Deleting the component to satisfy this request would
 * quietly remove a link from any guest who has one.
 *
 * Every row is written to JSON before it goes.
 *
 * Usage
 *   npx tsx scripts/remove-rows-2026-08-05.ts                # local, dry run
 *   npx tsx scripts/remove-rows-2026-08-05.ts --apply
 *   npx tsx scripts/remove-rows-2026-08-05.ts --live --apply # snapchat only
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

type Target = { label: string; table: string; where: string; params: unknown[]; bothSides: boolean }

const TARGETS: Target[] = [
  {
    label: "teasers · preview-demo (local-only fixture)",
    table: "teasers",
    // `teasers` has no `slug` column — id only.
    where: `id = $1`,
    params: ["preview-demo"],
    bothSides: false,
  },
  {
    label: "podcast_platform_links · anghami (invented URL, never resolved)",
    table: "podcast_platform_links",
    where: `platform_key = $1`,
    params: ["anghami"],
    bothSides: false,
  },
  {
    label: "podcast_platform_links · snapchat (Khaled: «ما ابيها»)",
    table: "podcast_platform_links",
    where: `platform_key = $1`,
    params: ["snapchat"],
    bothSides: true,
  },
]

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY" : "dry run"}\n`)

  const plan: { t: Target; rows: unknown[] }[] = []
  for (const t of TARGETS) {
    if (LIVE && !t.bothSides) {
      console.log(`  · skipped on production (local-only): ${t.label}`)
      continue
    }
    let rows: unknown[] = []
    try {
      rows = (await pool.query(`select * from "${t.table}" where ${t.where}`, t.params)).rows
    } catch (err) {
      console.log(`  ✗ ${t.label} — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`)
      continue
    }
    if (!rows.length) {
      console.log(`  · ${t.label} — not present, nothing to do`)
      continue
    }
    plan.push({ t, rows })
    console.log(`  ${t.label} — ${rows.length} row(s)`)
    for (const r of rows) console.log(`      ${JSON.stringify(r).slice(0, 150)}`)
  }

  const total = plan.reduce((a, p) => a + p.rows.length, 0)
  console.log(`\n▸ ${total} row(s) to delete.`)
  if (!total) {
    await pool.end()
    return
  }
  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `removed-rows-${LIVE ? "prod" : "local"}-${stamp}.json`)
  writeFileSync(
    backupPath,
    JSON.stringify(Object.fromEntries(plan.map((p) => [p.t.label, p.rows])), null, 1),
    "utf8",
  )
  console.log(`\n▸ every row written to:\n  ${backupPath}\n`)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const { t } of plan) {
      await client.query(`delete from "${t.table}" where ${t.where}`, t.params)
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    console.log(`✗ rolled back: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  } finally {
    client.release()
  }

  console.log(`▸ ${total} row(s) deleted.\n`)
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
