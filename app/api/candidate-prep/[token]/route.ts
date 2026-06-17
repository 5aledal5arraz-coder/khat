import { NextRequest } from "next/server"
import {
  errorResponse,
  successResponse,
  validationErrorResponse,
  validateOrigin,
} from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import {
  submitPrepResponse,
  validatePrepLinkByToken,
} from "@/lib/guest-candidates"

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * Public endpoint — no admin auth.
 * The URL token is the sole bearer credential, so this surface is hardened with
 * an Origin check (CSRF) and a per-IP rate limit (token brute-force / spam).
 * CORS does NOT protect simple POSTs, so the Origin check is required here.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  // CSRF: only accept submissions originating from our own site.
  if (!validateOrigin(request)) {
    return errorResponse("طلب غير صالح", 403)
  }

  // Abuse / token brute-force protection: 10 submissions per minute per IP.
  const rl = checkIpRateLimit(request, "candidate_prep_submit", 10, 60_000)
  if (!rl.allowed) {
    return errorResponse("محاولات كثيرة. يرجى المحاولة لاحقاً.", 429)
  }

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
