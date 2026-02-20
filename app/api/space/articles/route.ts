import { NextRequest } from 'next/server'
import { db, PROFILE_COLS, nestProfile } from '@/lib/db'
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
import { sql } from 'drizzle-orm'
import { hibrArticles, profiles } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20') || 20), 50)
  const tag = searchParams.get('tag')
  const authorId = searchParams.get('author')
  const offset = (page - 1) * limit

  try {
    const result = await db!.execute(sql`SELECT a.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
       FROM hibr_articles a LEFT JOIN profiles p ON a.user_id = p.id
       WHERE a.status = 'published' AND a.moderation_status IN ('approved', 'pending') AND a.deleted_at IS NULL
       ${tag ? sql`AND a.tags @> ARRAY[${tag}]::text[]` : sql``}
       ${authorId ? sql`AND a.user_id = ${authorId}` : sql``}
       ORDER BY a.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`)

    const rows = result.rows as Record<string, unknown>[]
    const total = rows.length > 0 ? Number(rows[0]._total) : 0
    const articles = rows.map((row) => {
      const { _total, ...rest } = row
      return nestProfile(rest)
    })

    return successResponse({ articles, total, page, limit })
  } catch {
    return errorResponse('حدث خطأ في جلب المقالات', 500)
  }
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
  const rateLimit = await checkRateLimit(user.id, 'create_article')
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

  // Moderate (async — includes AI check)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = await moderateArticle(cleanTitle, cleanContent, approvedCount)

  // If AI flagged as harmful → block and ask user to edit
  if (modResult.aiVerdict === 'harmful') {
    return errorResponse(
      'لا يمكن نشر هذا المحتوى لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
      422
    )
  }

  // Calculate read time
  const wordCount = cleanContent.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

  // Insert
  try {
    const rows = await db!.insert(hibrArticles).values({
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
      moderation_reason: modResult.reasons.length > 0 ? modResult.reasons.join('، ') : null,
    }).returning()

    // Update user's articles count (non-critical)
    try {
      const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM ${hibrArticles} WHERE user_id = ${user.id} AND status = 'published' AND deleted_at IS NULL`)
      const countRows = countResult.rows as Record<string, unknown>[]
      await db!.execute(sql`UPDATE ${profiles} SET articles_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${user.id}`)
    } catch {
      // Non-critical
    }

    return successResponse({ article: rows[0], moderation: modResult }, 201)
  } catch {
    return errorResponse('حدث خطأ في نشر المقال', 500)
  }
}
