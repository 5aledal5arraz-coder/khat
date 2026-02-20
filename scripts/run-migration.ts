/**
 * Runs SQL files against PostgreSQL.
 * Usage: DATABASE_URL="<url>" npx tsx scripts/run-migration.ts [sql-files...]
 */

import { readFile } from "fs/promises"
import path from "path"
import pg from "pg"

const DB_URL = process.env.DATABASE_URL

if (!DB_URL) {
  console.error("Missing DATABASE_URL env var")
  console.error('Usage: DATABASE_URL="postgres://..." npx tsx scripts/run-migration.ts <sql-file>')
  process.exit(1)
}

// Strip sslmode from URL — handle SSL via client config (same as lib/db.ts)
const cleanUrl = DB_URL.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
const isLocalhost = DB_URL.includes("localhost")

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("Usage: npx tsx scripts/run-migration.ts <sql-file> [...]")
    process.exit(1)
  }

  const client = new pg.Client({
    connectionString: cleanUrl,
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
  })

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
