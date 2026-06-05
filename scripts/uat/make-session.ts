// Create a real admin session for a specific user and print the cookie token.
// Used by UAT scripts to authenticate admin API requests.
import crypto from "crypto"
import { db } from "../../lib/db"
import { adminUsers, adminSessions } from "../../lib/db/schema"
import { eq } from "drizzle-orm"

const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000

async function main() {
  if (!db) throw new Error("no db")
  const targetRole = (process.argv[2] || "OWNER") as "OWNER" | "ADMIN" | "EDITOR"
  const users = await db.select().from(adminUsers).where(eq(adminUsers.role, targetRole))
  if (users.length === 0) {
    // create temp user
    const tempId = crypto.randomUUID()
    const email = `uat-${targetRole.toLowerCase()}-${Date.now()}@khat.test`
    await db.insert(adminUsers).values({
      id: tempId,
      email,
      password_hash: "$2a$12$uatplaceholder.hash.not.usable.for.login",
      role: targetRole,
      is_active: true,
    })
    users.push((await db.select().from(adminUsers).where(eq(adminUsers.id, tempId)))[0])
  }
  const user = users[0]
  const token = crypto.randomBytes(32).toString("hex")
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)
  await db.insert(adminSessions).values({
    user_id: user.id,
    token_hash: tokenHash,
    ip_address: "127.0.0.1",
    user_agent: "khat-uat",
    expires_at: expiresAt,
  })
  console.log(JSON.stringify({
    token,
    userId: user.id,
    email: user.email,
    role: user.role,
  }))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
