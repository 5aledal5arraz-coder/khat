/**
 * Seed local database from live DigitalOcean database.
 * Usage: LIVE_DATABASE_URL="<live>" LOCAL_DATABASE_URL="<local>" npx tsx scripts/seed-from-live.ts
 */
import pg from "pg"
const { Client } = pg

if (!process.env.LIVE_DATABASE_URL || !process.env.LOCAL_DATABASE_URL) {
  console.error("Missing LIVE_DATABASE_URL or LOCAL_DATABASE_URL env vars")
  console.error('Usage: LIVE_DATABASE_URL="postgres://..." LOCAL_DATABASE_URL="postgres://..." npx tsx scripts/seed-from-live.ts')
  process.exit(1)
}

const LIVE_URL: string = process.env.LIVE_DATABASE_URL
const LOCAL_URL: string = process.env.LOCAL_DATABASE_URL

// Tables in dependency order (parents before children)
const TABLES = [
  // Independent tables first
  "site_settings",
  "static_content",
  "platform_analytics",
  // Core content
  "guests",
  "episodes",
  "timestamps",
  "quotes",
  "resources",

  // Episode config tables
  "episode_overrides",
  "episode_enrichments",
  "episode_quotes_config",
  "hidden_episodes",
  "episode_versions",

  // Home content
  "home_quotes",
  "daily_reflections",

  // Studio
  "studio_sessions",
  "studio_transcripts",
  "studio_ai_outputs",
  "studio_chapters",
  "studio_clips",
  "studio_website_packages",
  "studio_analyzers",

  // Teasers
  "teasers",
  "teaser_questions",

  // Submissions
  "newsletter_subscribers",
  "sponsorship_leads",
  "guest_applications",

  // Personalization
  "visitor_events",
  "visitor_profiles",
]

async function main() {
  const isLiveLocal = LIVE_URL.includes("localhost")
  const isLocalLocal = LOCAL_URL.includes("localhost")
  const live = new Client({
    connectionString: LIVE_URL,
    ...(isLiveLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  })
  const local = new Client({
    connectionString: LOCAL_URL,
    ...(isLocalLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  })

  await live.connect()
  await local.connect()
  console.log("Connected to both databases\n")

  // Disable FK checks during import
  await local.query("SET session_replication_role = 'replica';")

  let totalRows = 0

  for (const table of TABLES) {
    try {
      // Check if table exists on live
      const existsCheck = await live.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
        [table]
      )
      if (!existsCheck.rows[0].exists) {
        console.log(`  ⏭  ${table} — not on live server, skipping`)
        continue
      }

      // Get row count from live
      const countResult = await live.query(`SELECT COUNT(*) FROM "${table}"`)
      const count = parseInt(countResult.rows[0].count, 10)

      if (count === 0) {
        console.log(`  ⏭  ${table} — empty on live, skipping`)
        continue
      }

      // Clear local table
      await local.query(`DELETE FROM "${table}"`)

      // Fetch all rows from live
      const { rows, fields } = await live.query(`SELECT * FROM "${table}"`)
      const columns = fields.map((f) => `"${f.name}"`)

      // Batch insert (chunks of 100)
      const chunkSize = 100
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        const valuePlaceholders: string[] = []
        const values: unknown[] = []
        let paramIdx = 1

        for (const row of chunk) {
          const rowPlaceholders: string[] = []
          for (const field of fields) {
            let val = row[field.name]
            // Serialize objects/arrays to JSON string for JSONB columns
            if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
              val = JSON.stringify(val)
            }
            rowPlaceholders.push(`$${paramIdx++}`)
            values.push(val)
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`)
        }

        await local.query(
          `INSERT INTO "${table}" (${columns.join(", ")}) VALUES ${valuePlaceholders.join(", ")} ON CONFLICT DO NOTHING`,
          values
        )
      }

      totalRows += count
      console.log(`  ✅ ${table} — ${count} rows`)
    } catch (err: unknown) {
      console.log(`  ❌ ${table} — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Re-enable FK checks
  await local.query("SET session_replication_role = 'origin';")

  console.log(`\nDone! Seeded ${totalRows} total rows across ${TABLES.length} tables.`)

  await live.end()
  await local.end()
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
