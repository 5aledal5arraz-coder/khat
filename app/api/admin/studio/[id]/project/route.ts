import { NextResponse } from "next/server"
import { getProjectJourneyForSession } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * GET /api/admin/studio/[id]/project
 *
 * The Phase-2 review screen's hydration read: the project a studio session
 * belongs to (resolved by edited cut first, then raw) plus the two phase
 * timestamps its stepper shows. Returns `project: null` (all-null journey)
 * for sessions that are not part of a linked project — YouTube, legacy, and
 * standalone uploads — which the client treats as "no Phase-2 journey" and
 * renders the existing pipeline unchanged.
 *
 * Read-only; the heavy work (review generation, approval) lives in the
 * sibling episode-review routes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const journey = await getProjectJourneyForSession(id)

  return NextResponse.json(journey)
}
