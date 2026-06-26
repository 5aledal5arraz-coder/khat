import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getSponsorshipLeadById, getSponsorshipAnalysis } from "@/lib/admin/queries"
import { runAndPersistEvaluation } from "@/lib/partnership-triage"

// Live web research (Gemini) + a full editorial evaluation — give it room.
export const maxDuration = 120

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

  // Shared evaluation path — identical to the auto-triage-on-submission flow.
  const wasNew = lead.status === "new"
  const outcome = await runAndPersistEvaluation(id, { actorId: "admin:manual-evaluate" })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error || "خطأ غير معروف" }, { status: 500 })
  }

  const analysis = await getSponsorshipAnalysis(id)
  return NextResponse.json({ exists: true, analysis, statusUpdated: wasNew })
}
