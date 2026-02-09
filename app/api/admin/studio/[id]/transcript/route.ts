import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, createTranscript, createTranscriptError } from "@/lib/studio"
import { fetchTranscript } from "@/lib/youtube/transcript"

export const maxDuration = 60

/**
 * GET /api/admin/studio/[id]/transcript — get existing transcript for session
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const transcript = await getTranscriptForSession(id)

  if (!transcript) {
    return NextResponse.json({ transcript: null })
  }

  return NextResponse.json({ transcript })
}

/**
 * POST /api/admin/studio/[id]/transcript — fetch transcript from YouTube captions
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const result = await fetchTranscript(session.video_id!)

    if (!result.success || !result.text) {
      const errorMsg = result.error || "لا تتوفر ترجمة تلقائية لهذا الفيديو"
      await createTranscriptError(id, errorMsg)
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    // result.text is already cleaned by fetchTranscript's internal cleanTranscript
    // Store the cleaned text as raw, and run our own cleaning as transcript_clean
    const createResult = await createTranscript(id, "youtube_captions", result.text, "ar")

    if (!createResult.success) {
      return NextResponse.json(
        { error: createResult.error || "فشل في حفظ النص" },
        { status: 500 }
      )
    }

    return NextResponse.json({ transcript: createResult.data })
  } catch (error) {
    console.error("Transcript fetch error:", error)
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء جلب النص"
    await createTranscriptError(id, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
