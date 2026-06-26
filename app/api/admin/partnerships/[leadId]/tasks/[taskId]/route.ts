import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { setTaskStatus, deleteTask } from "@/lib/partnership-crm"
import type { PartnerTaskStatus } from "@/types/database"

const STATUSES: PartnerTaskStatus[] = ["open", "done", "dismissed"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string; taskId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, taskId } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !STATUSES.includes(body.status as PartnerTaskStatus)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
  }
  const user = await getAdminAuthUser()
  await setTaskStatus(leadId, taskId, body.status as PartnerTaskStatus, user ? `admin:${user.email}` : "admin")
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string; taskId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, taskId } = await params
  await deleteTask(leadId, taskId)
  return NextResponse.json({ success: true })
}
