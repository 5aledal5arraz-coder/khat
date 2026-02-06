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
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { validateThoughtContent } from '@/lib/validation'
import { sanitizeThought } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent } from '@/lib/moderation'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const tag = searchParams.get('tag')
  const offset = (page - 1) * limit

  let query = supabase
    .from('hibr_thoughts')
    .select('*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url, bio, articles_count, followers_count)', { count: 'exact' })
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data, count, error } = await query

  if (error) {
    return errorResponse('حدث خطأ في جلب الخواطر', 500)
  }

  return successResponse({
    thoughts: data || [],
    total: count || 0,
    page,
    limit,
  })
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  const supabase = await createClient()
  const rateLimit = await checkRateLimit(supabase, user.id, 'create_thought')
  if (!rateLimit.allowed) return rateLimitResponse()

  let body: { content: string; tags?: string[] }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const validation = validateThoughtContent(body.content)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const cleanContent = sanitizeThought(body.content)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = moderateContent(cleanContent, approvedCount)

  const { data, error } = await supabase
    .from('hibr_thoughts')
    .insert({
      user_id: user.id,
      content: cleanContent,
      tags: body.tags?.slice(0, 5) || [],
      moderation_status: modResult.status,
    })
    .select('*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url, bio)')
    .single()

  if (error) {
    return errorResponse('حدث خطأ في نشر الخاطرة', 500)
  }

  return successResponse({ thought: data, moderation: modResult }, 201)
}
