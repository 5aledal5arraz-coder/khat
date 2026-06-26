import { NextRequest, NextResponse } from "next/server"
import { checkIpRateLimit } from "@/lib/rate-limit"
import {
  getOfferByToken,
  verifyOfferPassword,
  recordOfferView,
  getOfferCompanyName,
} from "@/lib/partnership-offers"
import type { PublicPartnershipOffer } from "@/types/database"

const MAX_ATTEMPTS = 8
const WINDOW_MS = 15 * 60 * 1000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const rate = checkIpRateLimit(request, "offer_verify", MAX_ATTEMPTS, WINDOW_MS)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز عدد المحاولات المسموح. حاول بعد قليل." },
      { status: 429 },
    )
  }

  const { token } = await params
  const body = (await request.json().catch(() => ({}))) as { password?: string }

  const offer = await getOfferByToken(token)
  if (!offer || !offer.published) {
    return NextResponse.json({ error: "هذا العرض غير متاح" }, { status: 404 })
  }

  if (offer.password_hash) {
    const ok = await verifyOfferPassword(String(body.password ?? ""), offer.password_hash)
    if (!ok) {
      return NextResponse.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 })
    }
  }

  await recordOfferView(token)
  const company_name = await getOfferCompanyName(offer.lead_id)
  const publicOffer: PublicPartnershipOffer = {
    title: offer.title,
    intro: offer.intro,
    body: offer.body,
    packages: offer.packages,
    validity_note: offer.validity_note,
    contact_email: offer.contact_email,
    company_name,
  }
  return NextResponse.json({ offer: publicOffer })
}
