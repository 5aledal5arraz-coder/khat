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
import { validateArticle } from '@/lib/validation'
import { sanitizeTitle, sanitizeArticleContent, generateExcerpt } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateArticle } from '@/lib/moderation'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const tag = searchParams.get('tag')
  const authorId = searchParams.get('author')
  const offset = (page - 1) * limit

  let query = supabase
    .from('hibr_articles')
    .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url, bio, is_admin, articles_count, followers_count)', { count: 'exact' })
    .eq('status', 'published')
    .in('moderation_status', ['approved', 'pending'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tag) {
    query = query.contains('tags', [tag])
  }

  if (authorId) {
    query = query.eq('user_id', authorId)
  }

  const { data, count, error } = await query

  if (error) {
    return errorResponse('حدث خطأ في جلب المقالات', 500)
  }

  return successResponse({
    articles: data || [],
    total: count || 0,
    page,
    limit,
  })
}

export async function POST(request: NextRequest) {
  // CSRF check
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  // Auth check
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  // Ban check
  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  // Rate limit
  const supabase = await createClient()
  const rateLimit = await checkRateLimit(supabase, user.id, 'create_article')
  if (!rateLimit.allowed) return rateLimitResponse()

  // Parse body
  let body: { title: string; content: string; excerpt?: string; tags?: string[]; episode_id?: string; episode_title?: string; episode_slug?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  // Validate
  const validation = validateArticle({
    title: body.title,
    content: body.content,
    excerpt: body.excerpt,
    tags: body.tags,
  })
  if (!validation.valid) return validationErrorResponse(validation.error!)

  // Sanitize
  const cleanTitle = sanitizeTitle(body.title)
  const cleanContent = sanitizeArticleContent(body.content)
  const cleanExcerpt = body.excerpt ? sanitizeTitle(body.excerpt) : generateExcerpt(cleanContent)

  // Moderate
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = moderateArticle(cleanTitle, cleanContent, approvedCount)

  // Calculate read time
  const wordCount = cleanContent.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

  // Insert
  const { data, error } = await supabase
    .from('hibr_articles')
    .insert({
      user_id: user.id,
      title: cleanTitle,
      content: cleanContent,
      excerpt: cleanExcerpt,
      tags: body.tags?.slice(0, 5) || [],
      episode_id: body.episode_id || null,
      episode_title: body.episode_title || null,
      episode_slug: body.episode_slug || null,
      read_time_minutes: readTimeMinutes,
      status: 'published',
      moderation_status: modResult.status,
    })
    .select()
    .single()

  if (error) {
    return errorResponse('حدث خطأ في نشر المقال', 500)
  }

  // Update user's articles count (non-critical)
  try {
    const { count: articleCount } = await supabase
      .from('hibr_articles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'published')
      .is('deleted_at', null)

    await supabase
      .from('profiles')
      .update({ articles_count: articleCount ?? 0 })
      .eq('id', user.id)
  } catch {
    // Non-critical
  }

  return successResponse({ article: data, moderation: modResult }, 201)
}
