import { NextResponse, type NextRequest } from "next/server"
import { buildRecordingIcs } from "@/lib/guest-link/ics"
import { parseGuestPrepView } from "@/lib/guest-link/view"
import { GUEST_PRIVATE_HEADERS, rateLimited, resolveUsable } from "@/lib/guest-link/route-helpers"

/**
 * GET /api/prepare/[token]/calendar — «أضف للتقويم». Built from the PUBLISHED
 * snapshot's time and address, never from the live EIR.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimited(request, "read")
  if (limited) return limited
  const { token } = await params
  const resolved = await resolveUsable(token)
  if (!resolved.ok) return resolved.response
  const { row } = resolved.link
  const view = parseGuestPrepView(row.published_view)
  if (!row.questionnaire_submitted_at || !view?.schedule_at) {
    return new NextResponse(null, { status: 404, headers: GUEST_PRIVATE_HEADERS })
  }
  const ics = buildRecordingIcs({
    uid: row.id,
    start: new Date(view.schedule_at),
    address: view.location?.address ?? null,
    mapUrl: view.location?.map_url ?? null,
  })
  return new NextResponse(ics, {
    status: 200,
    headers: {
      ...GUEST_PRIVATE_HEADERS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="khat-recording.ics"',
    },
  })
}
