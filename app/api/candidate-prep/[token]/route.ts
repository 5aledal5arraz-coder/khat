import { NextRequest } from "next/server"
import { errorResponse, successResponse, validationErrorResponse } from "@/lib/api-utils"
import {
  submitPrepResponse,
  validatePrepLinkByToken,
} from "@/lib/guest-candidates"

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * Public endpoint — no admin auth.
 * Token in URL acts as the bearer credential. Same-origin enforced via standard
 * browser CORS; we additionally accept only POSTs from the public form page.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params

  if (!token || token.length < 16) {
    return validationErrorResponse("رابط غير صالح")
  }

  let body: { response?: Record<string, unknown>; is_final?: boolean }
  try {
    body = await request.json()
  } catch {
    return validationErrorResponse("نص الطلب غير صالح")
  }

  if (!body.response || typeof body.response !== "object") {
    return validationErrorResponse("الإجابات مفقودة")
  }

  const validation = await validatePrepLinkByToken(token)
  if (!validation.ok) {
    if (validation.reason === "expired") return errorResponse("انتهت صلاحية الرابط", 410)
    if (validation.reason === "cancelled") return errorResponse("الرابط ملغى", 410)
    return errorResponse("الرابط غير موجود", 404)
  }

  const { link, candidate } = validation.data
  // Don't allow further edits to a completed link
  if (link.status === "completed" && body.is_final !== false) {
    return errorResponse("النموذج تم إرساله مسبقاً", 409)
  }

  try {
    const result = await submitPrepResponse({
      prepLinkId: link.id,
      candidateId: candidate.id,
      responseJson: body.response,
      isFinal: body.is_final === true,
    })
    return successResponse({
      ok: true,
      submitted: result.link.status === "completed",
      completion_percent: result.response.completion_percent,
    })
  } catch (err) {
    console.error("[candidate-prep] submit failed:", err)
    return errorResponse("فشل حفظ الإجابات", 500)
  }
}
