import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sql } from 'drizzle-orm'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const existingResult = await db!.execute(sql`SELECT user_id, article_id FROM hibr_comments WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`)
  const existingRows = existingResult.rows as Record<string, unknown>[]
  if (existingRows.length === 0) return notFoundResponse()

  const profile = await getUserProfile(user.id)
  if (existingRows[0].user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  const deleteResult = await db!.execute(sql`UPDATE hibr_comments SET deleted_at = NOW() WHERE id = ${id}`)

  if (!deleteResult.rowCount) return errorResponse('حدث خطأ في حذف التعليق', 500)

  // Update comments count
  const countResult = await db!.execute(sql`SELECT COUNT(*)::int AS cnt FROM hibr_comments WHERE article_id = ${existingRows[0].article_id} AND deleted_at IS NULL`)
  const countRows = countResult.rows as Record<string, unknown>[]
  await db!.execute(sql`UPDATE hibr_articles SET comments_count = ${(countRows[0]?.cnt as number) ?? 0} WHERE id = ${existingRows[0].article_id}`)

  return successResponse({ deleted: true })
}
