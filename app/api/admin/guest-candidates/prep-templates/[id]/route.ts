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
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"
import type { PrepFormSchema } from "@/types/database"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const { id } = await ctx.params
  const tpl = await getTemplate(id)
  if (!tpl) return notFoundResponse()
  return successResponse({ template: tpl })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  let body: {
    name?: string
    description?: string | null
    schema_json?: PrepFormSchema
    is_default?: boolean
    is_active?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return validationErrorResponse("نص الطلب غير صالح")
  }

  if (body.schema_json && !body.schema_json.sections?.length) {
    return validationErrorResponse("القالب يجب أن يحتوي على قسم واحد على الأقل")
  }

  try {
    const tpl = await updateTemplate(id, body)
    if (!tpl) return notFoundResponse()
    revalidatePath("/admin/guest-candidates")
    return successResponse({ template: tpl })
  } catch (err) {
    console.error("[prep-templates] update failed:", err)
    return errorResponse("فشل تحديث القالب", 500)
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params
  const result = await deleteTemplate(id)
  if (!result.ok) return errorResponse(result.error || "فشل الحذف", 409)
  revalidatePath("/admin/guest-candidates")
  return successResponse({ ok: true })
}
