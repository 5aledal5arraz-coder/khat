import { NextRequest } from 'next/server'
import { requireRole, errorResponse, successResponse } from '@/lib/api-utils'
import { updateUserRole, updateUserBanStatus, deleteUserAndContent, getMemberById } from '@/lib/admin/queries'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole('admin')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await request.json()

  // Prevent self-demotion
  if (id === auth.user.id && body.role && body.role !== 'admin') {
    return errorResponse('لا يمكنك تغيير صلاحياتك', 400)
  }

  // Update role
  if (body.role) {
    const result = await updateUserRole(id, body.role)
    if (!result.success) return errorResponse(result.error || 'فشل تحديث الصلاحية', 500)
  }

  // Update ban status
  if (typeof body.is_banned === 'boolean') {
    // Prevent self-ban
    if (id === auth.user.id) {
      return errorResponse('لا يمكنك حظر نفسك', 400)
    }
    const result = await updateUserBanStatus(id, body.is_banned, body.ban_reason)
    if (!result.success) return errorResponse(result.error || 'فشل تحديث حالة الحظر', 500)
  }

  const updated = await getMemberById(id)
  return successResponse({ member: updated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole('admin')
  if (auth.error) return auth.error

  const { id } = await params

  // Prevent self-deletion
  if (id === auth.user.id) {
    return errorResponse('لا يمكنك حذف حسابك', 400)
  }

  const result = await deleteUserAndContent(id)
  if (!result.success) return errorResponse(result.error || 'فشل حذف العضو', 500)

  return successResponse({ success: true })
}
