import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { following_id: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.following_id) return validationErrorResponse('معرف المستخدم مطلوب')
  if (body.following_id === user.id) return validationErrorResponse('لا يمكنك متابعة نفسك')

  const supabase = await createClient()

  // Check if already following
  const { data: existing } = await supabase
    .from('hibr_follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', body.following_id)
    .single()

  if (existing) {
    await supabase.from('hibr_follows').delete().eq('id', existing.id)

    // Decrement followers count
    const { count } = await supabase
      .from('hibr_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', body.following_id)

    await supabase
      .from('profiles')
      .update({ followers_count: count ?? 0 })
      .eq('id', body.following_id)

    return successResponse({ following: false })
  }

  const { error } = await supabase
    .from('hibr_follows')
    .insert({ follower_id: user.id, following_id: body.following_id })

  if (error) return errorResponse('حدث خطأ في المتابعة', 500)

  // Update followers count
  const { count } = await supabase
    .from('hibr_follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', body.following_id)

  await supabase
    .from('profiles')
    .update({ followers_count: count ?? 0 })
    .eq('id', body.following_id)

  return successResponse({ following: true })
}
