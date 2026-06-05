import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { deleteOutreachMessage } from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id, messageId } = await ctx.params

  try {
    await deleteOutreachMessage(id, messageId)
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ ok: true })
  } catch (err) {
    console.error("[outreach] delete failed:", err)
    return errorResponse("فشل حذف الرسالة", 500)
  }
}
