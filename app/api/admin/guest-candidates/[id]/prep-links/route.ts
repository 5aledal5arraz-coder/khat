import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
  validationErrorResponse,
} from "@/lib/api-utils"
import {
  createPrepLink,
  listPrepLinks,
} from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const { id } = await ctx.params
  const links = await listPrepLinks(id)
  return successResponse({ links })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  let body: {
    template_id?: string
    expires_in_days?: number
    sent_via?: "whatsapp" | "email" | "manual_copy"
    location_note?: string
    meeting_note?: string
    admin_message?: string
  }
  try {
    body = await request.json()
  } catch {
    return validationErrorResponse("نص الطلب غير صالح")
  }

  try {
    const link = await createPrepLink({
      candidateId: id,
      templateId: body.template_id,
      expiresInDays: body.expires_in_days,
      sentVia: body.sent_via,
      locationNote: body.location_note,
      meetingNote: body.meeting_note,
      adminMessage: body.admin_message,
    })
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ link }, 201)
  } catch (err) {
    console.error("[prep-links] create failed:", err)
    return errorResponse(err instanceof Error ? err.message : "فشل إنشاء الرابط", 500)
  }
}
