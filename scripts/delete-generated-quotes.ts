/**
 * Remove the generated quote rail from published episode pages.
 *
 * Khaled's rule (2026-08-04): an episode already on YouTube carries YouTube's
 * own words and nothing we generated. `scripts/sync-youtube-content.ts` handled
 * the description and the index; this handles the quote rail, which is a
 * separate table and a separate — sharper — problem.
 *
 * WHY THESE ROWS ARE NOT SALVAGEABLE
 * All 41 `home_quotes` and all 41 `daily_reflections` on production carry the
 * SAME `created_at` (2026-02-11T21:36:31.898Z) and sequential seed ids
 * (`hq-1770845791898-3`, `dr-1770845791905-1`). They are one generated batch,
 * one row per episode, not editorial work that accumulated.
 *
 * The liability is the attribution. `home_quotes.attribution` names real
 * people: «عبدالله البطي» is credited with "كل لحظة من الحرب كانت درسًا في
 * الشجاعة" — a sentence generated for him, published under his name on a page
 * that is about him. `daily_reflections` mostly attributes to "بودكاست خط"
 * (the show itself), so it is the same fabrication with less exposure — which
 * is why the two are separate flags here rather than one switch.
 *
 * BLAST RADIUS
 * Both tables feed exactly one public surface: the «اكتشف أكثر» rail in
 * `components/episodes/episode-connections.tsx`, which renders only when at
 * least one of the two is non-empty. The homepage does not read either table.
 * Clearing both removes that rail; clearing quotes alone leaves the
 * reflections and the rail standing.
 *
 * Usage
 *   npx tsx scripts/delete-generated-quotes.ts --live                  # dry run
 *   npx tsx scripts/delete-generated-quotes.ts --live --apply          # quotes
 *   npx tsx scripts/delete-generated-quotes.ts --live --apply --reflections
 *
 * Every run that writes dumps the full rows to a JSON backup first and prints
 * the path. Re-inserting from that file is a plain `INSERT` — nothing about
 * these tables is derived or regenerated on read.
 */

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { Pool } from "pg"

const argv = process.argv.slice(2)
const APPLY = argv.includes("--apply")
const LIVE = argv.includes("--live")
const ALSO_REFLECTIONS = argv.includes("--reflections")

function readEnv(name: string): string {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  return (file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "")
}

const DB_URL = readEnv(LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL")
if (!DB_URL) throw new Error(`${LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"} is not set`)

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY (deletes)" : "dry run"}`)

  const tables = ["home_quotes", ...(ALSO_REFLECTIONS ? ["daily_reflections"] : [])]

  const rows: Record<string, unknown[]> = {}
  for (const t of tables) {
    const r = await pool.query(`select * from ${t}`)
    rows[t] = r.rows
    console.log(`\n▸ ${t}: ${r.rowCount} rows`)
    // Show who the generated words are being put in the mouth of.
    const named = r.rows
      .map((x: Record<string, unknown>) => String(x.attribution ?? ""))
      .filter((a) => a && a !== "بودكاست خط")
    const unique = [...new Set(named)]
    if (unique.length > 0) {
      console.log(`  attributed to ${unique.length} named ${unique.length === 1 ? "person" : "people"}: ${unique.slice(0, 8).join("، ")}${unique.length > 8 ? " …" : ""}`)
    }
  }

  if (!ALSO_REFLECTIONS) {
    const dr = await pool.query(`select count(*)::int n from daily_reflections`)
    console.log(
      `\n▸ daily_reflections left alone: ${dr.rows[0].n} rows.` +
        `\n  The «اكتشف أكثر» rail will still render for them. Pass --reflections to clear those too.`,
    )
  }

  if (!APPLY) {
    console.log("\nDry run — nothing was deleted. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `quotes-backup-${target}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(rows, null, 1), "utf8")
  console.log(`\n▸ backup written to:\n  ${backupPath}\n`)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const t of tables) {
      const r = await client.query(`delete from ${t}`)
      console.log(`  deleted ${r.rowCount} from ${t}`)
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    console.log(`✗ rolled back: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  } finally {
    client.release()
  }

  console.log(`\n▸ done. Restore from the backup above with a plain INSERT if needed.\n`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
