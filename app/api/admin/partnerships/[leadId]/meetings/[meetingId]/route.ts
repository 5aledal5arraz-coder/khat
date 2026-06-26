import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { updateMeeting, deleteMeeting } from "@/lib/partnership-crm"
import type { PartnerMeetingStatus } from "@/types/database"

const STATUSES: PartnerMeetingStatus[] = ["scheduled", "completed", "cancelled"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string; meetingId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, meetingId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  await updateMeeting(leadId, meetingId, {
    status: STATUSES.includes(body.status as PartnerMeetingStatus)
      ? (body.status as PartnerMeetingStatus)
      : undefined,
    notes: typeof body.notes === "string" ? stripHtml(body.notes) : undefined,
    outcome: typeof body.outcome === "string" ? stripHtml(body.outcome) : undefined,
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string; meetingId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, meetingId } = await params
  await deleteMeeting(leadId, meetingId)
  return NextResponse.json({ success: true })
}
