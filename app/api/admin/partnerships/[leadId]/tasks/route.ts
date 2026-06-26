import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getTasks, createTask } from "@/lib/partnership-crm"
import type { PartnerTaskPriority } from "@/types/database"

const PRIORITIES: PartnerTaskPriority[] = ["low", "normal", "high"]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  return NextResponse.json({ tasks: await getTasks(leadId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === "string" ? stripHtml(body.title).trim() : ""
  if (!title) return NextResponse.json({ error: "عنوان المهمة مطلوب" }, { status: 400 })
  const user = await getAdminAuthUser()
  const task = await createTask(leadId, {
    title,
    detail: typeof body.detail === "string" ? stripHtml(body.detail) : null,
    type: typeof body.type === "string" ? body.type : "follow_up",
    priority: PRIORITIES.includes(body.priority as PartnerTaskPriority)
      ? (body.priority as PartnerTaskPriority)
      : "normal",
    due_at: typeof body.due_at === "string" && body.due_at ? body.due_at : null,
    created_by: user ? `admin:${user.email}` : "admin",
  })
  return NextResponse.json({ task })
}
