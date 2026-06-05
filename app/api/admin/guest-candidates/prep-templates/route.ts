import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
  validationErrorResponse,
} from "@/lib/api-utils"
import {
  createTemplate,
  ensureDefaultTemplate,
  listTemplates,
} from "@/lib/guest-candidates"
import type { PrepFormSchema } from "@/types/database"
import { revalidatePath } from "next/cache"

export async function GET(request: NextRequest) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get("active") === "1"

  // Make sure the default template exists at least once
  await ensureDefaultTemplate()

  const templates = await listTemplates({ activeOnly })
  return successResponse({ templates })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

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

  if (!body.name?.trim()) return validationErrorResponse("اسم القالب مطلوب")
  if (!body.schema_json?.sections?.length) {
    return validationErrorResponse("القالب يجب أن يحتوي على قسم واحد على الأقل")
  }

  try {
    const tpl = await createTemplate({
      name: body.name.trim(),
      description: body.description ?? null,
      schema_json: body.schema_json,
      is_default: body.is_default ?? false,
      is_active: body.is_active ?? true,
    })
    revalidatePath("/admin/guest-candidates")
    return successResponse({ template: tpl }, 201)
  } catch (err) {
    console.error("[prep-templates] create failed:", err)
    return errorResponse("فشل إنشاء القالب", 500)
  }
}
