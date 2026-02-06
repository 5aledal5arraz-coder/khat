import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sanitizeTitle, sanitizeArticleContent } from '@/lib/sanitize'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hibr_drafts')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) return errorResponse('حدث خطأ في جلب المسودات', 500)

  return successResponse({ drafts: data || [] })
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: {
    id?: string
    title?: string
    content?: string
    tags?: string[]
    episode_id?: string
    episode_slug?: string
    episode_title?: string
  }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const supabase = await createClient()

  const draftData = {
    user_id: user.id,
    title: body.title ? sanitizeTitle(body.title) : '',
    content: body.content ? sanitizeArticleContent(body.content) : '',
    tags: body.tags?.slice(0, 5) || [],
    episode_id: body.episode_id || null,
    episode_slug: body.episode_slug || null,
    episode_title: body.episode_title || null,
  }

  // Upsert: if id provided and exists, update; otherwise create
  if (body.id) {
    const { data: existing } = await supabase
      .from('hibr_drafts')
      .select('id')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      const { data, error } = await supabase
        .from('hibr_drafts')
        .update(draftData)
        .eq('id', body.id)
        .select()
        .single()

      if (error) return errorResponse('حدث خطأ في حفظ المسودة', 500)
      return successResponse({ draft: data })
    }
  }

  // Create new
  const { data, error } = await supabase
    .from('hibr_drafts')
    .insert(draftData)
    .select()
    .single()

  if (error) return errorResponse('حدث خطأ في إنشاء المسودة', 500)

  return successResponse({ draft: data }, 201)
}
