import { NextRequest } from 'next/server'
import { db, PROFILE_COLS, nestProfile } from '@/lib/db'
import {
  getAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { validateArticleTitle, validateArticleContent, validateTags } from '@/lib/validation'
import { sanitizeTitle, sanitizeArticleContent, generateExcerpt } from '@/lib/sanitize'
import { moderateArticle } from '@/lib/moderation'
import { getUserApprovedCount } from '@/lib/api-utils'
import { sql } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await db!.execute(sql`SELECT a.*, ${sql.raw(PROFILE_COLS)}
     FROM hibr_articles a LEFT JOIN profiles p ON a.user_id = p.id
     WHERE a.id = ${id} AND a.deleted_at IS NULL LIMIT 1`)

  const rows = result.rows as Record<string, unknown>[]
  if (rows.length === 0) return notFoundResponse()

  // Also fetch comments
  const commentsResult = await db!.execute(sql`SELECT c.*, ${sql.raw(PROFILE_COLS)}
     FROM hibr_comments c LEFT JOIN profiles p ON c.user_id = p.id
     WHERE c.article_id = ${id} AND c.deleted_at IS NULL AND c.moderation_status = 'approved'
     ORDER BY c.created_at ASC`)

  const comments = commentsResult.rows as Record<string, unknown>[]

  return successResponse({ article: nestProfile(rows[0]), comments: comments.map(nestProfile) })
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

  // Fetch existing article
  const existingResult = await db!.execute(sql`SELECT user_id FROM hibr_articles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`)
  const existingRows = existingResult.rows as Record<string, unknown>[]
  if (existingRows.length === 0) return notFoundResponse()

  // Only owner or admin can edit
  const profile = await getUserProfile(user.id)
  if (existingRows[0].user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  let body: { title?: string; content?: string; excerpt?: string; tags?: string[] }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  // Build dynamic SET object
  const setFields: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const v = validateArticleTitle(body.title)
    if (!v.valid) return validationErrorResponse(v.error!)
    setFields.title = sanitizeTitle(body.title)
  }

  if (body.content !== undefined) {
    const v = validateArticleContent(body.content)
    if (!v.valid) return validationErrorResponse(v.error!)
    const cleanContent = sanitizeArticleContent(body.content)
    setFields.content = cleanContent

    const cleanExcerpt = body.excerpt
      ? sanitizeTitle(body.excerpt)
      : generateExcerpt(cleanContent)
    setFields.excerpt = cleanExcerpt

    const wordCount = cleanContent.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length
    setFields.read_time_minutes = Math.max(1, Math.ceil(wordCount / 200))
  }

  if (body.tags !== undefined) {
    const v = validateTags(body.tags)
    if (!v.valid) return validationErrorResponse(v.error!)
    setFields.tags = body.tags.slice(0, 5)
  }

  // Re-run moderation on content changes
  const hasTitle = body.title !== undefined
  const hasContent = body.content !== undefined
  if (hasTitle || hasContent) {
    const title = body.title ? sanitizeTitle(body.title) : ''
    const content = body.content ? sanitizeArticleContent(body.content) : ''
    if (title || content) {
      const approvedCount = await getUserApprovedCount(user.id)
      const modResult = await moderateArticle(title || 'untitled', content || '', approvedCount)
      if (modResult.aiVerdict === 'harmful') {
        return errorResponse(
          'لا يمكن نشر هذا المحتوى لأنه يخالف إرشادات المجتمع. يرجى تعديل النص والمحاولة مرة أخرى.',
          422
        )
      }
      if (modResult.status !== 'approved') {
        setFields.moderation_status = modResult.status
      }
    }
  }

  if (Object.keys(setFields).length === 0) return successResponse({ article: null })

  // Build SET clause dynamically using sql tagged template
  const setClauses = Object.entries(setFields).map(
    ([key, value]) => sql`${sql.raw(key)} = ${value}`
  )
  let setClause = setClauses[0]
  for (let i = 1; i < setClauses.length; i++) {
    setClause = sql`${setClause}, ${setClauses[i]}`
  }

  const result = await db!.execute(sql`UPDATE hibr_articles SET ${setClause} WHERE id = ${id} RETURNING *`)
  const rows = result.rows as Record<string, unknown>[]

  if (rows.length === 0) return errorResponse('حدث خطأ في تحديث المقال', 500)

  return successResponse({ article: rows[0] })
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

  const existingResult = await db!.execute(sql`SELECT user_id FROM hibr_articles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`)
  const existingRows = existingResult.rows as Record<string, unknown>[]
  if (existingRows.length === 0) return notFoundResponse()

  const profile = await getUserProfile(user.id)
  if (existingRows[0].user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  // Soft delete
  const deleteResult = await db!.execute(sql`UPDATE hibr_articles SET deleted_at = NOW() WHERE id = ${id}`)

  if (!deleteResult.rowCount) return errorResponse('حدث خطأ في حذف المقال', 500)

  return successResponse({ deleted: true })
}
