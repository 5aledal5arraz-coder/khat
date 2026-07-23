import { NextResponse } from "next/server"
import { getStudioSession, createTranscript, createTranscriptError, revalidateStudio } from "@/lib/studio"
import { resolveSessionAudioPath } from "@/lib/studio/audio-path"
import { transcribeAudioFile } from "@/lib/whisper"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 600

/**
 * POST /api/admin/studio/[id]/transcript/whisper — transcribe audio via Whisper
 */
export async function POST(
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

  if (session.source !== "audio") {
    return NextResponse.json(
      { error: "هذه الجلسة ليست جلسة صوتية" },
      { status: 400 }
    )
  }

  if (!session.audio_filename) {
    return NextResponse.json(
      { error: "لم يتم العثور على ملف صوتي لهذه الجلسة" },
      { status: 400 }
    )
  }

  // The uploader stores the file as audio-{id}{ext}, NOT under the original
  // browser filename — resolve the correct on-disk path (which also confirms the
  // file exists). Joining audio_filename directly was an ENOENT bug.
  let filePath: string
  try {
    filePath = await resolveSessionAudioPath(id, session.audio_filename)
  } catch {
    return NextResponse.json(
      { error: "الملف الصوتي غير موجود على الخادم" },
      { status: 404 }
    )
  }

  try {
    const result = await transcribeAudioFile(filePath, "ar", {
      subjectTable: "studio_sessions",
      subjectId: id,
    })

    if (!result.success || !result.text) {
      const errorMsg = result.error || "فشل في تحويل الصوت إلى نص"
      await createTranscriptError(id, errorMsg)
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }

    const createResult = await createTranscript(id, "whisper", result.text, "ar")

    if (!createResult.success) {
      return NextResponse.json(
        { error: createResult.error || "فشل في حفظ النص" },
        { status: 500 }
      )
    }

    revalidateStudio(id)
    return NextResponse.json({ transcript: createResult.data })
  } catch (error) {
    console.error("Whisper transcription error:", error)
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحويل الصوت إلى نص"
    await createTranscriptError(id, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
