/**
 * «ردّ خط» — append OUR answer to one company reply.
 *
 * ── THIS ENDPOINT PUBLISHES ────────────────────────────────────────────────
 * Unlike its sibling `PATCH .../responses/[responseId]`, which writes two
 * columns nobody outside the admin will ever see, everything written here is
 * rendered on `/offer/<token>` the moment it is saved. There is no draft state
 * and no delete: the partner may be looking at the page. That is the reason the
 * UI confirms before calling this, and the reason `message` is required — an
 * amount with no sentence beside it is a number appearing on a partner's screen
 * with no explanation.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 * It does not touch `partnership_offers`. Naming a counter-price is a message,
 * not an amendment to the published packages; the offer changes only when
 * Khaled edits it by hand. Nothing below imports `updateOffer`.
 *
 * It also never writes `internal_note`. The private note and the public answer
 * are different tables — see `lib/db/schema/offer-counters.ts` — so a mistake
 * here cannot leak one as the other.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { resolveMemberName } from "@/lib/admin/team-identity"
import { getOfferResponseById } from "@/lib/offer-responses"
import { getOfferById } from "@/lib/partnership-offers"
import { createOfferCounter, COUNTER_AMOUNT_CEILING } from "@/lib/offer-counters"

const MESSAGE_MAX = 2000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string; responseId: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { offerId, responseId } = await params

  const existing = await getOfferResponseById(responseId)
  if (!existing) return NextResponse.json({ error: "الردّ غير موجود" }, { status: 404 })
  // The reply must belong to the offer in the path, exactly as in the PATCH
  // sibling — otherwise the offer id is decoration and any admin URL reaches
  // any reply.
  if (existing.offer_id !== offerId) {
    return NextResponse.json({ error: "الردّ غير موجود" }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const message = typeof body.message === "string" ? stripHtml(body.message).slice(0, MESSAGE_MAX).trim() : ""
  if (!message) {
    return NextResponse.json({ error: "اكتب نص الردّ" }, { status: 400 })
  }

  // The figure is optional — we may hold the price and only answer a question.
  // Validated exactly like the company's, because it lands in an identical
  // `numeric(10,3)` column: a bound the DATABASE enforces must be enforced here
  // too, or the database's error becomes the operator's error message.
  let counterAmount: number | null = null
  const raw = body.counter_amount
  if (raw !== undefined && raw !== null && raw !== "") {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim())
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "السعر المقابل يجب أن يكون رقمًا أكبر من صفر" }, { status: 400 })
    }
    // Rounded FIRST, then bounded: 9,999,999.9995 passes a raw check and then
    // rounds up to exactly 10,000,000 on the way to the insert.
    counterAmount = Math.round(n * 1000) / 1000
    if (counterAmount >= COUNTER_AMOUNT_CEILING) {
      return NextResponse.json({ error: "السعر المقابل كبير جدًا — تأكّد من عدد الأصفار" }, { status: 400 })
    }
  }

  const user = await getAdminAuthUser()

  const counter = await createOfferCounter({
    offer_id: offerId,
    response_id: responseId,
    message,
    counter_amount: counterAmount,
    author_admin_id: user?.id ?? null,
    author_name: user ? resolveMemberName(user) : null,
  })
  if (!counter) return NextResponse.json({ error: "تعذّر حفظ الردّ" }, { status: 500 })

  // Timeline. Imported inline to avoid the CRM↔offers import cycle, as in
  // `recordOfferView()` and the public respond route.
  try {
    const offer = await getOfferById(offerId)
    if (offer) {
      const { logActivity } = await import("@/lib/partnership-crm/activities")
      await logActivity(offer.lead_id, {
        type: "offer_countered",
        summary: counterAmount
          ? `ردّ خط على «${existing.selected_package}» بسعر مقابل ${counterAmount} د.ك`
          : `ردّ خط على «${existing.selected_package}» دون سعر مقابل`,
        actor: user ? `admin:${user.email}` : "admin",
        metadata: {
          offer_id: offerId,
          response_id: responseId,
          counter_id: counter.id,
          counter_amount: counterAmount,
        },
      })
    }
  } catch {
    // The reply is saved and already visible to the partner; a timeline entry
    // failing must not report it as unsent.
  }

  return NextResponse.json({ counter })
}
