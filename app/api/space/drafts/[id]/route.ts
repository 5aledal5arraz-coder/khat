import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sanitizeTitle, sanitizeArticleContent } from '@/lib/sanitize'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hibr_drafts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return notFoundResponse()

  return successResponse({ draft: data })
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

  const { data: existing } = await supabase
    .from('hibr_drafts')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return notFoundResponse()

  let body: { title?: string; content?: string; tags?: string[]; episode_id?: string; episode_slug?: string; episode_title?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = sanitizeTitle(body.title)
  if (body.content !== undefined) updates.content = sanitizeArticleContent(body.content)
  if (body.tags !== undefined) updates.tags = body.tags.slice(0, 5)
  if (body.episode_id !== undefined) updates.episode_id = body.episode_id
  if (body.episode_slug !== undefined) updates.episode_slug = body.episode_slug
  if (body.episode_title !== undefined) updates.episode_title = body.episode_title

  const { data, error } = await supabase
    .from('hibr_drafts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('حدث خطأ في حفظ المسودة', 500)

  return successResponse({ draft: data })
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

  const { error } = await supabase
    .from('hibr_drafts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return errorResponse('حدث خطأ في حذف المسودة', 500)

  return successResponse({ deleted: true })
}
