import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, createTranscript, createTranscriptError } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 60

/**
 * GET /api/admin/studio/[id]/transcript — get existing transcript for session
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const transcript = await getTranscriptForSession(id)

  if (!transcript) {
    return NextResponse.json({ transcript: null })
  }

  return NextResponse.json({ transcript })
}

/**
 * POST /api/admin/studio/[id]/transcript — save transcript extracted by the client
 *
 * The browser extracts captions directly from YouTube (client-side) and sends
 * the raw text here for storage. YouTube blocks server/datacenter IPs, so
 * transcript extraction MUST happen in the browser.
 *
 * Body: { raw_text: string, language?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const session = await getStudioSession(id)

  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  if (session.source === "audio") {
    return NextResponse.json(
      { error: "استخدم نقطة Whisper لتحويل الجلسات الصوتية" },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const rawText = body?.raw_text

    if (!rawText || typeof rawText !== "string" || rawText.trim().length < 10) {
      return NextResponse.json(
        { error: "النص المرسل فارغ أو قصير جداً" },
        { status: 400 }
      )
    }

    const language = body?.language || "ar"

    const createResult = await createTranscript(id, "youtube_captions", rawText.trim(), language)

    if (!createResult.success) {
      return NextResponse.json(
        { error: createResult.error || "فشل في حفظ النص" },
        { status: 500 }
      )
    }

    return NextResponse.json({ transcript: createResult.data })
  } catch (error) {
    console.error("Transcript save error:", error)
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء حفظ النص"
    await createTranscriptError(id, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
