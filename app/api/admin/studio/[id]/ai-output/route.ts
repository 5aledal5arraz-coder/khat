import { NextRequest, NextResponse } from "next/server"
import { getAiOutputForSession, updateAiOutput } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * PATCH /api/admin/studio/[id]/ai-output — save admin edits to AI outputs
 * Body: partial update fields (title_best, title_alternatives, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id: sessionId } = await params

  const output = await getAiOutputForSession(sessionId)
  if (!output) {
    return NextResponse.json({ error: "لا يوجد محتوى AI لهذه الجلسة" }, { status: 404 })
  }

  try {
    const body = await request.json()

    // Only allow specific fields to be updated
    const allowedFields = [
      "title_best",
      "title_alternatives",
      "thumbnail_text_options",
      "youtube_description",
      "seo_keywords",
      "hashtags",
    ] as const

    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 })
    }

    const result = await updateAiOutput(output.id, updates)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "فشل في حفظ التعديلات" },
        { status: 500 }
      )
    }

    return NextResponse.json({ output: result.data })
  } catch (error) {
    console.error("AI output update error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء الحفظ" },
      { status: 500 }
    )
  }
}
