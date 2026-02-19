import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  getUserProfile,
  getUserApprovedCount,
  validateMutation,
  unauthorizedResponse,
  bannedResponse,
  rateLimitResponse,
  validationErrorResponse,
  notFoundResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { validateCommentContent } from '@/lib/validation'
import { sanitizeComment } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent } from '@/lib/moderation'
import { fireCommentNotification } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  const supabase = await createClient()
  const rateLimit = await checkRateLimit(supabase, user.id, 'create_comment')
  if (!rateLimit.allowed) return rateLimitResponse()

  let body: { article_id: string; content: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.article_id) return validationErrorResponse('معرف المقال مطلوب')

  // Check article exists
  const { data: article } = await supabase
    .from('hibr_articles')
    .select('id')
    .eq('id', body.article_id)
    .is('deleted_at', null)
    .single()

  if (!article) return notFoundResponse()

  const validation = validateCommentContent(body.content)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const cleanContent = sanitizeComment(body.content)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = await moderateContent(cleanContent, approvedCount)

  // If AI flagged as harmful → block and ask user to edit
  if (modResult.aiVerdict === 'harmful') {
    return errorResponse(
      'لا يمكن نشر هذا التعليق لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
      422
    )
  }

  const { data, error } = await supabase
    .from('hibr_comments')
    .insert({
      article_id: body.article_id,
      user_id: user.id,
      content: cleanContent,
      moderation_status: modResult.status,
      moderation_reason: modResult.reasons.length > 0 ? modResult.reasons.join('، ') : null,
    })
    .select('*, profiles!hibr_comments_user_id_fkey(id, display_name, avatar_url)')
    .single()

  if (error) return errorResponse('حدث خطأ في إضافة التعليق', 500)

  // Update comments count (only count approved + pending)
  const { count } = await supabase
    .from('hibr_comments')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', body.article_id)
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)

  await supabase
    .from('hibr_articles')
    .update({ comments_count: count ?? 0 })
    .eq('id', body.article_id)

  // Fire email notification to article owner (non-blocking)
  fireCommentNotification(body.article_id, user.id, cleanContent)

  return successResponse({ comment: data, moderation: modResult }, 201)
}
