import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { deleteNote, setNotePinned } from "@/lib/partnership-crm"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string; noteId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, noteId } = await params
  const body = (await req.json().catch(() => ({}))) as { pinned?: boolean }
  if (typeof body.pinned === "boolean") await setNotePinned(leadId, noteId, body.pinned)
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string; noteId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId, noteId } = await params
  await deleteNote(leadId, noteId)
  return NextResponse.json({ success: true })
}
