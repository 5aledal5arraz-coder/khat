import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getSponsorshipLeadById, getSponsorshipAnalysis, upsertSponsorshipAnalysis, updateSponsorshipStatus } from "@/lib/admin/queries"
import { analyzeSponsorshipLead } from "@/lib/ai/sponsorship"

export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const analysis = await getSponsorshipAnalysis(id)

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
  const lead = await getSponsorshipLeadById(id)

  if (!lead) {
    return NextResponse.json({ error: "طلب الشراكة غير موجود" }, { status: 404 })
  }

  // Mark as generating
  const analysisId = await upsertSponsorshipAnalysis(id, { status: "generating" })

  // Run AI analysis
  const result = await analyzeSponsorshipLead(lead)

  if (!result.success) {
    await upsertSponsorshipAnalysis(id, { status: "error", error_message: result.error })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Save results
  await upsertSponsorshipAnalysis(id, {
    status: "ready",
    fit_score: result.data.fit_score,
    quality: result.data.quality,
    risk_level: result.data.risk_level,
    intent_summary: result.data.intent_summary,
    budget_fit: result.data.budget_fit,
    recommended_package: result.data.recommended_package,
    reasoning: result.data.reasoning,
    risk_flags: result.data.risk_flags,
    opportunity_highlights: result.data.opportunity_highlights,
    raw_response: result.raw,
    error_message: null,
  })

  // Auto-update lead status to "reviewing" if still "new"
  if (lead.status === "new") {
    await updateSponsorshipStatus(id, "reviewing")
  }

  const analysis = await getSponsorshipAnalysis(id)
  return NextResponse.json({ exists: true, analysis, statusUpdated: lead.status === "new" })
}
