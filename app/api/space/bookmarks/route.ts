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
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { hibrBookmarks } from '@/lib/db/schema'

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { article_id: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.article_id) return validationErrorResponse('معرف المقال مطلوب')

  // Verify article exists
  const targetResult = await db!.execute(sql`SELECT id FROM hibr_articles WHERE id = ${body.article_id} LIMIT 1`)
  const targets = targetResult.rows as Record<string, unknown>[]
  if (targets.length === 0) return validationErrorResponse('المقال غير موجود')

  // Check if already bookmarked
  const existingResult = await db!.execute(sql`SELECT id FROM hibr_bookmarks WHERE user_id = ${user.id} AND article_id = ${body.article_id} LIMIT 1`)
  const existing = existingResult.rows as Record<string, unknown>[]

  if (existing.length > 0) {
    await db!.delete(hibrBookmarks).where(eq(hibrBookmarks.id, existing[0].id as string))
    return successResponse({ bookmarked: false })
  }

  const insertResult = await db!.execute(sql`INSERT INTO hibr_bookmarks (user_id, article_id) VALUES (${user.id}, ${body.article_id})`)

  if (!insertResult.rowCount) return errorResponse('حدث خطأ في حفظ المقال', 500)

  return successResponse({ bookmarked: true })
}
