import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import {
  getPreparationById,
  updatePreparationInputs,
  wipeResearchAndDownstream,
  softDeletePreparation,
} from "@/lib/preparation/queries"
import type { PreparationInputs } from "@/types/preparation"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)
  return NextResponse.json({ preparation: prep })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr

  const { id } = await params
  let body: Partial<PreparationInputs>
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }

  // Snapshot the pre-update state so we can detect whether the admin is
  // changing an input that anchors research (guest_description). If they
  // are, the existing research corpus is for a different prompt and must
  // be wiped alongside all dependent editorial sections.
  const before = await getPreparationById(id)
  if (!before) return errorResponse("غير موجود", 404)

  const prep = await updatePreparationInputs(id, body)
  if (!prep) return errorResponse("غير موجود", 404)

  const descriptionChanged =
    body.guest_description !== undefined &&
    (body.guest_description ?? "").trim() !== (before.guest_description ?? "").trim()

  // Fix: guest_description is the primary research query anchor. Any edit
  // invalidates the research corpus and everything generated from it.
  // Only wipe when research (or downstream sections) actually exist so an
  // innocuous description tweak on an empty draft doesn't force an
  // unnecessary status reset.
  const hadDownstream =
    before.research_data !== null ||
    before.executive_summary !== null ||
    before.knowledge_bank !== null ||
    before.guest_intelligence !== null ||
    before.conversation_axes !== null ||
    before.episode_flow !== null ||
    before.question_system !== null ||
    before.host_instructions !== null ||
    before.quotes_references !== null ||
    before.viral_moments !== null

  if (descriptionChanged && hadDownstream) {
    const wiped = await wipeResearchAndDownstream(id)
    return NextResponse.json({ preparation: wiped, research_wiped: true })
  }

  return NextResponse.json({ preparation: prep })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI("EDITOR")
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr

  const { id } = await params
  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)

  const deleted = await softDeletePreparation(id)
  if (!deleted) return errorResponse("فشل الحذف", 500)
  return NextResponse.json({ ok: true })
}
