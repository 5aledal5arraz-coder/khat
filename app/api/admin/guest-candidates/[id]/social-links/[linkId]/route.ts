import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { deleteSocialLink } from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"

interface RouteContext {
  params: Promise<{ id: string; linkId: string }>
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id, linkId } = await ctx.params
  try {
    await deleteSocialLink(linkId)
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ ok: true })
  } catch (err) {
    console.error("[guest-candidates] delete social link failed:", err)
    return errorResponse("فشل حذف الرابط", 500)
  }
}
