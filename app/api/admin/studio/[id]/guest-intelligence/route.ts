import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getGuestIntelligenceForSession, createGuestIntelligence, getTranscriptForSession, getStudioSession, revalidateStudio } from "@/lib/studio"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import { generateGuestIntelligence } from "@/lib/ai"

export const maxDuration = 120

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const data = await getGuestIntelligenceForSession(id)
  return NextResponse.json({ data })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  console.info(`[Studio:guest-intelligence] [${id}] started, provider=openai`)

  const session = await getStudioSession(id)
  if (!session) {
    console.error(`[Studio:guest-intelligence] [${id}] error: session_not_found`)
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  const transcript = await getTranscriptForSession(id)
  if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
    console.error(`[Studio:guest-intelligence] [${id}] error: no_ready_transcript`)
    return NextResponse.json({ error: "لا يوجد نص جاهز" }, { status: 400 })
  }

  console.info(`[Studio:guest-intelligence] [${id}] transcript_length=${transcript.transcript_clean.length}`)

  // Create placeholder
  await createGuestIntelligence(id, { status: "generating" })

  const startTime = Date.now()
  // Link this generator's ai_runs row to the session + episode.
  const eirContext = {
    eirId: await resolveEirIdForSession(id),
    subjectTable: "studio_sessions" as const,
    subjectId: id,
  }
  const result = await generateGuestIntelligence(
    transcript.transcript_clean,
    session.video_title || "",
    null,
    eirContext
  )

  if (!result.success) {
    console.error(`[Studio:guest-intelligence] [${id}] openai_failed: ${result.error}, duration_ms=${Date.now() - startTime}`)
    await createGuestIntelligence(id, {
      status: "error",
      error_message: result.error,
    })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  console.info(`[Studio:guest-intelligence] [${id}] openai_success, duration_ms=${Date.now() - startTime}`)

  const saved = await createGuestIntelligence(id, {
    status: "ready",
    detected_name: result.data.detected_name,
    detected_bio: result.data.detected_bio,
    confidence_score: result.data.confidence_score,
    speaking_style: result.data.speaking_style,
    key_positions: result.data.key_positions,
    notable_quotes: result.data.notable_quotes,
    raw_openai_response: result.raw || null,
  })

  console.info(`[Studio:guest-intelligence] [${id}] db_saved=${saved.success}`)
  revalidateStudio(id)
  return NextResponse.json({ data: saved.data })
}
