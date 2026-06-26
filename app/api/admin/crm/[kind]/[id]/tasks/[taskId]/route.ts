import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { setTaskStatus, deleteTask } from "@/lib/crm"
import type { CrmSubjectKind, CrmTaskStatus } from "@/types/database"

const KINDS: CrmSubjectKind[] = ["guest", "partner"]
const kindOf = (k: string): CrmSubjectKind | null => (KINDS.includes(k as CrmSubjectKind) ? (k as CrmSubjectKind) : null)
const STATUSES: CrmTaskStatus[] = ["open", "done", "dismissed"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string; taskId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id, taskId } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !STATUSES.includes(body.status as CrmTaskStatus)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
  }
  const user = await getAdminAuthUser()
  await setTaskStatus(k, id, taskId, body.status as CrmTaskStatus, user ? `admin:${user.email}` : "admin")
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string; taskId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id, taskId } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  await deleteTask(k, id, taskId)
  return NextResponse.json({ success: true })
}
