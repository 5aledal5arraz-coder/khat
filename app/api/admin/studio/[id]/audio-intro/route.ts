import { NextResponse } from "next/server"
import { getStudioSession, getTranscriptForSession, updateStudioSession, revalidateStudio } from "@/lib/studio"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import { suggestBestIntro } from "@/lib/ai"
import { requireAdminAPI } from "@/lib/api-utils"
import { formatTimeSeconds } from "@/lib/utils"

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
  try { const b = await request.clone().json(); forceRegenerate = b?.force === true } catch (err) { console.debug("[Studio:audio-intro] no request body (fine):", err) }
  if (!forceRegenerate && session.audio_best_intro && session.audio_start_seconds != null) {
    return NextResponse.json({
      intro: {
        start_seconds: session.audio_start_seconds,
        end_seconds: session.audio_end_seconds,
        reason: session.audio_best_intro,
      },
      saved: true,
      cached: true,
    })
  }

  const transcript = await getTranscriptForSession(id)
  if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
    return NextResponse.json({ error: "يجب توفر النص أولاً" }, { status: 400 })
  }

  // Link this generator's ai_runs row to the session + episode.
  const eirContext = {
    eirId: await resolveEirIdForSession(id),
    subjectTable: "studio_sessions" as const,
    subjectId: id,
  }
  const result = await suggestBestIntro(
    transcript.transcript_clean,
    session.video_title || session.audio_filename || "حلقة صوتية",
    session.duration_seconds,
    eirContext
  )

  if (!result.success || !result.data) {
    return NextResponse.json({ error: result.error || "فشل في تحليل الافتتاحية" }, { status: 500 })
  }

  // Save the suggestion to the session
  const introText = `${formatTimeSeconds(result.data.start_seconds)} → ${formatTimeSeconds(result.data.end_seconds)}\n${result.data.reason}\n\n${result.data.transcript_excerpt}`

  await updateStudioSession(id, {
    audio_best_intro: introText,
    audio_start_seconds: result.data.start_seconds,
    audio_end_seconds: result.data.end_seconds,
  })

  revalidateStudio(id)
  return NextResponse.json({
    intro: result.data,
    saved: true,
  })
}
