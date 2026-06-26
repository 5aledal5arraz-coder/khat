import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getNotes, createNote } from "@/lib/partnership-crm"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  return NextResponse.json({ notes: await getNotes(leadId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  const body = (await req.json().catch(() => ({}))) as { body?: string }
  const text = typeof body.body === "string" ? stripHtml(body.body).trim() : ""
  if (!text) return NextResponse.json({ error: "الملاحظة فارغة" }, { status: 400 })
  const user = await getAdminAuthUser()
  const note = await createNote(leadId, text, user ? `admin:${user.email}` : "admin")
  return NextResponse.json({ note })
}
