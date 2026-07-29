/**
 * Measure how many SELECTs one public page load costs against
 * `episode_categories`.
 *
 * Acceptance ق4: showing categories on the public site must add AT MOST ONE
 * query per page load — never one per episode (41). Asserting that from
 * reading the code is not evidence; this counts the real scans Postgres
 * performed, from `pg_stat_user_tables`, around a real HTTP request.
 *
 * Usage (dev server must be running):
 *   npx tsx scripts/diag-category-query-count.ts [baseUrl]
 */

import { loadEnvFiles } from "@/lib/env-file"
loadEnvFiles()

import { Pool } from "pg"

const BASE = process.argv[2] || "http://localhost:3000"

const PATHS = [
  // Control: the homepage renders cards from the SAME cached list but never
  // asks for the category list itself. Whatever it costs is the pipeline's
  // own attach query, not the chips'.
  ["/", "الرئيسية (شاهد)"],
  ["/episodes", "الأرشيف بلا فلتر"],
  ["/episodes?category=" + encodeURIComponent("سالفة"), "الأرشيف مفلتَر"],
  ["/categories/" + encodeURIComponent("سالفة"), "صفحة التصنيف"],
] as const

/** pg's stats collector is asynchronous — give it time to flush. */
const FLUSH_MS = 2500

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=require/, ""),
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  })

  const scans = async (): Promise<number> => {
    const r = await pool.query<{ n: string }>(
      `SELECT COALESCE(seq_scan, 0) + COALESCE(idx_scan, 0) AS n
         FROM pg_stat_user_tables WHERE relname = 'episode_categories'`,
    )
    return Number(r.rows[0]?.n ?? 0)
  }

  console.log(`قياس عدد الاستعلامات على episode_categories — ${BASE}\n`)

  for (const [path, label] of PATHS) {
    // Warm THIS path immediately before measuring it. In dev the first hit
    // also compiles the route, and — the reason this matters — the 5-minute
    // `getCachedPublicEpisodes` snapshot is shared site-wide: when it expires
    // its refresh costs one more read, and measuring a cold window attributes
    // that shared refresh to whichever page happened to trigger it.
    await fetch(BASE + path).then((r) => r.text())
    await sleep(FLUSH_MS)

    const before = await scans()
    const res = await fetch(BASE + path)
    await res.text()
    await sleep(FLUSH_MS)
    const after = await scans()

    console.log(
      `${String(after - before).padStart(2)} استعلام  ·  ${res.status}  ·  ${label}  (${path})`,
    )
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
