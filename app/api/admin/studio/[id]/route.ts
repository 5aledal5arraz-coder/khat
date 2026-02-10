import { NextResponse } from "next/server"
import { getStudioSession, deleteStudioSession } from "@/lib/studio"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getStudioSession(id)

  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  return NextResponse.json(session)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deleted = await deleteStudioSession(id)

  if (!deleted) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
