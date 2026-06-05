import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { addSocialLink, listSocialLinks } from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"

const VALID_PLATFORMS = [
  "instagram", "x", "twitter", "youtube", "linkedin",
  "website", "tiktok", "facebook", "snapchat", "other",
]

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const { id } = await ctx.params
  try {
    const links = await listSocialLinks(id)
    return successResponse({ links })
  } catch (err) {
    console.error("[guest-candidates] list social links failed:", err)
    return errorResponse("فشل تحميل الروابط", 500)
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  let body: { platform?: string; url?: string; label?: string; is_primary?: boolean }
  try {
    body = await request.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  if (!body.platform || !VALID_PLATFORMS.includes(body.platform)) {
    return errorResponse("المنصة غير صحيحة", 422)
  }
  if (!body.url || typeof body.url !== "string") {
    return errorResponse("الرابط مطلوب", 422)
  }

  try {
    new URL(body.url)
  } catch {
    return errorResponse("الرابط غير صالح", 422)
  }

  try {
    const link = await addSocialLink(id, {
      platform: body.platform,
      url: body.url,
      label: body.label?.trim() || null,
      is_primary: !!body.is_primary,
    })
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ link }, 201)
  } catch (err) {
    console.error("[guest-candidates] add social link failed:", err)
    return errorResponse("فشل إضافة الرابط", 500)
  }
}
