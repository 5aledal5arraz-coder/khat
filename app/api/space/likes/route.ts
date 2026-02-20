import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  rateLimitResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { fireLikeNotification } from '@/lib/email/notifications'
import { sql } from 'drizzle-orm'
import { hibrLikes } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const VALID_TYPES = ['article', 'thought', 'comment', 'reply'] as const
const TYPE_TABLE_MAP: Record<string, string> = {
  article: 'hibr_articles',
  thought: 'hibr_thoughts',
  comment: 'hibr_comments',
  reply: 'hibr_replies',
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { target_type: string; target_id: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!VALID_TYPES.includes(body.target_type as typeof VALID_TYPES[number])) {
    return validationErrorResponse('نوع المحتوى غير صالح')
  }

  if (!body.target_id) {
    return validationErrorResponse('معرف المحتوى مطلوب')
  }

  const rateLimit = await checkRateLimit(user.id, 'toggle_like')
  if (!rateLimit.allowed) return rateLimitResponse()

  // Verify target exists
  const tableName = TYPE_TABLE_MAP[body.target_type]
  if (tableName) {
    const targetResult = await db!.execute(sql`SELECT id FROM ${sql.raw(tableName)} WHERE id = ${body.target_id} LIMIT 1`)
    const targets = targetResult.rows as Record<string, unknown>[]
    if (targets.length === 0) return validationErrorResponse('المحتوى غير موجود')
  }

  // Check if already liked
  const existingResult = await db!.execute(sql`SELECT id FROM hibr_likes WHERE user_id = ${user.id} AND target_type = ${body.target_type} AND target_id = ${body.target_id} LIMIT 1`)
  const existing = existingResult.rows as Record<string, unknown>[]

  let liked: boolean

  if (existing.length > 0) {
    // Unlike
    await db!.delete(hibrLikes).where(eq(hibrLikes.id, existing[0].id as string))
    liked = false
  } else {
    // Like
    const insertResult = await db!.execute(sql`INSERT INTO hibr_likes (user_id, target_type, target_id) VALUES (${user.id}, ${body.target_type}, ${body.target_id})`)
    if (!insertResult.rowCount) return errorResponse('حدث خطأ', 500)
    liked = true

    // Fire email notification to content owner (non-blocking, only on new like)
    fireLikeNotification(body.target_type, body.target_id, user.id)
  }

  // Update likes count on target
  if (tableName) {
    const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM hibr_likes WHERE target_type = ${body.target_type} AND target_id = ${body.target_id}`)
    const countRows = countResult.rows as Record<string, unknown>[]

    await db!.execute(sql`UPDATE ${sql.raw(tableName)} SET likes_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${body.target_id}`)
  }

  return successResponse({ liked, target_type: body.target_type, target_id: body.target_id })
}
