import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'
import { sanitizeTitle, sanitizeArticleContent } from '@/lib/sanitize'
import { sql } from 'drizzle-orm'
import { hibrDrafts } from '@/lib/db/schema'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  try {
    const result = await db!.execute(sql`SELECT * FROM hibr_drafts WHERE user_id = ${user.id} ORDER BY updated_at DESC LIMIT 10`)
    const rows = result.rows as Record<string, unknown>[]
    return successResponse({ drafts: rows })
  } catch {
    return errorResponse('حدث خطأ في جلب المسودات', 500)
  }
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: {
    id?: string
    title?: string
    content?: string
    tags?: string[]
    episode_id?: string
    episode_slug?: string
    episode_title?: string
  }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  const title = body.title ? sanitizeTitle(body.title) : ''
  const content = body.content ? sanitizeArticleContent(body.content) : ''
  const tags = body.tags?.slice(0, 5) || []
  const episodeId = body.episode_id || null
  const episodeSlug = body.episode_slug || null
  const episodeTitle = body.episode_title || null

  // Upsert: if id provided and exists, update; otherwise create
  if (body.id) {
    const existingResult = await db!.execute(sql`SELECT id FROM hibr_drafts WHERE id = ${body.id} AND user_id = ${user.id} LIMIT 1`)
    const existing = existingResult.rows as Record<string, unknown>[]

    if (existing.length > 0) {
      try {
        const result = await db!.execute(sql`UPDATE hibr_drafts SET user_id = ${user.id}, title = ${title}, content = ${content}, tags = ${tags}, episode_id = ${episodeId}, episode_slug = ${episodeSlug}, episode_title = ${episodeTitle}, updated_at = NOW()
           WHERE id = ${body.id} RETURNING *`)
        const rows = result.rows as Record<string, unknown>[]
        return successResponse({ draft: rows[0] })
      } catch {
        return errorResponse('حدث خطأ في حفظ المسودة', 500)
      }
    }
  }

  // Create new
  try {
    const rows = await db!.insert(hibrDrafts).values({
      user_id: user.id,
      title,
      content,
      tags,
      episode_id: episodeId,
      episode_slug: episodeSlug,
      episode_title: episodeTitle,
    }).returning()
    return successResponse({ draft: rows[0] }, 201)
  } catch {
    return errorResponse('حدث خطأ في إنشاء المسودة', 500)
  }
}
