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
import { hibrReactions } from '@/lib/db/schema'

const VALID_REACTIONS = ['clap', 'fire', 'bulb', 'heart'] as const

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { article_id: string; reaction_type: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.article_id) return validationErrorResponse('معرف المقال مطلوب')
  if (!VALID_REACTIONS.includes(body.reaction_type as typeof VALID_REACTIONS[number])) {
    return validationErrorResponse('نوع التفاعل غير صالح')
  }

  // Check if already reacted
  const existingResult = await db!.execute(sql`SELECT id FROM hibr_reactions WHERE user_id = ${user.id} AND article_id = ${body.article_id} AND reaction_type = ${body.reaction_type} LIMIT 1`)
  const existing = existingResult.rows as Record<string, unknown>[]

  if (existing.length > 0) {
    await db!.delete(hibrReactions).where(eq(hibrReactions.id, existing[0].id as string))
    return successResponse({ reacted: false, reaction_type: body.reaction_type })
  }

  const insertResult = await db!.execute(sql`INSERT INTO hibr_reactions (user_id, article_id, reaction_type) VALUES (${user.id}, ${body.article_id}, ${body.reaction_type})`)

  if (!insertResult.rowCount) return errorResponse('حدث خطأ في التفاعل', 500)

  return successResponse({ reacted: true, reaction_type: body.reaction_type })
}
