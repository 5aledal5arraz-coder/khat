import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { validateArticleTitle, validateArticleContent, validateTags } from '@/lib/validation'
import { sanitizeTitle, sanitizeArticleContent, generateExcerpt } from '@/lib/sanitize'
import { moderateArticle } from '@/lib/moderation'
import { getUserApprovedCount } from '@/lib/api-utils'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, is_admin, articles_count, followers_count)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return notFoundResponse()

  // Also fetch comments
  const { data: comments } = await supabase
    .from('hibr_comments')
    .select('*, profiles!hibr_comments_user_id_fkey(id, display_name, avatar_url)')
    .eq('article_id', id)
    .is('deleted_at', null)
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: true })

  return successResponse({ article: data, comments: comments || [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const supabase = await createClient()

  // Fetch existing article
  const { data: existing } = await supabase
    .from('hibr_articles')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!existing) return notFoundResponse()

  // Only owner or admin can edit
  const profile = await getUserProfile(user.id)
  if (existing.user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  let body: { title?: string; content?: string; excerpt?: string; tags?: string[] }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  // Validate provided fields
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const v = validateArticleTitle(body.title)
    if (!v.valid) return validationErrorResponse(v.error!)
    updates.title = sanitizeTitle(body.title)
  }

  if (body.content !== undefined) {
    const v = validateArticleContent(body.content)
    if (!v.valid) return validationErrorResponse(v.error!)
    updates.content = sanitizeArticleContent(body.content)
    updates.excerpt = body.excerpt
      ? sanitizeTitle(body.excerpt)
      : generateExcerpt(updates.content as string)
    const wordCount = (updates.content as string).replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length
    updates.read_time_minutes = Math.max(1, Math.ceil(wordCount / 200))
  }

  if (body.tags !== undefined) {
    const v = validateTags(body.tags)
    if (!v.valid) return validationErrorResponse(v.error!)
    updates.tags = body.tags.slice(0, 5)
  }

  // Re-run moderation on content changes
  if (updates.title || updates.content) {
    const title = (updates.title as string) || ''
    const content = (updates.content as string) || ''
    if (title || content) {
      const approvedCount = await getUserApprovedCount(user.id)
      const modResult = await moderateArticle(title || 'untitled', content || '', approvedCount)
      if (modResult.aiVerdict === 'harmful') {
        return errorResponse(
          'لا يمكن نشر هذا المحتوى لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
          422
        )
      }
      if (modResult.status !== 'approved') {
        updates.moderation_status = modResult.status
      }
    }
  }

  const { data, error } = await supabase
    .from('hibr_articles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('حدث خطأ في تحديث المقال', 500)

  return successResponse({ article: data })
}

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
    .from('hibr_articles')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!existing) return notFoundResponse()

  const profile = await getUserProfile(user.id)
  if (existing.user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  // Soft delete
  const { error } = await supabase
    .from('hibr_articles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return errorResponse('حدث خطأ في حذف المقال', 500)

  return successResponse({ deleted: true })
}
