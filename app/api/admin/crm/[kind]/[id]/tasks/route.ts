import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getTasks, createTask } from "@/lib/crm"
import type { CrmSubjectKind, CrmTaskPriority } from "@/types/database"

const KINDS: CrmSubjectKind[] = ["guest", "partner", "community"]
const kindOf = (k: string): CrmSubjectKind | null => (KINDS.includes(k as CrmSubjectKind) ? (k as CrmSubjectKind) : null)
const PRIORITIES: CrmTaskPriority[] = ["low", "normal", "high"]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  return NextResponse.json({ tasks: await getTasks(k, id) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === "string" ? stripHtml(body.title).trim() : ""
  if (!title) return NextResponse.json({ error: "عنوان المهمة مطلوب" }, { status: 400 })
  const user = await getAdminAuthUser()
  const task = await createTask(k, id, {
    title,
    detail: typeof body.detail === "string" ? stripHtml(body.detail) : null,
    type: typeof body.type === "string" ? body.type : "follow_up",
    priority: PRIORITIES.includes(body.priority as CrmTaskPriority) ? (body.priority as CrmTaskPriority) : "normal",
    due_at: typeof body.due_at === "string" && body.due_at ? body.due_at : null,
    created_by: user ? `admin:${user.email}` : "admin",
  })
  return NextResponse.json({ task })
}
