import { NextRequest } from "next/server"
import {
  errorResponse,
  getAdminAuthUser,
  notFoundResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { changeCandidateStatus } from "@/lib/guest-candidates"
import type { GuestCandidateStatus } from "@/types/database"
import { revalidatePath } from "next/cache"

const VALID_STATUSES: GuestCandidateStatus[] = [
  "new", "researching", "analyzed", "shortlisted", "contacted",
  "waiting_response", "accepted", "declined", "prep_sent",
  "prep_in_progress", "prep_completed", "archived", "rejected",
]

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  let body: { status?: string; note?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  if (!body.status || !VALID_STATUSES.includes(body.status as GuestCandidateStatus)) {
    return errorResponse("الحالة غير صحيحة", 422)
  }

  const user = await getAdminAuthUser()

  try {
    const updated = await changeCandidateStatus(
      id,
      body.status as GuestCandidateStatus,
      user?.id,
      body.note?.trim() || undefined,
    )
    if (!updated) return notFoundResponse()
    revalidatePath("/admin/guest-candidates")
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ candidate: updated })
  } catch (err) {
    console.error("[guest-candidates] status change failed:", err)
    return errorResponse("فشل تغيير الحالة", 500)
  }
}
