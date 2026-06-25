/**
 * POST /api/admin/auth/change-password
 *
 * Self-service password change for the logged-in admin. Previously the settings
 * UI posted here but no route existed (silent 404). Flow:
 *   1. Require an authenticated admin session + same-origin request.
 *   2. Verify the supplied current password against the stored hash.
 *   3. Validate the new password with the shared `validateAdminPassword` rule
 *      (≥10 chars, letters, numbers) — the single source of truth.
 *   4. Reject a no-op (new === current).
 *   5. Hash + persist, then revoke all OTHER sessions for this user (other
 *      devices are logged out; the current session stays valid).
 *   6. Write an audit-log entry. Never logs the password.
 */

import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers, adminSessions } from "@/lib/db/schema/admin-auth"
import {
  getAdminAuthUser,
  validateOrigin,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  successResponse,
} from "@/lib/api-utils"
import {
  getAdminUserById,
  verifyPassword,
  hashPassword,
  validateAdminPassword,
  hashToken,
  logAuditEvent,
} from "@/lib/admin/auth"

export async function POST(request: NextRequest) {
  const user = await getAdminAuthUser()
  if (!user) return unauthorizedResponse()
  if (!validateOrigin(request)) return errorResponse("طلب غير صالح", 403)
  if (!db) return errorResponse("قاعدة البيانات غير متاحة", 500)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const currentPassword = typeof b.currentPassword === "string" ? b.currentPassword : ""
  const newPassword = typeof b.newPassword === "string" ? b.newPassword : ""

  if (!currentPassword) {
    return validationErrorResponse("كلمة المرور الحالية مطلوبة")
  }

  const row = await getAdminUserById(user.id)
  if (!row) return unauthorizedResponse()

  const currentOk = await verifyPassword(currentPassword, row.password_hash)
  if (!currentOk) {
    return errorResponse("كلمة المرور الحالية غير صحيحة", 400)
  }

  const validation = validateAdminPassword(newPassword)
  if (!validation.valid) {
    return validationErrorResponse(validation.error ?? "كلمة مرور غير صالحة")
  }

  const sameAsOld = await verifyPassword(newPassword, row.password_hash)
  if (sameAsOld) {
    return validationErrorResponse("كلمة المرور الجديدة مطابقة للحالية")
  }

  const newHash = await hashPassword(newPassword)
  await db
    .update(adminUsers)
    .set({ password_hash: newHash, updated_at: new Date() })
    .where(eq(adminUsers.id, user.id))

  // Revoke every OTHER session so other devices are logged out; keep the
  // current one alive so the operator isn't bounced to login mid-change.
  const token = (await cookies()).get("__admin_session")?.value
  let revoked = 0
  if (token) {
    const currentHash = hashToken(token)
    const gone = await db
      .delete(adminSessions)
      .where(and(eq(adminSessions.user_id, user.id), ne(adminSessions.token_hash, currentHash)))
      .returning({ id: adminSessions.id })
    revoked = gone.length
  }

  await logAuditEvent({
    actorId: user.id,
    action: "USER_PASSWORD_RESET",
    targetId: user.id,
    metadata: { via: "settings_self_service", sessions_revoked: revoked },
  })

  return successResponse({ ok: true, sessionsRevoked: revoked })
}
