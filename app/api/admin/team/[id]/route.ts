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

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * PATCH /api/admin/team/[id] — Update admin user (OWNER only)
 * Supports: role change, enable/disable, password reset
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

  // Protect OWNER
  if (target.role === 'OWNER') {
    return errorResponse('لا يمكن تعديل حساب المالك', 403)
  }

  let body: { role?: string; is_active?: boolean; new_password?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const ip = getIp(request)

  // Role change
  if (body.role !== undefined) {
    const validRoles: AdminRole[] = ['ADMIN', 'EDITOR', 'VIEWER']
    if (!validRoles.includes(body.role as AdminRole)) {
      return validationErrorResponse('صلاحية غير صالحة')
    }

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

  // Password reset
  if (body.new_password) {
    const pwVal = validateAdminPassword(body.new_password)
    if (!pwVal.valid) return validationErrorResponse(pwVal.error!)

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
