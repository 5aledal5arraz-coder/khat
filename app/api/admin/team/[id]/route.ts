import { NextRequest } from 'next/server'
import { requireRole, successResponse, errorResponse, validationErrorResponse } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { adminUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  hashPassword,
  validateAdminPassword,
  deleteAllUserSessions,
  logAuditEvent,
  getAdminUserById,
  type AdminRole,
} from '@/lib/admin/auth'
import { validateDisplayName } from '@/lib/validation/forms'
import { isJobTitle } from '@/lib/admin/team-identity'

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * PATCH /api/admin/team/[id] — Update admin user (OWNER only)
 * Supports: name + صفحة (descriptive), role change, enable/disable,
 * password reset. The OWNER row accepts the descriptive fields only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole('OWNER')
  if (auth.error) return auth.error

  if (!db) return errorResponse('قاعدة البيانات غير متوفرة', 500)

  const { id } = await params
  const target = await getAdminUserById(id)
  if (!target) return errorResponse('المستخدم غير موجود', 404)

  let body: {
    role?: string
    is_active?: boolean
    new_password?: string
    display_name?: string | null
    job_title?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  /**
   * The OWNER row is protected against SECURITY edits, not against being
   * described.
   *
   * This guard used to reject any PATCH on the OWNER, which made the headline
   * case of the صفحة feature impossible: Khaled is the OWNER and he is the
   * مقدم, so he has to be able to set his own name and job_title. Role change,
   * enable/disable and password reset stay blocked for the OWNER exactly as
   * before.
   *
   * Depth of that protection is NOT uniform, so do not read this guard as
   * belt-and-braces across the board: `role` and `is_active` are also enforced
   * in the database (trg_prevent_owner_role_change / trg_prevent_owner_disable
   * in scripts/post-schema.sql), but there is NO trigger on `password_hash` —
   * grep it, the count is zero. Blocking the OWNER's password reset is an
   * application-layer check only, and this line is the whole of it.
   *
   * display_name and job_title grant nothing — job_title only selects a
   * recording-room screen and a label — so allowing them here does not widen
   * anyone's permissions.
   */
  const touchesPermissions =
    body.role !== undefined || body.is_active !== undefined || body.new_password !== undefined
  if (target.role === 'OWNER' && touchesPermissions) {
    return errorResponse('لا يمكن تعديل حساب المالك', 403)
  }

  const ip = getIp(request)

  /**
   * ── VALIDATE EVERYTHING, THEN WRITE ────────────────────────────────
   *
   * All validation happens before the first UPDATE, because this handler
   * applies several independent fields in one request. When the identity write
   * ran before the role/password checks, a mixed payload against a NON-OWNER
   * target — `{ display_name: "X", role: "BOGUS" }` — persisted the name, then
   * returned a validation error for the role: a partially-applied PATCH whose
   * error response told the caller nothing had happened.
   *
   * (A mixed payload against the OWNER was already safe, because the guard
   * above returns 403 before any write. That is why it did not show up when the
   * OWNER row was used to test this — the reachable case needs a normal target.)
   */
  let identityPatch: { display_name?: string | null; job_title?: string | null } | null = null

  if (body.display_name !== undefined || body.job_title !== undefined) {
    identityPatch = {}

    if (body.display_name !== undefined) {
      // Type first: `validateDisplayName` calls `.trim()`, so a non-string
      // (`{"display_name": 123}`) threw a TypeError and surfaced as a 500
      // instead of a 400.
      if (body.display_name !== null && typeof body.display_name !== 'string') {
        return validationErrorResponse('الاسم يجب أن يكون نصاً')
      }
      const nameVal = validateDisplayName(body.display_name ?? '')
      if (!nameVal.valid) return validationErrorResponse(nameVal.error!)
      identityPatch.display_name = body.display_name?.trim() || null
    }

    if (body.job_title !== undefined) {
      // An explicit null/"" clears the صفحة — the member then falls back to
      // having his room screen derived from his permission role. `isJobTitle`
      // type-guards, so a non-string is rejected here rather than thrown.
      if (body.job_title !== null && body.job_title !== '' && !isJobTitle(body.job_title)) {
        return validationErrorResponse('الصفحة غير صالحة')
      }
      identityPatch.job_title = isJobTitle(body.job_title) ? body.job_title : null
    }
  }

  if (body.role !== undefined) {
    const validRoles: AdminRole[] = ['ADMIN', 'EDITOR', 'VIEWER']
    if (!validRoles.includes(body.role as AdminRole)) {
      return validationErrorResponse('صلاحية غير صالحة')
    }
  }

  if (body.new_password !== undefined) {
    if (typeof body.new_password !== 'string') {
      return validationErrorResponse('كلمة المرور يجب أن تكون نصاً')
    }
    const pwVal = validateAdminPassword(body.new_password)
    if (!pwVal.valid) return validationErrorResponse(pwVal.error!)
  }

  // ── Writes ─────────────────────────────────────────────────────────

  // Identity (name + صفحة). Descriptive only — see the OWNER guard above.
  if (identityPatch) {
    await db.update(adminUsers).set(identityPatch).where(eq(adminUsers.id, id))

    await logAuditEvent({
      actorId: auth.user.id,
      action: 'USER_PROFILE_UPDATED',
      targetId: id,
      ip,
      metadata: {
        old_display_name: target.display_name,
        old_job_title: target.job_title,
        ...identityPatch,
      },
    })
  }

  // Role change
  if (body.role !== undefined) {
    await db
      .update(adminUsers)
      .set({ role: body.role })
      .where(eq(adminUsers.id, id))

    await logAuditEvent({
      actorId: auth.user.id,
      action: 'USER_ROLE_CHANGED',
      targetId: id,
      ip,
      metadata: { old_role: target.role, new_role: body.role },
    })
  }

  // Enable/Disable
  if (body.is_active !== undefined) {
    await db
      .update(adminUsers)
      .set({ is_active: body.is_active })
      .where(eq(adminUsers.id, id))

    if (!body.is_active) {
      await deleteAllUserSessions(id)
    }

    await logAuditEvent({
      actorId: auth.user.id,
      action: body.is_active ? 'USER_ENABLED' : 'USER_DISABLED',
      targetId: id,
      ip,
    })
  }

  // Password reset (already validated above)
  if (body.new_password) {
    const passwordHash = await hashPassword(body.new_password)
    await db
      .update(adminUsers)
      .set({ password_hash: passwordHash })
      .where(eq(adminUsers.id, id))

    // Invalidate all sessions on password reset
    await deleteAllUserSessions(id)

    await logAuditEvent({
      actorId: auth.user.id,
      action: 'USER_PASSWORD_RESET',
      targetId: id,
      ip,
    })
  }

  // Return updated user
  const updated = await getAdminUserById(id)
  return successResponse({
    user: updated
      ? {
          id: updated.id,
          email: updated.email,
          display_name: updated.display_name,
          job_title: updated.job_title,
          role: updated.role,
          is_active: updated.is_active,
          last_login_at: updated.last_login_at,
          created_at: updated.created_at,
        }
      : null,
  })
}

/**
 * DELETE /api/admin/team/[id] — Delete admin user (OWNER only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole('OWNER')
  if (auth.error) return auth.error

  if (!db) return errorResponse('قاعدة البيانات غير متوفرة', 500)

  const { id } = await params
  const target = await getAdminUserById(id)
  if (!target) return errorResponse('المستخدم غير موجود', 404)

  if (target.role === 'OWNER') {
    return errorResponse('لا يمكن حذف حساب المالك', 403)
  }

  // Delete sessions first, then user
  await deleteAllUserSessions(id)
  await db.delete(adminUsers).where(eq(adminUsers.id, id))

  const ip = getIp(request)
  await logAuditEvent({
    actorId: auth.user.id,
    action: 'USER_DELETED',
    targetId: id,
    ip,
    metadata: { email: target.email, role: target.role },
  })

  return successResponse({ success: true })
}
