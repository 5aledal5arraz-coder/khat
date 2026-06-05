import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getGuestApplicationById, getGuestAnalysis, getGuestConcept, createGuestConcept, updateGuestConcept } from "@/lib/admin/queries"
import { generateGuestConcept } from "@/lib/ai/guest-application"

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const concept = await getGuestConcept(id)

  if (!concept) {
    return NextResponse.json({ exists: false }, { status: 404 })
  }

  return NextResponse.json({ exists: true, concept })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const app = await getGuestApplicationById(id)

  if (!app) {
    return NextResponse.json({ error: "طلب الضيف غير موجود" }, { status: 404 })
  }

  // Fetch analysis if available
  const analysis = await getGuestAnalysis(id)

  // Create concept row
  const conceptId = await createGuestConcept({
    application_id: id,
    analysis_id: analysis?.id || null,
    status: "generating",
  })

  // Run AI generation
  const result = await generateGuestConcept(app, analysis)

  if (!result.success) {
    await updateGuestConcept(conceptId, { status: "error", error_message: result.error })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Save results
  await updateGuestConcept(conceptId, {
    status: "ready",
    proposed_episode_title: result.data.proposed_episode_title,
    title_alternatives: result.data.title_alternatives,
    episode_hook: result.data.episode_hook,
    episode_logline: result.data.episode_logline,
    why_this_episode_matters: result.data.why_this_episode_matters,
    conversation_style: result.data.conversation_style,
    suggested_opening_question: result.data.suggested_opening_question,
    suggested_core_questions: result.data.suggested_core_questions,
    suggested_sensitive_areas: result.data.suggested_sensitive_areas,
    suggested_topics_to_avoid: result.data.suggested_topics_to_avoid,
    host_preparation_notes: result.data.host_preparation_notes,
    raw_response: result.raw,
    error_message: null,
  })

  const concept = await getGuestConcept(id)
  return NextResponse.json({ exists: true, concept })
}
