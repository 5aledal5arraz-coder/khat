/**
 * A guest's `name` is their name. The title belongs to the page, not the name.
 *
 * Khaled's rule (2026-08-05): «دايماً أسماء الضيوف بدون ألقاب، وفي صفحة الضيف
 * نكتب الألقاب». Three rows predate it — they were created before the backfill
 * and carry the honorific inside `name`:
 *
 *     الملازم عبدالله البطي     الأستاذ علي دريساوي     الدكتور الحارث المزيدي
 *
 * All three also have an EMPTY bio, so the title was not merely in the wrong
 * field — it was the only rank the site recorded, and dropping it would have
 * lost information. Each one moves into `bio`, which is what `/guests/[slug]`
 * renders under the name (`displayBio`, app/guests/[slug]/page.tsx).
 *
 * NOT A REGEX. Three rows, reviewed by hand and written out below. A pattern
 * that strips a leading «ال…» word would also strip real names — «الحارث» is
 * the name here, «الدكتور» is not, and no rule short of knowing the person
 * tells them apart.
 *
 * THE SLUG MOVES WITH THE NAME, so `/guests/الملازم-عبدالله-البطي` stops
 * resolving. That is accepted: these pages went public today, the sitemap is
 * generated from the table rather than hardcoded, and a guest page whose URL
 * spells a rank it no longer shows is worse than a fresh link.
 *
 * Usage
 *   npx tsx scripts/strip-guest-honorifics.ts --live           # dry run
 *   npx tsx scripts/strip-guest-honorifics.ts --live --apply
 */

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { Pool } from "pg"

import { normalizeName, slugify } from "./backfill-guests-from-youtube"

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

/** Reviewed, not derived. `bio` is what the honorific becomes. */
export const HONORIFIC_SPLITS: { was: string; name: string; bio: string }[] = [
  { was: "الملازم عبدالله البطي", name: "عبدالله البطي", bio: "ملازم — من أبطال حرب تحرير الكويت" },
  { was: "الأستاذ علي دريساوي", name: "علي دريساوي", bio: "مستشار إداري" },
  { was: "الدكتور الحارث المزيدي", name: "الحارث المزيدي", bio: "دكتور" },
]

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY" : "dry run"}\n`)

  const rows = (
    await pool.query<{ id: string; name: string; slug: string; bio: string | null }>(
      `select id, name, slug, bio from guests`,
    )
  ).rows

  const plan: { id: string; was: string; name: string; slug: string; bio: string; hadBio: string | null }[] = []
  for (const split of HONORIFIC_SPLITS) {
    const row = rows.find((r) => normalizeName(r.name) === normalizeName(split.was))
    if (!row) {
      console.log(`  · ${split.was} — not present, nothing to do`)
      continue
    }
    plan.push({ id: row.id, was: row.name, name: split.name, slug: slugify(split.name), bio: split.bio, hadBio: row.bio })
    console.log(`  ${row.name}`)
    console.log(`    name → ${split.name}`)
    console.log(`    slug → ${slugify(split.name)}   (was ${row.slug})`)
    console.log(`    bio  → ${split.bio}${row.bio ? `   ⚠️ OVERWRITES "${row.bio}"` : ""}`)
  }

  // A guest whose new name collides with a row that already exists would merge
  // two people. Refuse rather than discover it afterwards.
  for (const p of plan) {
    const clash = rows.find((r) => r.id !== p.id && normalizeName(r.name) === normalizeName(p.name))
    if (clash) throw new Error(`"${p.name}" already exists as ${clash.id} — would merge two guests`)
  }

  console.log(`\n▸ ${plan.length} row(s) to rewrite.`)
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `guest-honorifics-backup-${target}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(rows, null, 1), "utf8")
  console.log(`\n▸ backup of all ${rows.length} guest rows written to:\n  ${backupPath}\n`)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const p of plan) {
      await client.query(
        `update guests set name = $2, slug = $3, bio = coalesce(nullif($4,''), bio) where id = $1`,
        [p.id, p.name, p.slug, p.bio],
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

  console.log(`▸ ${plan.length} guest(s) rewritten.\n`)
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
