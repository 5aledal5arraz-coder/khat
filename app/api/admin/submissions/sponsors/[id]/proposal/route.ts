import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  getSponsorshipLeadById,
  getSponsorshipAnalysis,
  getSponsorshipProposal,
  createSponsorshipProposal,
  updateSponsorshipProposal,
} from "@/lib/admin/queries"
import { generateSponsorshipProposal } from "@/lib/ai/sponsorship"

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const proposal = await getSponsorshipProposal(id)

  if (!proposal) {
    return NextResponse.json({ exists: false }, { status: 404 })
  }

  return NextResponse.json({ exists: true, proposal })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const lead = await getSponsorshipLeadById(id)

  if (!lead) {
    return NextResponse.json({ error: "طلب الشراكة غير موجود" }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const tone: "formal" | "warm" = body.tone === "warm" ? "warm" : "formal"

  // Fetch analysis if available
  const analysis = await getSponsorshipAnalysis(id)

  // Create proposal row
  const proposalId = await createSponsorshipProposal({
    lead_id: id,
    analysis_id: analysis?.id || null,
    tone,
    status: "generating",
  })

  // Run AI generation
  const result = await generateSponsorshipProposal(lead, analysis, tone)

  if (!result.success) {
    await updateSponsorshipProposal(proposalId, { status: "error", error_message: result.error })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Save results
  await updateSponsorshipProposal(proposalId, {
    status: "ready",
    subject: result.data.subject,
    greeting: result.data.greeting,
    introduction: result.data.introduction,
    value_proposition: result.data.value_proposition,
    proposed_packages: result.data.proposed_packages,
    next_steps: result.data.next_steps,
    closing: result.data.closing,
    full_draft: result.data.full_draft,
    raw_response: result.raw,
    error_message: null,
  })

  const proposal = await getSponsorshipProposal(id)
  return NextResponse.json({ exists: true, proposal })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const body = await request.json()
  const { proposal_id, edited_draft } = body

  if (!proposal_id || typeof edited_draft !== "string") {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  await updateSponsorshipProposal(proposal_id, { edited_draft })
  return NextResponse.json({ success: true })
}
