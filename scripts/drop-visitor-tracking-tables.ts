/**
 * Drop the three orphaned visitor-tracking tables.
 *
 * ── WHAT THESE ARE ────────────────────────────────────────────────────────
 * `visitor_events`, `visitor_profiles`, `watch_history` backed a half-built
 * system that recorded who visited, which episodes they watched, and where
 * they stopped. Khalid asked what it would give him that YouTube does not —
 * and the honest answer was nothing — so he had it removed on 2026-08-04.
 * The code went with it: `lib/personalization/`, `app/api/events/`,
 * `types/personalization.ts` and the Drizzle definitions are all gone.
 *
 * The TABLES were dropped on production the same day. They were never dropped
 * locally, so the local database carried three tables that no code in this
 * repository can name — found by a full local-vs-prod diff on 2026-08-05
 * (128 tables local, 125 prod). This closes that gap.
 *
 * ── WHY A SCRIPT AND NOT THREE DROP STATEMENTS ────────────────────────────
 * Because `visitor_events` is not empty. It holds 65 rows locally: the only
 * trace that anyone ever exercised this feature. They are worthless as
 * product data and nobody will miss them, but "nobody will miss it" is not a
 * reason to destroy something unrecoverably — so every row is written to JSON
 * first, exactly as the production drop did. The backup is the point of the
 * file; the DROP is one line.
 *
 * IDEMPOTENT (`IF EXISTS`) and safe to re-run: on a database where the tables
 * are already gone it backs up nothing and drops nothing.
 *
 * Usage
 *   npx tsx scripts/drop-visitor-tracking-tables.ts            # local, dry run
 *   npx tsx scripts/drop-visitor-tracking-tables.ts --apply
 *   npx tsx scripts/drop-visitor-tracking-tables.ts --live     # (already done)
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

/** Child-first, so a foreign key cannot block the parent's drop. */
const TABLES = ["watch_history", "visitor_events", "visitor_profiles"] as const

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY" : "dry run"}\n`)

  const present = (
    await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = any($1)`,
      [TABLES as unknown as string[]],
    )
  ).rows.map((r) => r.table_name)

  if (!present.length) {
    console.log("  none of the three tables exist here — nothing to do.\n")
    await pool.end()
    return
  }

  const contents: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    if (!present.includes(t)) {
      console.log(`  · ${t} — already gone`)
      continue
    }
    const rows = (await pool.query(`select * from "${t}"`)).rows
    contents[t] = rows
    console.log(`  ${t.padEnd(18)} ${String(rows.length).padStart(4)} row(s) to back up, then drop`)
  }

  // Anything still referencing these tables would make the drop a real
  // deletion of live data rather than the removal of an orphan. Say so.
  const refs = (
    await pool.query<{ table_name: string; constraint_name: string }>(
      `select distinct tc.table_name, tc.constraint_name
         from information_schema.table_constraints tc
         join information_schema.constraint_column_usage ccu
           on tc.constraint_name = ccu.constraint_name
        where tc.constraint_type = 'FOREIGN KEY'
          and ccu.table_name = any($1)
          and tc.table_name <> all($1)`,
      [TABLES as unknown as string[]],
    )
  ).rows
  if (refs.length) {
    console.log(`\n  ⚠️  ${refs.length} table(s) outside this set still reference them:`)
    for (const r of refs) console.log(`      ${r.table_name} (${r.constraint_name})`)
    console.log("      That makes this more than an orphan drop — stopping.")
    await pool.end()
    process.exitCode = 1
    return
  }
  console.log("\n  ✅ nothing outside these three references them — they are orphans.")

  if (!APPLY) {
    console.log("\nDry run — nothing written, nothing dropped. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `visitor-tracking-backup-${LIVE ? "prod" : "local"}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(contents, null, 1), "utf8")
  const total = Object.values(contents).reduce((a, r) => a + r.length, 0)
  console.log(`\n▸ ${total} row(s) written to:\n  ${backupPath}\n`)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const t of TABLES) await client.query(`drop table if exists "${t}" cascade`)
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    console.log(`✗ rolled back: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  } finally {
    client.release()
  }

  console.log(`▸ ${present.length} table(s) dropped.\n`)
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
