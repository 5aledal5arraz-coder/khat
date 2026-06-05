import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, updateStudioSession, revalidateStudio } from "@/lib/studio"
import { generateEditSuggestions } from "@/lib/ai"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 120

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

  if (session.source !== "audio") {
    return NextResponse.json({ error: "هذه الأداة متاحة فقط لجلسات الملفات الصوتية" }, { status: 400 })
  }

  // AI guard: return cached result if already generated (unless force=true)
  let forceRegenerate = false
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch (err) { console.debug("[Studio:edit-suggestions] no request body (fine):", err) }
  if (!forceRegenerate && session.audio_edit_suggestions && Array.isArray(session.audio_edit_suggestions) && session.audio_edit_suggestions.length > 0) {
    return NextResponse.json({ suggestions: session.audio_edit_suggestions, cached: true })
  }

  const transcript = await getTranscriptForSession(id)
  if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
    return NextResponse.json({ error: "يجب توفر النص أولاً" }, { status: 400 })
  }

  const result = await generateEditSuggestions(
    transcript.transcript_clean,
    session.video_title || session.audio_filename || "حلقة صوتية",
    session.duration_seconds
  )

  if (!result.success || !result.data) {
    return NextResponse.json({ error: result.error || "فشل في تحليل المقاطع" }, { status: 500 })
  }

  // Save suggestions to the session
  await updateStudioSession(id, {
    audio_edit_suggestions: result.data.suggestions,
  })

  revalidateStudio(id)
  return NextResponse.json({
    suggestions: result.data.suggestions,
    total_cut_seconds: result.data.total_cut_seconds,
  })
}
