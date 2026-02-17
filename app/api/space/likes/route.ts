import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  rateLimitResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { checkRateLimit } from '@/lib/rate-limit'

const VALID_TYPES = ['article', 'thought', 'comment', 'reply'] as const
const TYPE_TABLE_MAP: Record<string, string> = {
  article: 'hibr_articles',
  thought: 'hibr_thoughts',
  comment: 'hibr_comments',
  reply: 'hibr_replies',
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { target_type: string; target_id: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!VALID_TYPES.includes(body.target_type as typeof VALID_TYPES[number])) {
    return validationErrorResponse('نوع المحتوى غير صالح')
  }

  if (!body.target_id) {
    return validationErrorResponse('معرف المحتوى مطلوب')
  }

  const supabase = await createClient()
  const rateLimit = await checkRateLimit(supabase, user.id, 'toggle_like')
  if (!rateLimit.allowed) return rateLimitResponse()

  // Verify target exists
  const tableName = TYPE_TABLE_MAP[body.target_type]
  if (tableName) {
    const { data: target } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', body.target_id)
      .single()
    if (!target) return validationErrorResponse('المحتوى غير موجود')
  }

  // Check if already liked
  const { data: existing } = await supabase
    .from('hibr_likes')
    .select('id')
    .eq('user_id', user.id)
    .eq('target_type', body.target_type)
    .eq('target_id', body.target_id)
    .single()

  let liked: boolean

  if (existing) {
    // Unlike
    await supabase
      .from('hibr_likes')
      .delete()
      .eq('id', existing.id)
    liked = false
  } else {
    // Like
    const { error } = await supabase
      .from('hibr_likes')
      .insert({
        user_id: user.id,
        target_type: body.target_type,
        target_id: body.target_id,
      })
    if (error) return errorResponse('حدث خطأ', 500)
    liked = true
  }

  // Update likes count on target
  if (tableName) {
    const { count } = await supabase
      .from('hibr_likes')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', body.target_type)
      .eq('target_id', body.target_id)

    await supabase
      .from(tableName)
      .update({ likes_count: count ?? 0 })
      .eq('id', body.target_id)
  }

  return successResponse({ liked, target_type: body.target_type, target_id: body.target_id })
}
