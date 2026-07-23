import { NextResponse } from "next/server"
import {
  getProjectByEditedSession,
  getEpisodeReview,
  transitionState,
} from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * POST /api/admin/studio/[id]/episode-review/approve
 *
 * The Phase-2 APPROVAL gate. Khaled has seen the review; this transitions
 * his project `mapped → reviewed`, which is exactly what opens the Phase-3
 * content-generation gate (evaluateGenerationGate allows `reviewed`+).
 *
 * Guards, in order:
 *   - the session must be the EDITED cut of a linked project (else 400),
 *   - a review record MUST exist — you cannot approve a review that was
 *     never generated (else 409). This is the honesty gate: approval is an
 *     act on a real, viewed review, never a blind stamp.
 *   - the transition itself is enforced by `transitionState` (the state
 *     machine): `mapped → reviewed` passes, an already-`reviewed` project
 *     is an idempotent no-op, and any illegal jump throws → 409.
 *
 * Returns the updated project so the client can advance its stepper + unlock
 * Phase 3 without a re-fetch.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  const project = await getProjectByEditedSession(id)
  if (!project) {
    return NextResponse.json(
      { error: "هذه الجلسة ليست نسخة معدّلة مرتبطة بمشروع" },
      { status: 400 },
    )
  }

  // No review → nothing to approve. Approval must follow a real, viewed review.
  const review = await getEpisodeReview(id)
  if (!review) {
    return NextResponse.json(
      { error: "لا يمكن الاعتماد قبل توليد مراجعة المرحلة ٢" },
      { status: 409 },
    )
  }

  try {
    const updated = await transitionState(project.id, "reviewed")
    return NextResponse.json({ project: updated })
  } catch (err) {
    // Illegal jump (e.g. the project never reached `mapped`, or already
    // moved past `reviewed`). The state machine is the authority.
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "تعذّر اعتماد المراجعة في الحالة الحالية للمشروع",
      },
      { status: 409 },
    )
  }
}
