import { NextRequest } from 'next/server'
import { db, PROFILE_COLS, nestProfile } from '@/lib/db'
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await db!.execute(sql`SELECT t.*, ${sql.raw(PROFILE_COLS)}
     FROM hibr_thoughts t LEFT JOIN profiles p ON t.user_id = p.id
     WHERE t.id = ${id} AND t.deleted_at IS NULL LIMIT 1`)

  const rows = result.rows as Record<string, unknown>[]
  if (rows.length === 0) return notFoundResponse()

  // Also fetch replies
  const repliesResult = await db!.execute(sql`SELECT r.*, ${sql.raw(PROFILE_COLS)}
     FROM hibr_replies r LEFT JOIN profiles p ON r.user_id = p.id
     WHERE r.thought_id = ${id} AND r.deleted_at IS NULL AND r.moderation_status IN ('approved', 'pending')
     ORDER BY r.created_at ASC`)

  const replies = repliesResult.rows as Record<string, unknown>[]

  return successResponse({ thought: nestProfile(rows[0]), replies: replies.map(nestProfile) })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const existingResult = await db!.execute(sql`SELECT user_id FROM hibr_thoughts WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`)
  const existingRows = existingResult.rows as Record<string, unknown>[]
  if (existingRows.length === 0) return notFoundResponse()

  const profile = await getUserProfile(user.id)
  if (existingRows[0].user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  const deleteResult = await db!.execute(sql`UPDATE hibr_thoughts SET deleted_at = NOW() WHERE id = ${id}`)

  if (!deleteResult.rowCount) return errorResponse('حدث خطأ في حذف الخاطرة', 500)

  return successResponse({ deleted: true })
}
