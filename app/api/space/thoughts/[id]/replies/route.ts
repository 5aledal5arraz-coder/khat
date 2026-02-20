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
import { validateReplyContent } from '@/lib/validation'
import { sanitizeComment } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent } from '@/lib/moderation'
import { fireReplyNotification } from '@/lib/email/notifications'
import { sql } from 'drizzle-orm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const result = await db!.execute(sql`SELECT r.*, ${sql.raw(PROFILE_COLS)}
       FROM hibr_replies r LEFT JOIN profiles p ON r.user_id = p.id
       WHERE r.thought_id = ${id} AND r.deleted_at IS NULL AND r.moderation_status IN ('approved', 'pending')
       ORDER BY r.created_at ASC`)

    const rows = result.rows as Record<string, unknown>[]

    return successResponse({ replies: rows.map(nestProfile) })
  } catch {
    return errorResponse('حدث خطأ في جلب الردود', 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: thoughtId } = await params

  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  // Check thought exists
  const thoughtResult = await db!.execute(sql`SELECT id FROM hibr_thoughts WHERE id = ${thoughtId} AND deleted_at IS NULL LIMIT 1`)
  const thoughts = thoughtResult.rows as Record<string, unknown>[]
  if (thoughts.length === 0) return notFoundResponse()

  const rateLimit = await checkRateLimit(user.id, 'create_comment')
  if (!rateLimit.allowed) return rateLimitResponse()

  let body: { content: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const validation = validateReplyContent(body.content)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const cleanContent = sanitizeComment(body.content)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = await moderateContent(cleanContent, approvedCount)

  // If AI flagged as harmful → block and ask user to edit
  if (modResult.aiVerdict === 'harmful') {
    return errorResponse(
      'لا يمكن نشر هذا الرد لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
      422
    )
  }

  try {
    const result = await db!.execute(sql`WITH ins AS (
         INSERT INTO hibr_replies (thought_id, user_id, content, moderation_status, moderation_reason)
         VALUES (${thoughtId}, ${user.id}, ${cleanContent}, ${modResult.status}, ${modResult.reasons.length > 0 ? modResult.reasons.join('، ') : null})
         RETURNING *
       )
       SELECT ins.*, ${sql.raw(PROFILE_COLS)}
       FROM ins LEFT JOIN profiles p ON ins.user_id = p.id`)

    const rows = result.rows as Record<string, unknown>[]

    // Update replies count (only count approved + pending)
    const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM hibr_replies WHERE thought_id = ${thoughtId} AND moderation_status IN ('approved', 'pending') AND deleted_at IS NULL`)
    const countRows = countResult.rows as Record<string, unknown>[]
    await db!.execute(sql`UPDATE hibr_thoughts SET replies_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${thoughtId}`)

    // Fire email notification to thought owner (non-blocking)
    fireReplyNotification(thoughtId, user.id, cleanContent)

    return successResponse({ reply: nestProfile(rows[0]), moderation: modResult }, 201)
  } catch {
    return errorResponse('حدث خطأ في إضافة الرد', 500)
  }
}
