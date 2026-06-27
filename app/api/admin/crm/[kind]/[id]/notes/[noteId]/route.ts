import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { deleteNote, setNotePinned } from "@/lib/crm"
import type { CrmSubjectKind } from "@/types/database"

const KINDS: CrmSubjectKind[] = ["guest", "partner", "community"]
const kindOf = (k: string): CrmSubjectKind | null => (KINDS.includes(k as CrmSubjectKind) ? (k as CrmSubjectKind) : null)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string; noteId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id, noteId } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as { pinned?: boolean }
  if (typeof body.pinned === "boolean") await setNotePinned(k, id, noteId, body.pinned)
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string; noteId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { kind, id, noteId } = await params
  const k = kindOf(kind)
  if (!k) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 })
  await deleteNote(k, id, noteId)
  return NextResponse.json({ success: true })
}
