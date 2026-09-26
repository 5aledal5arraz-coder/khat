import type { NextRequest } from "next/server"
import { markGuestWelcomeSeen } from "@/lib/guest-link/service"
import { guestJson, rateLimited, readGuestJson, resolveUsable } from "@/lib/guest-link/route-helpers"

/**
 * POST /api/prepare/[token]/welcome — the guest finished the welcome cards.
 * They are shown once; after this a revisit lands straight on the prep view.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimited(request, "draft")
  if (limited) return limited
  const body = await readGuestJson(request)
  if (!body.ok) return body.response

  const { token } = await params
  const resolved = await resolveUsable(token)
  if (!resolved.ok) return resolved.response

  const ok = await markGuestWelcomeSeen(resolved.link.row.id)
  if (!ok) return guestJson({ error: "أكمل الاستبيان أولاً" }, 409)
  return guestJson({ ok: true })
}
