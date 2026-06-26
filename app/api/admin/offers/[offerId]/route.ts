import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import {
  getOfferById,
  updateOffer,
  setOfferPassword,
  regenerateOfferToken,
  type OfferPatch,
} from "@/lib/partnership-offers"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { offerId } = await params
  const offer = await getOfferById(offerId)
  if (!offer) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 })
  return NextResponse.json({ offer })
}

// PATCH — update offer content / publish state / optional password / token.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { offerId } = await params

  const existing = await getOfferById(offerId)
  if (!existing) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Optional secret-management ops first.
  if (body.regenerateToken === true) {
    await regenerateOfferToken(offerId)
  }
  // `password`: string sets a gate, "" or null removes it, undefined leaves it.
  if (body.password !== undefined) {
    const pw = typeof body.password === "string" ? body.password : null
    await setOfferPassword(offerId, pw && pw.trim().length > 0 ? pw : null)
  }

  // Content patch — only touch keys the client actually sent.
  const patch: OfferPatch = {}
  if (typeof body.title === "string") patch.title = stripHtml(body.title)
  if (typeof body.intro === "string") patch.intro = stripHtml(body.intro)
  if (typeof body.body === "string") patch.body = body.body // long-form; preserve line breaks
  if (typeof body.validity_note === "string") patch.validity_note = stripHtml(body.validity_note)
  if (typeof body.contact_email === "string") patch.contact_email = stripHtml(body.contact_email)
  if (typeof body.published === "boolean") patch.published = body.published
  if (Array.isArray(body.packages)) {
    patch.packages = (body.packages as unknown[])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        name: stripHtml(String(p.name ?? "")),
        description: stripHtml(String(p.description ?? "")),
        price_range: stripHtml(String(p.price_range ?? "")),
        deliverables: Array.isArray(p.deliverables)
          ? (p.deliverables as unknown[]).map((d) => stripHtml(String(d))).filter(Boolean)
          : [],
      }))
  }

  const offer = Object.keys(patch).length > 0 ? await updateOffer(offerId, patch) : await getOfferById(offerId)
  return NextResponse.json({ offer })
}
