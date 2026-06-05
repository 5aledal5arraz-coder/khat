import crypto from "crypto"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { adminUsers, adminSessions, adminAuditLogs } from "@/lib/db/schema"
import { eq, and, gt, lt, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER"

export interface AdminUser {
  id: string
  email: string
  role: AdminRole
  is_active: boolean
  last_login_at: Date | null
  created_at: Date
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000 // 12 hours
export const BCRYPT_ROUNDS = 12

export const ADMIN_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const

export const ROLE_LEVELS: Record<AdminRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  EDITOR: 1,
  VIEWER: 0,
}

// ---------------------------------------------------------------------------
// Phase 1.1 — sliding session window constants
// ---------------------------------------------------------------------------

/** If the session has less than this much time left, slide-eligible. */
export const SLIDE_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours
/** How much to extend by on each slide. */
export const SLIDE_INCREMENT_MS = 30 * 60 * 1000 // 30 minutes
/** Absolute cap from initial login. No session can outlive this. */
export const SESSION_ABSOLUTE_CAP_MS = 24 * 60 * 60 * 1000 // 24 hours
/** At most one slide-update per session per this interval. */
export const SLIDE_THROTTLE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Phase 1.1 — Pure decision function for the sliding session window.
 *
 * Given the current time and the session's three relevant timestamps,
 * returns whether the session should be extended right now, and to
 * what `expires_at` value.
 *
 * Rules (all must hold for a slide):
 *   1. The session must currently be within SLIDE_THRESHOLD_MS of
 *      expiry (i.e. < 2h left).
 *   2. The session's age (now − sessionCreatedAt) must be under
 *      SESSION_ABSOLUTE_CAP_MS (i.e. < 24h since initial login).
 *   3. The session must not have been slid in the last SLIDE_THROTTLE_MS
 *      (5-minute throttle). `lastSeenAt = null` is treated as
 *      "never slid" so the first eligible request extends.
 *
 * When all three hold, the new expiry is `now + SLIDE_INCREMENT_MS`,
 * clamped so it never exceeds `sessionCreatedAt + SESSION_ABSOLUTE_CAP_MS`.
 *
 * Pure: no I/O, no DB, no env-flag check. The env flag is read in
 * verifyAdminSession() — keeping this function pure makes the
 * three-boundary unit tests trivial.
 */
export function decideSessionSlide(args: {
  now: Date
  sessionCreatedAt: Date
  expiresAt: Date
  lastSeenAt: Date | null
}): { shouldSlide: false } | { shouldSlide: true; newExpiresAt: Date } {
  const nowMs = args.now.getTime()
  const createdMs = args.sessionCreatedAt.getTime()
  const expiresMs = args.expiresAt.getTime()
  const lastSeenMs = args.lastSeenAt?.getTime() ?? null

  const remaining = expiresMs - nowMs
  const ageSinceLogin = nowMs - createdMs

  // Rule 1: must be inside the 2h-from-expiry window.
  if (remaining >= SLIDE_THRESHOLD_MS) return { shouldSlide: false }
  // Defensive: don't slide an already-expired session.
  if (remaining <= 0) return { shouldSlide: false }
  // Rule 2: 24h absolute cap from initial login.
  if (ageSinceLogin >= SESSION_ABSOLUTE_CAP_MS) return { shouldSlide: false }
  // Rule 3: 5-min throttle.
  if (lastSeenMs !== null && nowMs - lastSeenMs < SLIDE_THROTTLE_MS) {
    return { shouldSlide: false }
  }

  // Compute the new expiry and clamp to the absolute cap.
  const absoluteCapMs = createdMs + SESSION_ABSOLUTE_CAP_MS
  const proposedMs = nowMs + SLIDE_INCREMENT_MS
  const newMs = Math.min(proposedMs, absoluteCapMs)

  // If clamping wiped out the extension entirely (extended <= current),
  // don't bother with a DB UPDATE.
  if (newMs <= expiresMs) return { shouldSlide: false }

  return { shouldSlide: true, newExpiresAt: new Date(newMs) }
}

/** Read the runtime env flag controlling slide behavior. Default ON. */
export function isSlidingSessionEnabled(): boolean {
  return process.env.KHAT_SLIDING_SESSION_ENABLED !== "false"
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function createAdminSession(
  userId: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  if (!db) throw new Error("Database not available")

  const token = generateSessionToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

  await db.insert(adminSessions).values({
    user_id: userId,
    token_hash: tokenHash,
    ip_address: ip || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    expires_at: expiresAt,
  })

  return token
}

export async function verifyAdminSession(token: string): Promise<AdminUser | null> {
  if (!db) return null

  const tokenHash = hashToken(token)

  // Phase 1.1 — also select the session fields the slide rule needs.
  const rows = await db
    .select({
      // user fields
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      is_active: adminUsers.is_active,
      last_login_at: adminUsers.last_login_at,
      created_at: adminUsers.created_at,
      // session fields (sliding window)
      session_id: adminSessions.id,
      session_created_at: adminSessions.created_at,
      session_expires_at: adminSessions.expires_at,
      session_last_seen_at: adminSessions.last_seen_at,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.user_id, adminUsers.id))
    .where(
      and(
        eq(adminSessions.token_hash, tokenHash),
        gt(adminSessions.expires_at, new Date()),
        eq(adminUsers.is_active, true),
      ),
    )
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]

  // Phase 1.1 — sliding session window. Pure decision + at most one
  // UPDATE per call. Errors here are swallowed: a failed slide must
  // never fail the request itself (the session is already valid).
  if (isSlidingSessionEnabled() && row.session_id && row.session_created_at) {
    try {
      const decision = decideSessionSlide({
        now: new Date(),
        sessionCreatedAt: row.session_created_at,
        expiresAt: row.session_expires_at,
        lastSeenAt: row.session_last_seen_at,
      })
      if (decision.shouldSlide) {
        await db
          .update(adminSessions)
          .set({
            expires_at: decision.newExpiresAt,
            last_seen_at: new Date(),
          })
          .where(eq(adminSessions.id, row.session_id))
      }
    } catch (err) {
      // Non-fatal — log and proceed. The session was already valid.
      console.warn("[auth] sliding session update failed:", err)
    }
  }

  return {
    id: row.id,
    email: row.email,
    role: row.role as AdminRole,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at!,
  }
}

export async function deleteAdminSession(token: string): Promise<void> {
  if (!db) return
  const tokenHash = hashToken(token)
  await db.delete(adminSessions).where(eq(adminSessions.token_hash, tokenHash))
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  if (!db) return
  await db.delete(adminSessions).where(eq(adminSessions.user_id, userId))
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_DISABLED"
  | "USER_ENABLED"
  | "USER_PASSWORD_RESET"
  | "USER_DELETED"
  | "FORCE_LOGOUT"

export async function logAuditEvent(params: {
  actorId?: string | null
  action: AuditAction
  targetId?: string | null
  ip?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  if (!db) return

  try {
    await db.insert(adminAuditLogs).values({
      actor_user_id: params.actorId || null,
      action: params.action,
      target_user_id: params.targetId || null,
      ip_address: params.ip || null,
      metadata: params.metadata || null,
    })
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("Audit log error:", err)
  }
}

// ---------------------------------------------------------------------------
// Password validation (admin-specific, stricter than community)
// ---------------------------------------------------------------------------

export function validateAdminPassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 10) {
    return { valid: false, error: "كلمة المرور يجب أن تكون ١٠ أحرف على الأقل" }
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: "كلمة المرور يجب أن تحتوي على أحرف (a-z)" }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "كلمة المرور يجب أن تحتوي على أرقام (0-9)" }
  }
  return { valid: true }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getAdminUserByEmail(email: string) {
  if (!db) return null
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email.toLowerCase().trim()))
    .limit(1)
  return rows[0] || null
}

export async function getAdminUserById(id: string) {
  if (!db) return null
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1)
  return rows[0] || null
}

export async function updateLastLogin(userId: string): Promise<void> {
  if (!db) return
  await db
    .update(adminUsers)
    .set({ last_login_at: sql`NOW()` })
    .where(eq(adminUsers.id, userId))
}

/** Clean up expired sessions (can be called periodically). */
export async function cleanupExpiredSessions(): Promise<void> {
  if (!db) return
  await db.delete(adminSessions).where(lt(adminSessions.expires_at, new Date()))
}
