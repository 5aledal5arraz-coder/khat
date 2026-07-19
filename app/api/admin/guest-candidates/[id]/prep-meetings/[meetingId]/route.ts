import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import {
  updatePrepMeeting,
  deletePrepMeeting,
  type CreatePrepMeetingInput,
} from "@/lib/guest-candidates"
import type { GuestPrepMeetingStatus, GuestPrepMeetingType } from "@/types/database"
import { revalidatePath } from "next/cache"

const TYPES: GuestPrepMeetingType[] = ["call", "video", "in_person"]
const STATUSES: GuestPrepMeetingStatus[] = ["scheduled", "completed", "cancelled"]

const MAX_DURATION_MINUTES = 1440 // 24h — sane upper bound for a prep meeting

/** Clamp a client-supplied duration into [0, 1440]; non-numbers → null. */
function clampDuration(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return Math.min(MAX_DURATION_MINUTES, Math.max(0, Math.floor(v)))
}

interface RouteContext {
  params: Promise<{ id: string; meetingId: string }>
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(req)
  if (csrf) return csrf
  const { id, meetingId } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  const patch: Partial<CreatePrepMeetingInput> = {}
  if (typeof body.title === "string") {
    const t = stripHtml(body.title).trim()
    if (!t) return errorResponse("عنوان اللقاء مطلوب", 422)
    patch.title = t
  }
  if (body.type !== undefined && TYPES.includes(body.type as GuestPrepMeetingType)) {
    patch.type = body.type as GuestPrepMeetingType
  }
  if (body.scheduled_at !== undefined) {
    patch.scheduled_at = typeof body.scheduled_at === "string" && body.scheduled_at ? body.scheduled_at : null
  }
  if (body.duration_minutes !== undefined) {
    patch.duration_minutes = clampDuration(body.duration_minutes)
  }
  if (body.notes !== undefined) patch.notes = typeof body.notes === "string" ? stripHtml(body.notes) : null
  if (body.outcome !== undefined) patch.outcome = typeof body.outcome === "string" ? stripHtml(body.outcome) : null
  if (body.status !== undefined && STATUSES.includes(body.status as GuestPrepMeetingStatus)) {
    patch.status = body.status as GuestPrepMeetingStatus
  }

  try {
    const meeting = await updatePrepMeeting(id, meetingId, patch)
    if (!meeting) return errorResponse("اللقاء غير موجود", 404)
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ meeting })
  } catch (err) {
    console.error("[guest-candidates] prep-meeting update failed:", err)
    return errorResponse("فشل تحديث اللقاء التحضيري", 500)
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(req)
  if (csrf) return csrf
  const { id, meetingId } = await ctx.params
  try {
    await deletePrepMeeting(id, meetingId)
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ ok: true })
  } catch (err) {
    console.error("[guest-candidates] prep-meeting delete failed:", err)
    return errorResponse("فشل حذف اللقاء التحضيري", 500)
  }
}
