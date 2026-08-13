/**
 * Review one company reply — the ONLY writer for `status` and `internal_note`.
 *
 * Admin-gated on purpose and by contract: the public respond route never reads
 * either column from its body, so "reviewed / accepted / declined" can only
 * ever have come from someone holding an admin session. Nothing the company
 * submitted is editable here either — a reply is the record of what was asked,
 * and a record that can be rewritten is not a record.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import {
  getOfferResponseById,
  updateOfferResponseReview,
  isOfferResponseStatus,
} from "@/lib/offer-responses"

const INTERNAL_NOTE_MAX = 2000

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string; responseId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { offerId, responseId } = await params

  const existing = await getOfferResponseById(responseId)
  if (!existing) return NextResponse.json({ error: "الردّ غير موجود" }, { status: 404 })
  // The reply must belong to the offer in the path — otherwise the offer id is
  // decoration and any admin URL could reach any reply.
  if (existing.offer_id !== offerId) {
    return NextResponse.json({ error: "الردّ غير موجود" }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const patch: { status?: typeof existing.status; internal_note?: string | null } = {}
  if (body.status !== undefined) {
    if (!isOfferResponseStatus(body.status)) {
      return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.internal_note !== undefined) {
    const note = typeof body.internal_note === "string" ? stripHtml(body.internal_note).slice(0, INTERNAL_NOTE_MAX) : ""
    patch.internal_note = note || null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ response: existing })
  }

  const response = await updateOfferResponseReview(responseId, patch)
  if (!response) return NextResponse.json({ error: "تعذّر تحديث الردّ" }, { status: 500 })
  return NextResponse.json({ response })
}
