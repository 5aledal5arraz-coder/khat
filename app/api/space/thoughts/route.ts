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
import { validateThoughtContent } from '@/lib/validation'
import { sanitizeThought } from '@/lib/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'
import { moderateContent } from '@/lib/moderation'
import { sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20') || 20), 50)
  const tag = searchParams.get('tag')
  const offset = (page - 1) * limit

  try {
    const result = await db!.execute(sql`SELECT t.*, ${sql.raw(PROFILE_COLS)}, COUNT(*) OVER() AS _total
       FROM hibr_thoughts t LEFT JOIN profiles p ON t.user_id = p.id
       WHERE t.moderation_status IN ('approved', 'pending') AND t.deleted_at IS NULL
       ${tag ? sql`AND t.tags @> ARRAY[${tag}]::text[]` : sql``}
       ORDER BY t.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`)

    const rows = result.rows as Record<string, unknown>[]
    const total = rows.length > 0 ? Number(rows[0]._total) : 0
    const thoughts = rows.map((row) => {
      const { _total, ...rest } = row
      return nestProfile(rest)
    })

    return successResponse({ thoughts, total, page, limit })
  } catch {
    return errorResponse('حدث خطأ في جلب الخواطر', 500)
  }
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (profile?.is_banned) return bannedResponse()

  const rateLimit = await checkRateLimit(user.id, 'create_thought')
  if (!rateLimit.allowed) return rateLimitResponse()

  let body: { content: string; tags?: string[] }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const validation = validateThoughtContent(body.content)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const cleanContent = sanitizeThought(body.content)
  const approvedCount = await getUserApprovedCount(user.id)
  const modResult = await moderateContent(cleanContent, approvedCount)

  // If AI flagged as harmful → block and ask user to edit
  if (modResult.aiVerdict === 'harmful') {
    return errorResponse(
      'لا يمكن نشر هذا المحتوى لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
      422
    )
  }

  try {
    const result = await db!.execute(sql`WITH ins AS (
         INSERT INTO hibr_thoughts (user_id, content, tags, moderation_status, moderation_reason)
         VALUES (${user.id}, ${cleanContent}, ${body.tags?.slice(0, 5) || []}, ${modResult.status}, ${modResult.reasons.length > 0 ? modResult.reasons.join('، ') : null})
         RETURNING *
       )
       SELECT ins.*, ${sql.raw(PROFILE_COLS)}
       FROM ins LEFT JOIN profiles p ON ins.user_id = p.id`)

    const rows = result.rows as Record<string, unknown>[]

    return successResponse({ thought: nestProfile(rows[0]), moderation: modResult }, 201)
  } catch {
    return errorResponse('حدث خطأ في نشر الخاطرة', 500)
  }
}
