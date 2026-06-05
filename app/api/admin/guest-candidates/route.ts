import { NextRequest } from "next/server"
import {
  errorResponse,
  getAdminAuthUser,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import {
  createCandidate,
  listCandidates,
  type CreateCandidateInput,
  type ListCandidatesFilters,
} from "@/lib/guest-candidates"
import type { GuestCandidatePriority, GuestCandidateStatus } from "@/types/database"
import { revalidatePath } from "next/cache"

const VALID_STATUSES: GuestCandidateStatus[] = [
  "new", "researching", "analyzed", "shortlisted", "contacted",
  "waiting_response", "accepted", "declined", "prep_sent",
  "prep_in_progress", "prep_completed", "archived", "rejected",
]

const VALID_PRIORITIES: GuestCandidatePriority[] = ["low", "medium", "high"]

export async function GET(request: NextRequest) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const url = new URL(request.url)
  const filters: ListCandidatesFilters = {}

  const status = url.searchParams.get("status")
  if (status) {
    const statuses = status.split(",").filter((s): s is GuestCandidateStatus =>
      VALID_STATUSES.includes(s as GuestCandidateStatus),
    )
    if (statuses.length === 1) filters.status = statuses[0]
    else if (statuses.length > 1) filters.status = statuses
  }

  const category = url.searchParams.get("category")
  if (category) filters.category = category

  const priority = url.searchParams.get("priority")
  if (priority && VALID_PRIORITIES.includes(priority as GuestCandidatePriority)) {
    filters.priority = priority as GuestCandidatePriority
  }

  const search = url.searchParams.get("search")
  if (search) filters.search = search

  if (url.searchParams.get("includeArchived") === "true") {
    filters.includeArchived = true
  }

  try {
    const candidates = await listCandidates(filters)
    return successResponse({ candidates })
  } catch (err) {
    console.error("[guest-candidates] list failed:", err)
    return errorResponse("فشل تحميل المرشحين", 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const csrf = validateMutation(request)
  if (csrf) return csrf

  const user = await getAdminAuthUser()

  let body: Partial<CreateCandidateInput>
  try {
    body = await request.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  if (!body.full_name || typeof body.full_name !== "string" || body.full_name.trim().length < 2) {
    return errorResponse("الاسم الكامل مطلوب (حرفان على الأقل)", 422)
  }

  if (body.priority_level && !VALID_PRIORITIES.includes(body.priority_level)) {
    return errorResponse("مستوى الأولوية غير صحيح", 422)
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return errorResponse("الحالة غير صحيحة", 422)
  }

  // Sanitize social links
  const socials = Array.isArray(body.social_links)
    ? body.social_links
        .filter((s) => s && typeof s.platform === "string" && typeof s.url === "string" && s.url.length > 0)
        .slice(0, 20)
    : undefined

  try {
    const created = await createCandidate(
      {
        full_name: body.full_name.trim(),
        display_name: body.display_name?.trim() || null,
        slug: body.slug?.trim() || null,
        primary_language: body.primary_language || "ar",
        category: body.category?.trim() || null,
        city: body.city?.trim() || null,
        country: body.country?.trim() || null,
        bio: body.bio?.trim() || null,
        notes_internal: body.notes_internal?.trim() || null,
        source_type: body.source_type || "manual",
        source_note: body.source_note?.trim() || null,
        priority_level: body.priority_level || "medium",
        status: body.status || "new",
        social_links: socials,
      },
      user?.id,
    )

    revalidatePath("/admin/guest-candidates")
    return successResponse({ candidate: created }, 201)
  } catch (err) {
    console.error("[guest-candidates] create failed:", err)
    return errorResponse("فشل إنشاء المرشح", 500)
  }
}
