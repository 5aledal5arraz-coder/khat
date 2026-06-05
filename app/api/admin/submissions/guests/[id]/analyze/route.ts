import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getGuestApplicationById, getGuestAnalysis, upsertGuestAnalysis, updateGuestApplicationStatus } from "@/lib/admin/queries"
import { analyzeGuestApplication } from "@/lib/ai/guest-application"
import type { GuestAnalysisRecommendation } from "@/types/database"

export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const analysis = await getGuestAnalysis(id)

  if (!analysis) {
    return NextResponse.json({ exists: false }, { status: 404 })
  }

  return NextResponse.json({ exists: true, analysis })
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

  // Mark as generating
  await upsertGuestAnalysis(id, { status: "generating" })

  // Run AI analysis
  const result = await analyzeGuestApplication(app)

  if (!result.success) {
    await upsertGuestAnalysis(id, { status: "error", error_message: result.error })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Save results
  await upsertGuestAnalysis(id, {
    status: "ready",
    fit_score: result.data.fit_score,
    emotional_depth_score: result.data.emotional_depth_score,
    story_clarity_score: result.data.story_clarity_score,
    originality_score: result.data.originality_score,
    readiness_score: result.data.readiness_score,
    risk_level: result.data.risk_level,
    recommendation: result.data.recommendation as GuestAnalysisRecommendation,
    fit_summary: result.data.fit_summary,
    strongest_angle: result.data.strongest_angle,
    why_now: result.data.why_now,
    audience_value: result.data.audience_value,
    concerns: result.data.concerns,
    strengths: result.data.strengths,
    suggested_direction: result.data.suggested_direction,
    raw_response: result.raw,
    error_message: null,
  })

  // Auto-update status to "under_review" if still "new"
  if (app.status === "new") {
    await updateGuestApplicationStatus(id, "under_review")
  }

  const analysis = await getGuestAnalysis(id)
  return NextResponse.json({ exists: true, analysis, statusUpdated: app.status === "new" })
}
