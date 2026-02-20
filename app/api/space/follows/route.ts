import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { fireFollowNotification } from '@/lib/email/notifications'
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { hibrFollows } from '@/lib/db/schema'

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { following_id: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.following_id) return validationErrorResponse('معرف المستخدم مطلوب')
  if (body.following_id === user.id) return validationErrorResponse('لا يمكنك متابعة نفسك')

  // Verify target user exists
  const targetResult = await db!.execute(sql`SELECT id FROM profiles WHERE id = ${body.following_id} LIMIT 1`)
  const targets = targetResult.rows as Record<string, unknown>[]
  if (targets.length === 0) return validationErrorResponse('المستخدم غير موجود')

  // Check if already following
  const existingResult = await db!.execute(sql`SELECT id FROM hibr_follows WHERE follower_id = ${user.id} AND following_id = ${body.following_id} LIMIT 1`)
  const existing = existingResult.rows as Record<string, unknown>[]

  if (existing.length > 0) {
    await db!.delete(hibrFollows).where(eq(hibrFollows.id, existing[0].id as string))

    // Update followers count
    const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM hibr_follows WHERE following_id = ${body.following_id}`)
    const countRows = countResult.rows as Record<string, unknown>[]
    await db!.execute(sql`UPDATE profiles SET followers_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${body.following_id}`)

    return successResponse({ following: false })
  }

  const insertResult = await db!.execute(sql`INSERT INTO hibr_follows (follower_id, following_id) VALUES (${user.id}, ${body.following_id})`)

  if (!insertResult.rowCount) return errorResponse('حدث خطأ في المتابعة', 500)

  // Fire email notification to followed user (non-blocking, only on new follow)
  fireFollowNotification(body.following_id, user.id)

  // Update followers count
  const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM hibr_follows WHERE following_id = ${body.following_id}`)
  const countRows = countResult.rows as Record<string, unknown>[]
  await db!.execute(sql`UPDATE profiles SET followers_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${body.following_id}`)

  return successResponse({ following: true })
}
