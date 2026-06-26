import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getMeetings, createMeeting } from "@/lib/partnership-crm"
import type { PartnerMeetingStatus, PartnerMeetingType } from "@/types/database"

const TYPES: PartnerMeetingType[] = ["call", "video", "in_person"]
const STATUSES: PartnerMeetingStatus[] = ["scheduled", "completed", "cancelled"]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  return NextResponse.json({ meetings: await getMeetings(leadId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === "string" ? stripHtml(body.title).trim() : ""
  if (!title) return NextResponse.json({ error: "عنوان الاجتماع مطلوب" }, { status: 400 })
  const user = await getAdminAuthUser()
  const meeting = await createMeeting(leadId, {
    title,
    type: TYPES.includes(body.type as PartnerMeetingType) ? (body.type as PartnerMeetingType) : "call",
    scheduled_at: typeof body.scheduled_at === "string" && body.scheduled_at ? body.scheduled_at : null,
    duration_minutes: typeof body.duration_minutes === "number" ? body.duration_minutes : null,
    attendees: typeof body.attendees === "string" ? stripHtml(body.attendees) : null,
    agenda: typeof body.agenda === "string" ? stripHtml(body.agenda) : null,
    notes: typeof body.notes === "string" ? stripHtml(body.notes) : null,
    outcome: typeof body.outcome === "string" ? stripHtml(body.outcome) : null,
    status: STATUSES.includes(body.status as PartnerMeetingStatus)
      ? (body.status as PartnerMeetingStatus)
      : "scheduled",
    created_by: user ? `admin:${user.email}` : "admin",
  })
  return NextResponse.json({ meeting })
}
