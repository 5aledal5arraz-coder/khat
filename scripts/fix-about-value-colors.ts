/**
 * Repoint the three /about value-card gradients at identity colours.
 *
 * The classes live in `static_content.content->values[].color`, i.e. in the
 * DATABASE, not only in config/static-content.json — the JSON is a seed and the
 * DB row is what renders. Fixing the seed alone changes nothing on a running
 * site, which is why this runs against the DB as well.
 *
 *   npx tsx <this> [--live] [--apply]
 */
import { Pool } from "pg"; import { readFileSync, writeFileSync } from "fs"; import path from "path"
const argv = process.argv.slice(2)
const APPLY = argv.includes("--apply"), LIVE = argv.includes("--live")
const key = LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"
const url = (process.env[key] ?? (readFileSync(".env.local","utf8").match(new RegExp(`^${key}=(.*)$`,"m"))?.[1] ?? "")).trim().replace(/^["']|["']$/g,"")
if (!url) throw new Error(`${key} is not set`)

const NEW: Record<string,string> = {
  "الأصالة": "from-primary/20 to-primary/5",
  "الإلهام": "from-accent/20 to-accent/5",
  "المجتمع": "from-muted-foreground/20 to-muted-foreground/5",
}
const FALLBACK = "from-primary/20 to-primary/5"

async function main() {
  const pool = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/,""), ...(LIVE?{ssl:{rejectUnauthorized:false}}:{}) })
  console.log(`\n▸ target: ${LIVE?"PRODUCTION":"local"}   mode: ${APPLY?"APPLY":"dry run"}\n`)
  const rows = (await pool.query(`select content from static_content where key='about'`)).rows
  if (!rows[0]) { console.log("  no `about` row — nothing to do"); await pool.end(); return }
  const content = rows[0].content as { values?: { title: string; color?: string }[] }
  const values = content.values ?? []
  if (!values.length) { console.log("  the `about` row carries no values[] — nothing to do"); await pool.end(); return }

  let changed = 0
  for (const v of values) {
    const next = NEW[v.title] ?? FALLBACK
    if (v.color === next) { console.log(`  · ${v.title} — already ${next}`); continue }
    console.log(`  ${v.title}\n    ${v.color ?? "(none)"}\n    → ${next}`)
    v.color = next; changed++
  }
  console.log(`\n▸ ${changed} card(s) to rewrite.`)
  if (!changed) { await pool.end(); return }
  if (!APPLY) { console.log("\nDry run — nothing written. Re-run with --apply.\n"); await pool.end(); return }

  const stamp = new Date().toISOString().replace(/[:.]/g,"-")
  const backup = path.join(process.cwd(), `about-content-backup-${LIVE?"prod":"local"}-${stamp}.json`)
  writeFileSync(backup, JSON.stringify(rows[0].content, null, 1), "utf8")
  console.log(`\n▸ backup written to:\n  ${backup}\n`)

  await pool.query(`update static_content set content=$1 where key='about'`, [JSON.stringify(content)])
  console.log(`▸ ${changed} card(s) rewritten.\n`)
  await pool.end()
}
main().catch((e)=>{ console.error(e); process.exit(1) })
