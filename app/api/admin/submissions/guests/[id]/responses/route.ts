import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getGuestApplicationById, getGuestAnalysis, getGuestResponses, upsertGuestResponses } from "@/lib/admin/queries"
import { generateGuestResponseDrafts } from "@/lib/ai/guest-application"

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const responses = await getGuestResponses(id)

  if (!responses) {
    return NextResponse.json({ exists: false }, { status: 404 })
  }

  return NextResponse.json({ exists: true, responses })
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
  await upsertGuestResponses(id, { status: "generating" })

  // Fetch analysis if available
  const analysis = await getGuestAnalysis(id)

  // Run AI generation
  const result = await generateGuestResponseDrafts(app, analysis)

  if (!result.success) {
    await upsertGuestResponses(id, { status: "error", error_message: result.error })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Save results
  await upsertGuestResponses(id, {
    status: "ready",
    analysis_id: analysis?.id || null,
    acceptance_formal: result.data.acceptance_formal,
    acceptance_warm: result.data.acceptance_warm,
    rejection_formal: result.data.rejection_formal,
    rejection_warm: result.data.rejection_warm,
    consider_later_formal: result.data.consider_later_formal,
    consider_later_warm: result.data.consider_later_warm,
    raw_response: result.raw,
    error_message: null,
  })

  const responses = await getGuestResponses(id)
  return NextResponse.json({ exists: true, responses })
}
