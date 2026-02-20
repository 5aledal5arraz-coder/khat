import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getAdminAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sql } from 'drizzle-orm'

const VALID_ACTIONS = ['approve', 'reject', 'hide', 'unhide', 'edit', 'delete'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAdminAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (!profile?.is_admin) return forbiddenResponse()

  let body: { action: string; target_type: string; reason?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!VALID_ACTIONS.includes(body.action as typeof VALID_ACTIONS[number])) {
    return validationErrorResponse('إجراء غير صالح')
  }

  if (!['article', 'thought', 'comment', 'reply', 'report'].includes(body.target_type)) {
    return validationErrorResponse('نوع المحتوى غير صالح')
  }

  // Map action to moderation_status
  const statusMap: Record<string, string> = {
    approve: 'approved',
    reject: 'rejected',
    hide: 'hidden',
    unhide: 'approved',
  }

  // Handle reports separately
  if (body.target_type === 'report') {
    const reportResult = await db!.execute(sql`UPDATE hibr_reports SET status = ${body.action === 'approve' ? 'resolved' : 'dismissed'}, reviewed_by = ${user.id}, reviewed_at = NOW() WHERE id = ${id}`)
    if (!reportResult.rowCount) return errorResponse('حدث خطأ', 500)
  } else {
    const tableMap: Record<string, string> = {
      article: 'hibr_articles',
      thought: 'hibr_thoughts',
      comment: 'hibr_comments',
      reply: 'hibr_replies',
    }

    const table = tableMap[body.target_type]
    if (!table) return notFoundResponse()

    if (body.action === 'delete') {
      // Soft delete
      const deleteResult = await db!.execute(sql`UPDATE ${sql.raw(table)} SET deleted_at = NOW() WHERE id = ${id}`)
      if (!deleteResult.rowCount) return errorResponse('حدث خطأ في حذف المحتوى', 500)
    } else if (body.action === 'edit') {
      // Edit content
      if (!body.content || body.content.trim().length === 0) {
        return validationErrorResponse('المحتوى مطلوب')
      }

      const editResult = await db!.execute(sql`UPDATE ${sql.raw(table)} SET content = ${body.content.trim()}, moderation_status = 'approved' WHERE id = ${id}`)
      if (!editResult.rowCount) return errorResponse('حدث خطأ في تعديل المحتوى', 500)
    } else {
      // Update moderation status
      const newStatus = statusMap[body.action]
      const statusResult = await db!.execute(sql`UPDATE ${sql.raw(table)} SET moderation_status = ${newStatus} WHERE id = ${id}`)
      if (!statusResult.rowCount) return errorResponse('حدث خطأ في تحديث حالة المحتوى', 500)
    }
  }

  // Log the moderation action (non-critical)
  try {
    await db!.execute(sql`INSERT INTO hibr_moderation_log (moderator_id, action, target_type, target_id, reason) VALUES (${user.id}, ${body.action}, ${body.target_type}, ${id}, ${body.reason || null})`)
  } catch {
    // Non-critical, ignore errors
  }

  return successResponse({ updated: true, action: body.action })
}
