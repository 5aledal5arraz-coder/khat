/**
 * Runs migration SQL files against Supabase via the pooler connection.
 * Usage: npx tsx scripts/run-migration.ts [migration-files...]
 *
 * If no files specified, runs all migrations in order.
 */

import { readFile } from "fs/promises"
import path from "path"
import pg from "pg"

const DB_URL = process.env.DATABASE_URL

if (!DB_URL) {
  console.error("Missing DATABASE_URL env var")
  console.error("Example: DATABASE_URL='postgres://postgres.ref:password@pooler.supabase.com:6543/postgres' npx tsx scripts/run-migration.ts")
  process.exit(1)
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("Usage: npx tsx scripts/run-migration.ts <migration-file> [...]")
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: DB_URL })

  try {
    console.log("Connecting to database...")
    await client.connect()
    console.log("Connected!\n")

    for (const file of files) {
      const filePath = path.resolve(file)
      console.log(`Running: ${file}`)
      const sql = await readFile(filePath, "utf-8")

      try {
        await client.query(sql)
        console.log(`  ✓ Success\n`)
      } catch (err: unknown) {
        const pgErr = err as { message: string }
        console.error(`  ✗ Error: ${pgErr.message}\n`)
      }
    }
  } finally {
    await client.end()
  }

  console.log("Done!")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
