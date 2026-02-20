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
  notFoundResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { validateCommentContent } from '@/lib/validation'
import { sanitizeComment } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent } from '@/lib/moderation'
import { fireCommentNotification } from '@/lib/email/notifications'
import { sql } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  const rateLimit = await checkRateLimit(user.id, 'create_comment')
  if (!rateLimit.allowed) return rateLimitResponse()

  let body: { article_id: string; content: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.article_id) return validationErrorResponse('معرف المقال مطلوب')

  // Check article exists
  const articleResult = await db!.execute(sql`SELECT id FROM hibr_articles WHERE id = ${body.article_id} AND deleted_at IS NULL LIMIT 1`)
  const articles = articleResult.rows as Record<string, unknown>[]
  if (articles.length === 0) return notFoundResponse()

  const validation = validateCommentContent(body.content)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const cleanContent = sanitizeComment(body.content)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = await moderateContent(cleanContent, approvedCount)

  // If AI flagged as harmful → block and ask user to edit
  if (modResult.aiVerdict === 'harmful') {
    return errorResponse(
      'لا يمكن نشر هذا التعليق لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
      422
    )
  }

  try {
    const result = await db!.execute(sql`WITH ins AS (
         INSERT INTO hibr_comments (article_id, user_id, content, moderation_status, moderation_reason)
         VALUES (${body.article_id}, ${user.id}, ${cleanContent}, ${modResult.status}, ${modResult.reasons.length > 0 ? modResult.reasons.join('، ') : null})
         RETURNING *
       )
       SELECT ins.*, ${sql.raw(PROFILE_COLS)}
       FROM ins LEFT JOIN profiles p ON ins.user_id = p.id`)

    const rows = result.rows as Record<string, unknown>[]

    // Update comments count (only count approved + pending)
    const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM hibr_comments WHERE article_id = ${body.article_id} AND moderation_status IN ('approved', 'pending') AND deleted_at IS NULL`)
    const countRows = countResult.rows as Record<string, unknown>[]
    await db!.execute(sql`UPDATE hibr_articles SET comments_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${body.article_id}`)

    // Fire email notification to article owner (non-blocking)
    fireCommentNotification(body.article_id, user.id, cleanContent)

    return successResponse({ comment: nestProfile(rows[0]), moderation: modResult }, 201)
  } catch {
    return errorResponse('حدث خطأ في إضافة التعليق', 500)
  }
}
