import { NextResponse } from "next/server"
import { getTranscriptForSession, updateTranscriptProcessing, revalidateStudio } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * POST /api/admin/studio/[id]/transcript/save-edits
 * Body: { summary?, quotes_extracted? }
 *
 * Saves manual edits to transcript processing fields without triggering AI.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const transcript = await getTranscriptForSession(id)
  if (!transcript) {
    return NextResponse.json({ error: "لا يوجد نص لهذه الجلسة" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (body.summary !== undefined) updates.summary = body.summary
    if (body.quotes_extracted !== undefined) updates.quotes_extracted = body.quotes_extracted

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "لا توجد تعديلات" }, { status: 400 })
    }

    const saved = await updateTranscriptProcessing(transcript.id, updates as Parameters<typeof updateTranscriptProcessing>[1])
    if (!saved.success) {
      return NextResponse.json({ error: saved.error || "فشل في الحفظ" }, { status: 500 })
    }

    revalidateStudio(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Save edits error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء الحفظ" }, { status: 500 })
  }
}
