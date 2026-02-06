import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'

const VALID_ACTIONS = ['approve', 'reject', 'hide', 'unhide'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (!profile?.is_admin) return forbiddenResponse()

  let body: { action: string; target_type: string; reason?: string }
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

  const supabase = await createClient()

  // Map action to moderation_status
  const statusMap: Record<string, string> = {
    approve: 'approved',
    reject: 'rejected',
    hide: 'hidden',
    unhide: 'approved',
  }

  const newStatus = statusMap[body.action]

  // Handle reports separately
  if (body.target_type === 'report') {
    const { error } = await supabase
      .from('hibr_reports')
      .update({
        status: body.action === 'approve' ? 'resolved' : 'dismissed',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return errorResponse('حدث خطأ', 500)
  } else {
    // Update content moderation status
    const tableMap: Record<string, string> = {
      article: 'hibr_articles',
      thought: 'hibr_thoughts',
      comment: 'hibr_comments',
      reply: 'hibr_replies',
    }

    const table = tableMap[body.target_type]
    if (!table) return notFoundResponse()

    const { error } = await supabase
      .from(table)
      .update({ moderation_status: newStatus })
      .eq('id', id)

    if (error) return errorResponse('حدث خطأ في تحديث حالة المحتوى', 500)
  }

  // Log the moderation action (non-critical)
  try {
    await supabase
      .from('hibr_moderation_log')
      .insert({
        moderator_id: user.id,
        action: body.action,
        target_type: body.target_type,
        target_id: id,
        reason: body.reason || null,
      })
  } catch {
    // Non-critical, ignore errors
  }

  return successResponse({ updated: true, action: body.action })
}
