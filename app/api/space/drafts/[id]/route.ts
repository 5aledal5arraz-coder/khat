import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sanitizeTitle, sanitizeArticleContent } from '@/lib/sanitize'
import { sql } from 'drizzle-orm'
import { eq, and } from 'drizzle-orm'
import { hibrDrafts } from '@/lib/db/schema'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const result = await db!.execute(sql`SELECT * FROM hibr_drafts WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`)
  const rows = result.rows as Record<string, unknown>[]

  if (rows.length === 0) return notFoundResponse()

  return successResponse({ draft: rows[0] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const existingResult = await db!.execute(sql`SELECT id FROM hibr_drafts WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`)
  const existing = existingResult.rows as Record<string, unknown>[]
  if (existing.length === 0) return notFoundResponse()

  let body: { title?: string; content?: string; tags?: string[]; episode_id?: string; episode_slug?: string; episode_title?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  // Build dynamic SET object
  const setFields: Record<string, unknown> = {}

  if (body.title !== undefined) {
    setFields.title = sanitizeTitle(body.title)
  }
  if (body.content !== undefined) {
    setFields.content = sanitizeArticleContent(body.content)
  }
  if (body.tags !== undefined) {
    setFields.tags = body.tags.slice(0, 5)
  }
  if (body.episode_id !== undefined) {
    setFields.episode_id = body.episode_id
  }
  if (body.episode_slug !== undefined) {
    setFields.episode_slug = body.episode_slug
  }
  if (body.episode_title !== undefined) {
    setFields.episode_title = body.episode_title
  }

  if (Object.keys(setFields).length === 0) return successResponse({ draft: null })

  // Build SET clause dynamically using sql tagged template
  const setClauses = Object.entries(setFields).map(
    ([key, value]) => sql`${sql.raw(key)} = ${value}`
  )
  // Add updated_at
  setClauses.push(sql`updated_at = NOW()`)

  let setClause = setClauses[0]
  for (let i = 1; i < setClauses.length; i++) {
    setClause = sql`${setClause}, ${setClauses[i]}`
  }

  try {
    const result = await db!.execute(sql`UPDATE hibr_drafts SET ${setClause} WHERE id = ${id} RETURNING *`)
    const rows = result.rows as Record<string, unknown>[]
    return successResponse({ draft: rows[0] })
  } catch {
    return errorResponse('حدث خطأ في حفظ المسودة', 500)
  }
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

  try {
    await db!.delete(hibrDrafts).where(and(eq(hibrDrafts.id, id), eq(hibrDrafts.user_id, user.id)))
    return successResponse({ deleted: true })
  } catch {
    return errorResponse('حدث خطأ في حذف المسودة', 500)
  }
}
