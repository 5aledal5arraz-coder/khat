import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getNotes, createNote } from "@/lib/crm"
import type { CrmSubjectKind } from "@/types/database"

const KINDS: CrmSubjectKind[] = ["guest", "partner"]
const kindOf = (k: string): CrmSubjectKind | null => (KINDS.includes(k as CrmSubjectKind) ? (k as CrmSubjectKind) : null)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  return NextResponse.json({ notes: await getNotes(k, id) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as { body?: string }
  const text = typeof body.body === "string" ? stripHtml(body.body).trim() : ""
  if (!text) return NextResponse.json({ error: "الملاحظة فارغة" }, { status: 400 })
  const user = await getAdminAuthUser()
  const note = await createNote(k, id, text, user ? `admin:${user.email}` : "admin")
  return NextResponse.json({ note })
}
