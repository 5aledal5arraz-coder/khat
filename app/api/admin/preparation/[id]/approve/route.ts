import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import {
  getPreparationById,
  updatePreparationStatus,
  setLiveTokenHash,
  clearLiveToken,
} from "@/lib/preparation/queries"
import { enforcePreparationRateLimit } from "@/lib/preparation/rate-limit"
import { generateLiveToken } from "@/lib/preparation/token"
import type { PreparationStatus } from "@/types/preparation"

export const dynamic = "force-dynamic"

/**
 * Transition the preparation workflow state MANUALLY.
 * Body: { status: "reviewed" | "approved" | "draft" }
 *
 * `draft → researched → prepared` auto-transitions happen elsewhere (research
 * and generate routes). This route only accepts the human-driven steps:
 *   - prepared   → reviewed   (reviewer signs off)
 *   - reviewed   → approved   (mints live token, exactly once)
 *   - anything   → draft      (reset; also revokes the live token)
 *
 * On first transition to "approved", a live token is minted. The raw token
 * is returned in the response exactly once; only the SHA-256 hash is stored.
 * Re-approving does not re-mint. To mint a new token, use the rotate-token
 * route.
 */
const MANUAL_STATUSES: PreparationStatus[] = ["draft", "reviewed", "approved"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  const rateErr = await enforcePreparationRateLimit("approve")
  if (rateErr) return rateErr

  const { id } = await params
  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }

  const next = body.status as PreparationStatus | undefined
  if (!next || !MANUAL_STATUSES.includes(next)) {
    return errorResponse("الحالة غير صالحة", 400)
  }

  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)

  // Gate: can only mark reviewed if the record is at least `prepared`.
  if (next === "reviewed" && prep.status !== "prepared" && prep.status !== "approved") {
    return errorResponse("لا يمكن المراجعة قبل إكمال جميع الأقسام", 400)
  }
  // Gate: can only approve if the record is `reviewed`.
  if (next === "approved" && prep.status !== "reviewed" && prep.status !== "approved") {
    return errorResponse("يجب مراجعة الإعداد قبل الاعتماد", 400)
  }

  // Any demotion out of `approved` must revoke the live token. Keeping it
  // around would mean a paused-or-unapproved preparation still exposes a
  // working live URL. This covers approved → reviewed, approved → draft,
  // and any manual-reset-to-draft regardless of prior status.
  const demotingFromApproved = prep.status === "approved" && next !== "approved"
  const resettingToDraft = next === "draft" && prep.live_token_hash
  if ((demotingFromApproved || resettingToDraft) && prep.live_token_hash) {
    await clearLiveToken(id)
  }

  const updated = await updatePreparationStatus(id, next)
  if (!updated) return errorResponse("فشل التحديث", 500)

  let liveToken: string | null = null
  if (next === "approved" && !updated.live_token_hash) {
    const { token, hash } = generateLiveToken()
    await setLiveTokenHash(id, hash)
    liveToken = token
  }

  const final = await getPreparationById(id)
  return NextResponse.json({ preparation: final, liveToken })
}
