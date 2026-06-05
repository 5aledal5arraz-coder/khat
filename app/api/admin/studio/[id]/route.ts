import { NextResponse } from "next/server"
import { getStudioSession, deleteStudioSession, updateStudioSession, revalidateStudio } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const session = await getStudioSession(id)

  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  return NextResponse.json(session)
}

const ALLOWED_FIELDS = new Set([
  "audio_start_seconds",
  "audio_end_seconds",
  "audio_best_intro",
  "audio_edit_suggestions",
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const body = await request.json()

  // Only allow whitelisted fields
  const updates: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      updates[key] = body[key]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "لا توجد حقول صالحة للتحديث" }, { status: 400 })
  }

  const result = await updateStudioSession(id, updates as Parameters<typeof updateStudioSession>[1])

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  revalidateStudio(id)
  return NextResponse.json({ session: result.data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const deleted = await deleteStudioSession(id)

  if (!deleted) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  revalidateStudio(id)
  return NextResponse.json({ success: true })
}
