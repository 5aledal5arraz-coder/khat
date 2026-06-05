import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import {
  getPreparationById,
  rotateLiveTokenHash,
} from "@/lib/preparation/queries"
import { enforcePreparationRateLimit } from "@/lib/preparation/rate-limit"
import { generateLiveToken } from "@/lib/preparation/token"

export const dynamic = "force-dynamic"

/**
 * Rotate the live token for an approved preparation.
 *
 * - Only allowed when `status === "approved"` — there's nothing meaningful
 *   to rotate otherwise, and we don't want to leak a token for a record
 *   the host never signed off on.
 * - The previous hash is overwritten in a single UPDATE, so the old raw
 *   token stops working the moment this route returns. There is no window
 *   where both tokens authenticate.
 * - The raw token is returned exactly once (same contract as first approval).
 *   Only the SHA-256 hash is persisted.
 * - `live_state` is reset — the rotated token is a fresh session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr
  const rateErr = await enforcePreparationRateLimit("rotate_token")
  if (rateErr) return rateErr

  const { id } = await params
  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)

  if (prep.status !== "approved") {
    return errorResponse("لا يمكن تدوير الرابط إلا للإعدادات المعتمدة", 400)
  }

  const { token, hash } = generateLiveToken()
  const updated = await rotateLiveTokenHash(id, hash)
  if (!updated) return errorResponse("فشل تدوير الرابط", 500)

  return NextResponse.json({
    preparation: updated,
    liveToken: token,
    rotated: true,
  })
}
