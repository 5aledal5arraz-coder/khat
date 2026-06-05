/**
 * Migration — add `linked_guest_id` to khat_map_guest_candidates.
 *
 * Bridges the Khat Map editorial wizard's guest-candidate table to the
 * canonical `guests` table. Required by the discovery → promotion bridge
 * so promoted discovery guests become usable by the season-level
 * convert-to-preparation flow without manual DB inserts.
 *
 * Idempotent. Strips sslmode from DATABASE_URL for DigitalOcean.
 */
import pg from "pg"

const raw = process.env.DATABASE_URL
if (!raw) {
  console.error("DATABASE_URL required")
  process.exit(1)
}
const url = raw.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")

async function main() {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  })
  const client = await pool.connect()
  try {
    console.log("→ ADD COLUMN linked_guest_id …")
    await client.query(`
      ALTER TABLE khat_map_guest_candidates
      ADD COLUMN IF NOT EXISTS linked_guest_id TEXT
        REFERENCES guests(id) ON DELETE SET NULL
    `)
    console.log("→ CREATE INDEX idx_khat_map_guest_cand_linked_guest …")
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_khat_map_guest_cand_linked_guest
        ON khat_map_guest_candidates(season_id, linked_guest_id)
        WHERE linked_guest_id IS NOT NULL
    `)
    console.log("✅ migration complete")
  } finally {
    client.release()
    await pool.end()
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
