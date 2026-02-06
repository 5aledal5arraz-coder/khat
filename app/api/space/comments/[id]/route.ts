import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('hibr_comments')
    .select('user_id, article_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!existing) return notFoundResponse()

  const profile = await getUserProfile(user.id)
  if (existing.user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  const { error } = await supabase
    .from('hibr_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return errorResponse('حدث خطأ في حذف التعليق', 500)

  // Update comments count
  const { count } = await supabase
    .from('hibr_comments')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', existing.article_id)
    .is('deleted_at', null)

  await supabase
    .from('hibr_articles')
    .update({ comments_count: count ?? 0 })
    .eq('id', existing.article_id)

  return successResponse({ deleted: true })
}
