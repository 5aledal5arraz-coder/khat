import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

async function main() {
  if (!db) { console.error("no db"); process.exit(1) }

  const a = await db.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'khat_map_episode_candidates'
      AND column_name IN ('composite_score', 'composite_score_rationale', 'risk_level', 'effort_level')
    ORDER BY column_name
  `)
  console.log("khat_map_episode_candidates columns:")
  for (const r of a.rows) console.log(" ", r)

  const b = await db.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'ai_runs'
      AND column_name = 'season_id'
  `)
  console.log("\nai_runs columns:")
  for (const r of b.rows) console.log(" ", r)

  const c = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM ai_runs
    WHERE season_id IS NOT NULL
  `)
  console.log("\nai_runs.season_id populated rows:", c.rows[0])

  process.exit(0)
}
main().catch((err) => { console.error(err); process.exit(1) })
