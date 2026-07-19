import { NextRequest } from "next/server"
import {
  errorResponse,
  notFoundResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import {
  archiveCandidate,
  getCandidate,
  softDeleteCandidate,
  unarchiveCandidate,
  updateCandidate,
  type UpdateCandidateInput,
} from "@/lib/guest-candidates"
import type { GuestCandidatePriority } from "@/types/database"
import { EMAIL_REGEX } from "@/lib/validation/forms"
import { revalidatePath } from "next/cache"

const VALID_PRIORITIES: GuestCandidatePriority[] = ["low", "medium", "high"]

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const { id } = await ctx.params
  try {
    const candidate = await getCandidate(id)
    if (!candidate) return notFoundResponse()
    return successResponse({ candidate })
  } catch (err) {
    console.error("[guest-candidates] get failed:", err)
    return errorResponse("فشل تحميل المرشح", 500)
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  let body: Partial<UpdateCandidateInput> & { action?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  // Action shortcuts
  if (body.action === "archive") {
    try {
      await archiveCandidate(id)
      revalidatePath("/admin/guest-candidates")
      revalidatePath(`/admin/guest-candidates/${id}`)
      return successResponse({ ok: true })
    } catch (err) {
      console.error("[guest-candidates] archive failed:", err)
      return errorResponse("فشل أرشفة المرشح", 500)
    }
  }

  if (body.action === "unarchive") {
    try {
      await unarchiveCandidate(id)
      revalidatePath("/admin/guest-candidates")
      revalidatePath(`/admin/guest-candidates/${id}`)
      return successResponse({ ok: true })
    } catch (err) {
      console.error("[guest-candidates] unarchive failed:", err)
      return errorResponse("فشل إلغاء الأرشفة", 500)
    }
  }

  // Field updates
  if (body.priority_level && !VALID_PRIORITIES.includes(body.priority_level)) {
    return errorResponse("مستوى الأولوية غير صحيح", 422)
  }
  if (body.full_name !== undefined && (typeof body.full_name !== "string" || body.full_name.trim().length < 2)) {
    return errorResponse("الاسم الكامل غير صحيح", 422)
  }
  // Email must be well-formed when a non-empty value is supplied. An
  // explicit null/empty clears the field and is allowed.
  const emailTrimmed = typeof body.email === "string" ? body.email.trim() : ""
  if (emailTrimmed && !EMAIL_REGEX.test(emailTrimmed)) {
    return errorResponse("البريد الإلكتروني غير صالح", 422)
  }

  const updates: UpdateCandidateInput = {}
  if (body.full_name !== undefined) updates.full_name = body.full_name.trim()
  if (body.display_name !== undefined) updates.display_name = body.display_name?.trim() || null
  if (body.primary_language !== undefined) updates.primary_language = body.primary_language || null
  if (body.category !== undefined) updates.category = body.category?.trim() || null
  if (body.city !== undefined) updates.city = body.city?.trim() || null
  if (body.country !== undefined) updates.country = body.country?.trim() || null
  // Admin-only contact channels. Phone is free-text; email pre-validated above.
  if (body.phone !== undefined) updates.phone = body.phone?.trim().slice(0, 40) || null
  if (body.email !== undefined) updates.email = body.email?.trim().slice(0, 200) || null
  if (body.bio !== undefined) updates.bio = body.bio?.trim() || null
  if (body.notes_internal !== undefined) updates.notes_internal = body.notes_internal?.trim() || null
  if (body.source_note !== undefined) updates.source_note = body.source_note?.trim() || null
  if (body.priority_level !== undefined) updates.priority_level = body.priority_level

  if (Object.keys(updates).length === 0) {
    return errorResponse("لا يوجد ما يتم تحديثه", 400)
  }

  try {
    const updated = await updateCandidate(id, updates)
    if (!updated) return notFoundResponse()
    revalidatePath("/admin/guest-candidates")
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ candidate: updated })
  } catch (err) {
    console.error("[guest-candidates] update failed:", err)
    return errorResponse("فشل تحديث المرشح", 500)
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI("EDITOR")
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params
  try {
    await softDeleteCandidate(id)
    revalidatePath("/admin/guest-candidates")
    return successResponse({ ok: true })
  } catch (err) {
    console.error("[guest-candidates] delete failed:", err)
    return errorResponse("فشل حذف المرشح", 500)
  }
}
