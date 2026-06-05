/**
 * Phase X Step 4 — Preparation V2 column migration.
 *
 *   ALTER episode_preparations ADD COLUMN prep_v2 jsonb
 *   npm run migrate:khat-brain-prep-v2
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Phase X Step 4 — Preparation V2 column\n")

  console.log("episode_preparations.prep_v2:")
  await exec(
    "add column",
    `ALTER TABLE episode_preparations ADD COLUMN IF NOT EXISTS prep_v2 jsonb`,
  )
  // We do NOT index this jsonb (queries are always by id; no jsonpath
  // search is planned in Phase X). When v2 search hits real workloads
  // we'll add a GIN(prep_v2 jsonb_path_ops) — not yet.

  console.log("\nDone!")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
