import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const rateLimit = await checkRateLimit(supabase, user.id, 'create_report')
  if (!rateLimit.allowed) return rateLimitResponse()

  // Check for duplicate report
  const { data: existing } = await supabase
    .from('hibr_reports')
    .select('id')
    .eq('reporter_id', user.id)
    .eq('target_type', body.target_type)
    .eq('target_id', body.target_id)
    .eq('status', 'pending')
    .single()

  if (existing) {
    return validationErrorResponse('لقد أبلغت عن هذا المحتوى مسبقاً')
  }

  const { error } = await supabase
    .from('hibr_reports')
    .insert({
      reporter_id: user.id,
      target_type: body.target_type,
      target_id: body.target_id,
      reason: body.reason,
      details: body.details?.substring(0, 500) || null,
    })

  if (error) return errorResponse('حدث خطأ في إرسال البلاغ', 500)

  return successResponse({ reported: true }, 201)
}
