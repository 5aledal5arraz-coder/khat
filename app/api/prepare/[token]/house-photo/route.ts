import { NextResponse, type NextRequest } from "next/server"
import { readHousePhoto } from "@/lib/guest-link/house-photo"
import { publishedHousePhoto } from "@/lib/guest-link/view"
import { GUEST_PRIVATE_HEADERS, rateLimited, resolveUsable } from "@/lib/guest-link/route-helpers"

/**
 * GET /api/prepare/[token]/house-photo — the filming house photo.
 *
 * Token-gated: served only for a usable link, after the questionnaire, and
 * only the file frozen into the PUBLISHED snapshot (`publishedHousePhoto`) —
 * an admin upload that was never published stays invisible to the guest.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimited(request, "read")
  if (limited) return limited
  const { token } = await params
  const resolved = await resolveUsable(token)
  if (!resolved.ok) return resolved.response
  const { row } = resolved.link
  // The PUBLISHED file, never the live column: an unpublished upload stays
  // invisible, and a removed/replaced photo keeps serving until republish.
  const published = row.questionnaire_submitted_at ? publishedHousePhoto(row) : null
  if (!published) return new NextResponse(null, { status: 404, headers: GUEST_PRIVATE_HEADERS })
  const photo = await readHousePhoto(published)
  if (!photo) return new NextResponse(null, { status: 404, headers: GUEST_PRIVATE_HEADERS })
  return new NextResponse(new Uint8Array(photo.bytes), {
    status: 200,
    headers: { ...GUEST_PRIVATE_HEADERS, "Content-Type": photo.contentType },
  })
}
