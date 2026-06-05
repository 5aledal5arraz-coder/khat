/**
 * Khat Brain Phase 5 — drop legacy Studio tables.
 *
 * After Phase 5 migrations, every Studio kind reads and writes through
 * studio_analysis_records exclusively. The legacy tables are dead
 * weight; this script drops them.
 *
 * Idempotent: uses DROP TABLE IF EXISTS. CASCADE because some have
 * dependents we removed (e.g. studio_push_log via studio_sessions FK).
 *
 *   npm run migrate:khat-brain-drop-legacy-studio
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

const LEGACY_TABLES = [
  "studio_transcripts",
  "studio_ai_outputs",
  "studio_chapters",
  "studio_clips",
  "studio_website_packages",
  "studio_analyzers",
  "studio_deep_analysis",
  "studio_guest_intelligence",
  "studio_push_log",
] as const

async function main() {
  console.log("Khat Brain Phase 5 — drop legacy Studio tables\n")

  for (const tbl of LEGACY_TABLES) {
    process.stdout.write(`  · drop ${tbl} … `)
    await db!.execute(sql.raw(`DROP TABLE IF EXISTS ${tbl} CASCADE`))
    console.log("ok")
  }

  console.log("\n✅ Legacy Studio tables dropped.")
  console.log(
    "   studio_analysis_records is now the sole source of truth for all 9 kinds.",
  )
  process.exit(0)
}

main().catch((e) => {
  console.error("❌ drop failed:", e)
  process.exit(1)
})
