import { NextRequest } from 'next/server'
import { requireRole, successResponse, errorResponse } from '@/lib/api-utils'
import { deleteAllUserSessions, getAdminUserById, logAuditEvent } from '@/lib/admin/auth'

/**
 * POST /api/admin/team/[id]/force-logout — Force logout a user (OWNER only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole('OWNER')
  if (auth.error) return auth.error

  const { id } = await params
  const target = await getAdminUserById(id)
  if (!target) return errorResponse('المستخدم غير موجود', 404)

  await deleteAllUserSessions(id)

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip') || 'unknown'

  await logAuditEvent({
    actorId: auth.user.id,
    action: 'FORCE_LOGOUT',
    targetId: id,
    ip,
    metadata: { email: target.email },
  })

  return successResponse({ success: true })
}
