/**
 * scripts/reset-admin-password.ts
 *
 * Local-only password reset for an admin account. Use when an operator
 * has forgotten their dashboard password and cannot log in through the
 * normal flow.
 *
 *   npx tsx scripts/reset-admin-password.ts <email>
 *
 * Then enter the new password at the prompt (hidden — not echoed to the
 * terminal and not stored in shell history).
 *
 * What this script does:
 *   1. Verifies an `admin_users` row exists for the email.
 *   2. Validates the new password against the same `validateAdminPassword`
 *      rules the live login API uses (min length, etc).
 *   3. Hashes the new password with bcryptjs at the same BCRYPT_ROUNDS
 *      cost factor as `hashPassword()`.
 *   4. UPDATEs `admin_users.password_hash` and stamps `updated_at`.
 *   5. Revokes every existing session for that user (DELETE from
 *      `admin_sessions` WHERE user_id = ?) — forces the operator to
 *      re-login with the new password from a clean state.
 *   6. Writes an `admin_audit_logs` entry tagged
 *      `password_reset_via_cli` for traceability.
 *
 * Safety:
 *   • Single-table write surface — touches only `admin_users`,
 *     `admin_sessions`, `admin_audit_logs`.
 *   • Refuses to run if DATABASE_URL is unset.
 *   • Refuses to run against production URLs unless `--force-prod` is
 *     passed (a thin guard — not a substitute for not running this in
 *     prod). The default URL check looks for the production hostname
 *     in the project's CLAUDE.md (`khatpodcast.com`).
 *   • Does NOT echo the password to stdout, the audit log, or any other
 *     persisted location.
 *   • Does NOT log the bcrypt hash (only the column-update count).
 *
 * Exits non-zero on any failure.
 */

import { eq } from "drizzle-orm"
import * as readline from "node:readline"
import { Writable } from "node:stream"
import { db } from "@/lib/db"
import { adminUsers, adminSessions, adminAuditLogs } from "@/lib/db/schema/admin-auth"
import { hashPassword, validateAdminPassword } from "@/lib/admin/auth"

interface Args {
  email: string
  forceProd: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let email = ""
  let forceProd = false
  for (const a of argv) {
    if (a === "--force-prod") {
      forceProd = true
    } else if (!email && !a.startsWith("--")) {
      email = a.trim().toLowerCase()
    }
  }
  if (!email) {
    console.error(
      "[reset-admin-password] usage: npx tsx scripts/reset-admin-password.ts <email>",
    )
    process.exit(2)
  }
  return { email, forceProd }
}

/**
 * Read a line of input from stdin with no echo. Falls back to plain
 * readline if stdin is not a TTY (e.g. CI piped input).
 */
async function readHiddenLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-interactive: read one line from stdin as-is.
      const rl = readline.createInterface({ input: process.stdin })
      rl.once("line", (line) => {
        rl.close()
        resolve(line)
      })
      return
    }

    // Interactive: mute output by routing through a writable that
    // discards characters after the prompt is printed.
    process.stdout.write(prompt)
    let muted = false
    const mutableStdout = new Writable({
      write(chunk, _encoding, cb) {
        if (!muted) process.stdout.write(chunk)
        cb()
      },
    })
    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    })
    muted = true
    rl.once("line", (line) => {
      muted = false
      process.stdout.write("\n")
      rl.close()
      resolve(line)
    })
  })
}

function looksLikeProdUrl(url: string | undefined): boolean {
  if (!url) return false
  // Treat anything not pointing at localhost/127.0.0.1/db-pod hostname
  // as suspicious; refuse to run unless --force-prod is passed.
  const lower = url.toLowerCase()
  if (lower.includes("@localhost") || lower.includes("@127.0.0.1")) return false
  if (lower.includes("@db:")) return false
  return true
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (!db) {
    console.error("[reset-admin-password] DATABASE_URL is not configured.")
    process.exit(1)
  }
  if (looksLikeProdUrl(process.env.DATABASE_URL) && !args.forceProd) {
    console.error(
      "[reset-admin-password] DATABASE_URL does not look like a local DB. " +
        "Refusing to run. If this is intentional, re-run with --force-prod.",
    )
    process.exit(1)
  }

  // 1) Confirm the row exists.
  const [user] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      is_active: adminUsers.is_active,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, args.email))
    .limit(1)
  if (!user) {
    console.error(`[reset-admin-password] no admin_users row for ${args.email}`)
    process.exit(1)
  }
  console.log(
    `[reset-admin-password] found user: id=${user.id} role=${user.role} active=${user.is_active}`,
  )

  // 2) Prompt for the new password (hidden).
  const newPassword = await readHiddenLine("Enter new password: ")
  if (!newPassword) {
    console.error("[reset-admin-password] empty password — aborting.")
    process.exit(1)
  }
  const confirm = await readHiddenLine("Confirm new password: ")
  if (newPassword !== confirm) {
    console.error("[reset-admin-password] passwords do not match — aborting.")
    process.exit(1)
  }

  // 3) Validate against the same rules the live login API uses.
  const validation = validateAdminPassword(newPassword)
  if (!validation.valid) {
    console.error(
      `[reset-admin-password] password rejected by validateAdminPassword: ${validation.error ?? "unknown reason"}`,
    )
    process.exit(1)
  }

  // 4) Hash + update.
  const hash = await hashPassword(newPassword)
  const result = await db
    .update(adminUsers)
    .set({ password_hash: hash, updated_at: new Date() })
    .where(eq(adminUsers.id, user.id))
    .returning({ id: adminUsers.id })
  if (result.length === 0) {
    console.error("[reset-admin-password] update returned 0 rows — aborting.")
    process.exit(1)
  }

  // 5) Revoke all existing sessions for this user.
  const revoked = await db
    .delete(adminSessions)
    .where(eq(adminSessions.user_id, user.id))
    .returning({ id: adminSessions.id })
  console.log(`[reset-admin-password] revoked ${revoked.length} existing session(s)`)

  // 6) Audit log entry. Never logs the password.
  await db.insert(adminAuditLogs).values({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "password_reset_via_cli",
    metadata: {
      sessions_revoked: revoked.length,
      ran_from: "scripts/reset-admin-password.ts",
    },
  })

  console.log(
    `[reset-admin-password] success: password updated for ${args.email}. ` +
      "Existing sessions revoked. Log in via /admin/login with the new password.",
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(
    "[reset-admin-password] fatal:",
    err instanceof Error ? err.message : err,
  )
  process.exit(1)
})
