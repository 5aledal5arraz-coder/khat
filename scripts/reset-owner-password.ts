/**
 * Reset an admin OWNER's password. Use when the owner password is lost — the
 * seeder (seed-owner.ts) refuses once an OWNER exists, so this is the reset path.
 *
 * The new password comes from NEW_OWNER_PASSWORD so it is never hard-coded or
 * echoed. By default it targets the single OWNER row; pass OWNER_EMAIL to target
 * a specific admin. It bcrypt-hashes (cost 12, same as lib/admin/auth.ts) and
 * clears that user's existing sessions so old cookies stop working.
 *
 * Usage:
 *   NEW_OWNER_PASSWORD='YourNewPass123' \
 *   DATABASE_URL="$(grep ^DATABASE_URL= .env.local | cut -d= -f2-)" \
 *   npx tsx scripts/reset-owner-password.ts
 *
 *   # target a specific account instead of the OWNER:
 *   OWNER_EMAIL='someone@example.com' NEW_OWNER_PASSWORD='…' DATABASE_URL='…' npx tsx scripts/reset-owner-password.ts
 */
import pg from "pg"
import bcrypt from "bcryptjs"

const { Client } = pg

const newPassword = process.env.NEW_OWNER_PASSWORD
const targetEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
const rawUrl = process.env.DATABASE_URL

if (!newPassword || !rawUrl) {
  console.error("Missing required environment variables.")
  console.error(
    "Usage: NEW_OWNER_PASSWORD='...' DATABASE_URL='...' [OWNER_EMAIL='...'] npx tsx scripts/reset-owner-password.ts",
  )
  process.exit(1)
}

// Same strength rules as lib/admin/auth.ts (and seed-owner.ts).
if (newPassword.length < 10) {
  console.error("Password must be at least 10 characters.")
  process.exit(1)
}
if (!/[a-zA-Z]/.test(newPassword)) {
  console.error("Password must contain letters (a-z or A-Z).")
  process.exit(1)
}
if (!/[0-9]/.test(newPassword)) {
  console.error("Password must contain numbers (0-9).")
  process.exit(1)
}

// Strip sslmode from URL — handle SSL via client config (same as lib/db.ts).
const dbUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
const isLocalhost = rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")

async function main() {
  const client = new Client({
    connectionString: dbUrl,
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
  })
  await client.connect()

  // Resolve the target: a specific email if given, else the single OWNER.
  const target = targetEmail
    ? await client.query(`SELECT id, email, role FROM admin_users WHERE email = $1 LIMIT 1`, [targetEmail])
    : await client.query(`SELECT id, email, role FROM admin_users WHERE role = 'OWNER' ORDER BY created_at ASC LIMIT 1`)

  if (target.rows.length === 0) {
    console.error(targetEmail ? `No admin_users row for "${targetEmail}".` : "No OWNER account found.")
    await client.end()
    process.exit(1)
  }

  const user = target.rows[0]
  const passwordHash = await bcrypt.hash(newPassword!, 12)

  await client.query(
    `UPDATE admin_users SET password_hash = $1, is_active = true, updated_at = NOW() WHERE id = $2`,
    [passwordHash, user.id],
  )

  // Invalidate existing sessions so any old cookie is dead after the reset.
  const cleared = await client.query(`DELETE FROM admin_sessions WHERE user_id = $1`, [user.id])

  console.log("Password reset successfully.")
  console.log(`  Email:   ${user.email}`)
  console.log(`  Role:    ${user.role}`)
  console.log(`  Sessions cleared: ${cleared.rowCount}`)
  console.log("You can now log in at /admin/login with the new password.")

  await client.end()
}

main().catch((err) => {
  console.error("Failed to reset password:", err)
  process.exit(1)
})
