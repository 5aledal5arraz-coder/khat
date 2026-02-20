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
import { validateReportReason } from '@/lib/validation'
import { checkRateLimit } from '@/lib/rate-limit'
import { sql } from 'drizzle-orm'

const VALID_TYPES = ['article', 'thought', 'comment', 'reply'] as const

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { target_type: string; target_id: string; reason: string; details?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!VALID_TYPES.includes(body.target_type as typeof VALID_TYPES[number])) {
    return validationErrorResponse('نوع المحتوى غير صالح')
  }
  if (!body.target_id) return validationErrorResponse('معرف المحتوى مطلوب')

  const validation = validateReportReason(body.reason)
  if (!validation.valid) return validationErrorResponse(validation.error!)

  const rateLimit = await checkRateLimit(user.id, 'create_report')
  if (!rateLimit.allowed) return rateLimitResponse()

  // Check for duplicate report
  const existingResult = await db!.execute(sql`SELECT id FROM hibr_reports WHERE reporter_id = ${user.id} AND target_type = ${body.target_type} AND target_id = ${body.target_id} AND status = 'pending' LIMIT 1`)
  const existing = existingResult.rows as Record<string, unknown>[]

  if (existing.length > 0) {
    return validationErrorResponse('لقد أبلغت عن هذا المحتوى مسبقاً')
  }

  const insertResult = await db!.execute(sql`INSERT INTO hibr_reports (reporter_id, target_type, target_id, reason, details) VALUES (${user.id}, ${body.target_type}, ${body.target_id}, ${body.reason}, ${body.details?.substring(0, 500) || null})`)

  if (!insertResult.rowCount) return errorResponse('حدث خطأ في إرسال البلاغ', 500)

  return successResponse({ reported: true }, 201)
}
