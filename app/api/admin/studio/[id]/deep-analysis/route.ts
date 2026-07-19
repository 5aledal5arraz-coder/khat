import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getDeepAnalysisForSession, createDeepAnalysis, getTranscriptForSession, getStudioSession, revalidateStudio } from "@/lib/studio"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import { generateDeepAnalysis } from "@/lib/ai"

export const maxDuration = 120

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const data = await getDeepAnalysisForSession(id)
  return NextResponse.json({ data })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  console.info(`[Studio:deep-analysis] [${id}] started, provider=openai`)

  const session = await getStudioSession(id)
  if (!session) {
    console.error(`[Studio:deep-analysis] [${id}] error: session_not_found`)
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  const transcript = await getTranscriptForSession(id)
  if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
    console.error(`[Studio:deep-analysis] [${id}] error: no_ready_transcript`)
    return NextResponse.json({ error: "لا يوجد نص جاهز" }, { status: 400 })
  }

  console.info(`[Studio:deep-analysis] [${id}] transcript_length=${transcript.transcript_clean.length}`)

  // Create placeholder
  await createDeepAnalysis(id, { status: "generating" })

  const startTime = Date.now()
  // Link this generator's ai_runs row to the session + episode.
  const eirContext = {
    eirId: await resolveEirIdForSession(id),
    subjectTable: "studio_sessions" as const,
    subjectId: id,
  }
  const result = await generateDeepAnalysis(
    transcript.transcript_clean,
    session.video_title || "",
    null,
    eirContext
  )

  if (!result.success) {
    console.error(`[Studio:deep-analysis] [${id}] openai_failed: ${result.error}, duration_ms=${Date.now() - startTime}`)
    await createDeepAnalysis(id, {
      status: "error",
      error_message: result.error,
    })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  console.info(`[Studio:deep-analysis] [${id}] openai_success, duration_ms=${Date.now() - startTime}`)

  const saved = await createDeepAnalysis(id, {
    status: "ready",
    themes: result.data.themes,
    thesis: result.data.thesis,
    arguments: result.data.arguments,
    emotional_moments: result.data.emotional_moments,
    lessons: result.data.lessons,
    contradictions: result.data.contradictions,
    dialogue_map: result.data.dialogue_map,
    conversation_arc: result.data.conversation_arc,
    open_questions: result.data.open_questions,
    raw_openai_response: result.raw || null,
  })

  console.info(`[Studio:deep-analysis] [${id}] db_saved=${saved.success}`)
  revalidateStudio(id)
  return NextResponse.json({ data: saved.data })
}
