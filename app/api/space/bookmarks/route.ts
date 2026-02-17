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

  let body: { article_id: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.article_id) return validationErrorResponse('معرف المقال مطلوب')

  const supabase = await createClient()

  // Verify article exists
  const { data: target } = await supabase
    .from('hibr_articles')
    .select('id')
    .eq('id', body.article_id)
    .single()
  if (!target) return validationErrorResponse('المقال غير موجود')

  // Check if already bookmarked
  const { data: existing } = await supabase
    .from('hibr_bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('article_id', body.article_id)
    .single()

  if (existing) {
    await supabase.from('hibr_bookmarks').delete().eq('id', existing.id)
    return successResponse({ bookmarked: false })
  }

  const { error } = await supabase
    .from('hibr_bookmarks')
    .insert({ user_id: user.id, article_id: body.article_id })

  if (error) return errorResponse('حدث خطأ في حفظ المقال', 500)

  return successResponse({ bookmarked: true })
}
