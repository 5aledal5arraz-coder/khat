import { NextRequest, NextResponse } from "next/server"
import {
  getPreparationByLiveToken,
  updateLiveStateByToken,
} from "@/lib/preparation/queries"
import { validateOrigin, errorResponse } from "@/lib/api-utils"
import type { PreparationLiveState } from "@/types/preparation"

export const dynamic = "force-dynamic"

/**
 * Public endpoint: the live control panel fetches its own data via this route.
 * Access is gated only by knowing the token (unguessable base64url-32B).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const view = await getPreparationByLiveToken(token)
  if (!view) return errorResponse("غير موجود", 404)
  return NextResponse.json({ preparation: view })
}

/**
 * Update live state (used questions, notes, energy, current phase).
 * No admin cookie required, but we still enforce same-origin to prevent
 * cross-site mutation of live state.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!validateOrigin(request)) {
    return errorResponse("طلب غير صالح", 403)
  }

  const { token } = await params
  let body: Partial<PreparationLiveState>
  try {
    body = await request.json()
  } catch {
    return errorResponse("طلب غير صالح", 400)
  }

  const patch: Partial<PreparationLiveState> = {}
  if (Array.isArray(body.used_question_ids)) {
    patch.used_question_ids = body.used_question_ids.filter((q) => typeof q === "string")
  }
  if (typeof body.energy_level === "number") {
    patch.energy_level = Math.max(0, Math.min(5, Math.round(body.energy_level)))
  }
  if (typeof body.notes === "string") {
    patch.notes = body.notes.slice(0, 8000)
  }
  if (body.current_phase === null || typeof body.current_phase === "string") {
    patch.current_phase = body.current_phase as PreparationLiveState["current_phase"]
  }
  if (body.started_at === null || typeof body.started_at === "string") {
    patch.started_at = body.started_at
  }

  const next = await updateLiveStateByToken(token, patch)
  if (!next) return errorResponse("غير موجود", 404)
  return NextResponse.json({ live_state: next })
}
