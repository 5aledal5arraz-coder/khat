import { NextRequest } from "next/server"
import {
  errorResponse,
  getAdminAuthUser,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import {
  listPrepMeetings,
  createPrepMeeting,
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
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const { id } = await ctx.params
  try {
    return successResponse({ meetings: await listPrepMeetings(id) })
  } catch (err) {
    console.error("[guest-candidates] prep-meetings list failed:", err)
    return errorResponse("فشل تحميل اللقاءات التحضيرية", 500)
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(req)
  if (csrf) return csrf
  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  const title = typeof body.title === "string" ? stripHtml(body.title).trim() : ""
  if (!title) return errorResponse("عنوان اللقاء مطلوب", 422)

  const input: CreatePrepMeetingInput = {
    title,
    type: TYPES.includes(body.type as GuestPrepMeetingType) ? (body.type as GuestPrepMeetingType) : "video",
    scheduled_at: typeof body.scheduled_at === "string" && body.scheduled_at ? body.scheduled_at : null,
    duration_minutes: clampDuration(body.duration_minutes),
    notes: typeof body.notes === "string" ? stripHtml(body.notes) : null,
    outcome: typeof body.outcome === "string" ? stripHtml(body.outcome) : null,
    status: STATUSES.includes(body.status as GuestPrepMeetingStatus)
      ? (body.status as GuestPrepMeetingStatus)
      : "scheduled",
  }

  const user = await getAdminAuthUser()
  // Stamp the actor by stable id (matches link-canonical) — not email.
  input.created_by = user ? `admin:${user.id}` : "admin"

  try {
    const meeting = await createPrepMeeting(id, input)
    revalidatePath(`/admin/guest-candidates/${id}`)
    return successResponse({ meeting }, 201)
  } catch (err) {
    console.error("[guest-candidates] prep-meeting create failed:", err)
    return errorResponse("فشل إنشاء اللقاء التحضيري", 500)
  }
}
