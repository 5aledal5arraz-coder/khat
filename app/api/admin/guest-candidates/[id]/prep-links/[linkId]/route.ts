import { NextRequest } from "next/server"
import {
  errorResponse,
  notFoundResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
  validationErrorResponse,
} from "@/lib/api-utils"
import {
  cancelPrepLink,
  getPrepLink,
  markPrepLinkSent,
} from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"

interface RouteContext {
  params: Promise<{ id: string; linkId: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const { linkId } = await ctx.params
  const link = await getPrepLink(linkId)
  if (!link) return notFoundResponse()
  return successResponse({ link })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id, linkId } = await ctx.params

  let body: { action?: "mark_sent"; sent_via?: "whatsapp" | "email" | "manual_copy" }
  try {
    body = await request.json()
  } catch {
    return validationErrorResponse("نص الطلب غير صالح")
  }

  try {
    if (body.action === "mark_sent") {
      if (!body.sent_via) return validationErrorResponse("قناة الإرسال مطلوبة")
      await markPrepLinkSent(linkId, body.sent_via)
      revalidatePath(`/admin/guest-candidates/${id}`)
      return successResponse({ ok: true })
    }
    return validationErrorResponse("إجراء غير معروف")
  } catch (err) {
    console.error("[prep-links] patch failed:", err)
    return errorResponse("فشل التحديث", 500)
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id, linkId } = await ctx.params
  try {
    await cancelPrepLink(linkId)
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ ok: true })
  } catch (err) {
    console.error("[prep-links] cancel failed:", err)
    return errorResponse("فشل الإلغاء", 500)
  }
}
