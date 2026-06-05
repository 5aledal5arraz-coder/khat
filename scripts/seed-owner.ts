/**
 * Seed the initial OWNER account for admin auth.
 * This is the ONLY way to create an OWNER — no HTTP route exists for this.
 *
 * Usage:
 *   OWNER_EMAIL="owner@example.com" OWNER_PASSWORD="SecurePass123" DATABASE_URL="postgres://..." npx tsx scripts/seed-owner.ts
 */
import pg from "pg"
import bcrypt from "bcryptjs"
import crypto from "crypto"

const { Client } = pg

const rawEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
const rawPassword = process.env.OWNER_PASSWORD
const rawUrl = process.env.DATABASE_URL

if (!rawEmail || !rawPassword || !rawUrl) {
  console.error("Missing required environment variables.")
  console.error(
    'Usage: OWNER_EMAIL="..." OWNER_PASSWORD="..." DATABASE_URL="..." npx tsx scripts/seed-owner.ts',
  )
  process.exit(1)
}

const email = rawEmail
const password = rawPassword

// Validate password strength (same rules as lib/admin/auth.ts)
if (password.length < 10) {
  console.error("Password must be at least 10 characters.")
  process.exit(1)
}
if (!/[a-zA-Z]/.test(password)) {
  console.error("Password must contain letters (a-z or A-Z).")
  process.exit(1)
}
if (!/[0-9]/.test(password)) {
  console.error("Password must contain numbers (0-9).")
  process.exit(1)
}

// Strip sslmode from URL — handle SSL via client config (same as lib/db.ts)
const dbUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
const isLocalhost = rawUrl.includes("localhost")

async function main() {
  const client = new Client({
    connectionString: dbUrl,
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
  })

  await client.connect()
  console.log("Connected to database.")

  // Check if an OWNER already exists
  const existing = await client.query(
    `SELECT id, email FROM admin_users WHERE role = 'OWNER' LIMIT 1`,
  )
  if (existing.rows.length > 0) {
    console.error(
      `An OWNER already exists: ${existing.rows[0].email} (${existing.rows[0].id})`,
    )
    console.error("Only one OWNER is allowed. Aborting.")
    await client.end()
    process.exit(1)
  }

  // Check if email is already taken
  const emailCheck = await client.query(
    `SELECT id FROM admin_users WHERE email = $1 LIMIT 1`,
    [email],
  )
  if (emailCheck.rows.length > 0) {
    console.error(`Email "${email}" is already registered.`)
    await client.end()
    process.exit(1)
  }

  // Hash password with bcrypt (cost 12, same as lib/admin/auth.ts)
  const passwordHash = await bcrypt.hash(password, 12)
  const id = crypto.randomUUID()

  await client.query(
    `INSERT INTO admin_users (id, email, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'OWNER', true, NOW(), NOW())`,
    [id, email, passwordHash],
  )

  console.log(`OWNER account created successfully.`)
  console.log(`  ID:    ${id}`)
  console.log(`  Email: ${email}`)
  console.log(`  Role:  OWNER`)

  await client.end()
}

main().catch((err) => {
  console.error("Failed to seed OWNER:", err)
  process.exit(1)
})
