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
import { validateReplyContent } from '@/lib/validation'
import { sanitizeComment } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent } from '@/lib/moderation'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hibr_replies')
    .select('*, profiles!hibr_replies_user_id_fkey(id, display_name, avatar_url)')
    .eq('thought_id', id)
    .is('deleted_at', null)
    .in('moderation_status', ['approved', 'pending'])
    .order('created_at', { ascending: true })

  if (error) return errorResponse('حدث خطأ في جلب الردود', 500)

  return successResponse({ replies: data || [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: thoughtId } = await params

  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  const supabase = await createClient()

  // Check thought exists
  const { data: thought } = await supabase
    .from('hibr_thoughts')
    .select('id')
    .eq('id', thoughtId)
    .is('deleted_at', null)
    .single()

  if (!thought) return notFoundResponse()

  const rateLimit = await checkRateLimit(supabase, user.id, 'create_comment')
  if (!rateLimit.allowed) return rateLimitResponse()

  let body: { content: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const validation = validateReplyContent(body.content)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const cleanContent = sanitizeComment(body.content)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = await moderateContent(cleanContent, approvedCount)

  // If AI flagged as harmful → block and ask user to edit
  if (modResult.aiVerdict === 'harmful') {
    return errorResponse(
      'لا يمكن نشر هذا الرد لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
      422
    )
  }

  const { data, error } = await supabase
    .from('hibr_replies')
    .insert({
      thought_id: thoughtId,
      user_id: user.id,
      content: cleanContent,
      moderation_status: modResult.status,
      moderation_reason: modResult.reasons.length > 0 ? modResult.reasons.join('، ') : null,
    })
    .select('*, profiles!hibr_replies_user_id_fkey(id, display_name, avatar_url)')
    .single()

  if (error) return errorResponse('حدث خطأ في إضافة الرد', 500)

  // Update replies count (only count approved + pending)
  const { count: repliesCount } = await supabase
    .from('hibr_replies')
    .select('*', { count: 'exact', head: true })
    .eq('thought_id', thoughtId)
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)

  await supabase
    .from('hibr_thoughts')
    .update({ replies_count: repliesCount ?? 0 })
    .eq('id', thoughtId)

  return successResponse({ reply: data, moderation: modResult }, 201)
}
