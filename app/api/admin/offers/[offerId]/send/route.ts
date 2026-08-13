/**
 * POST /api/admin/offers/<offerId>/send — email the offer link to the company.
 *
 * This closes the only manual step left in the offer flow: until now the system
 * stopped at "published", Khaled copied the secret link out of the sidebar and
 * mailed it himself, and nothing in the record knew whether he had. An offer
 * that was published and never sent looked exactly like one that was sent and
 * ignored — same zero view count, same silence.
 *
 * Three things this route refuses to do:
 *  • send an UNPUBLISHED offer — /offer/<token> 404s until `published`, so that
 *    mail would deliver a dead link to a real company;
 *  • take the recipient from the request — it reads `sponsorship_leads.email`.
 *    (`offers.contact_email` is OUR reply address on the offer page, not
 *    theirs; a hand-typed field is how the wrong company gets the wrong offer);
 *  • record `sent_at` on a send the provider did not accept — see
 *    `sendPartnershipOffer`, which throws instead of resolving on a refusal.
 *
 * A resend requires `confirm_resend: true`. The UI asks twice, but a dialog
 * lives in the browser; a double-submitted or replayed request must hit a real
 * gate, not a remembered click.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { getSponsorshipLeadById } from "@/lib/admin/queries"
import { getOfferById, markOfferSent } from "@/lib/partnership-offers"
import { sendPartnershipOffer } from "@/lib/email/send"
import { logActivity } from "@/lib/partnership-crm"
import { validateEmail } from "@/lib/validation/forms"
import { APP_URL } from "@/lib/email/resend"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  // Mailing an outside company is not an editor-level act.
  const authError = await requireAdminAPI("ADMIN")
  if (authError) return authError

  const { offerId } = await params
  const offer = await getOfferById(offerId)
  if (!offer) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 })

  if (!offer.published) {
    return NextResponse.json(
      { error: "العرض غير منشور — انشره أولاً، وإلا وصل الشريك رابطاً معطّلاً" },
      { status: 409 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (offer.sent_at && body.confirm_resend !== true) {
    return NextResponse.json(
      { error: "سبق إرسال هذا العرض — أكّد الإرسال مرة أخرى", sent_at: offer.sent_at },
      { status: 409 },
    )
  }

  const lead = await getSponsorshipLeadById(offer.lead_id)
  if (!lead) return NextResponse.json({ error: "طلب الشراكة غير موجود" }, { status: 404 })

  const recipient = (lead.email ?? "").trim()
  const emailCheck = validateEmail(recipient)
  if (!emailCheck.valid) {
    return NextResponse.json(
      { error: `بريد جهة الاتصال غير صالح — ${emailCheck.error}` },
      { status: 400 },
    )
  }

  const user = await getAdminAuthUser()

  try {
    await sendPartnershipOffer(recipient, {
      companyName: lead.company_name,
      contactName: lead.contact_name || "فريق الشراكات",
      offerUrl: `${APP_URL}/offer/${offer.token}`,
      // The gate is announced; the key is not carried. See partnershipOfferHtml.
      passwordProtected: Boolean(offer.password_hash),
    })
  } catch (error: unknown) {
    console.error("Failed to send partnership offer:", error)
    // No `sent_at`, no timeline entry: the record must not claim a delivery
    // that did not happen, or Khaled will never know to resend.
    return NextResponse.json(
      { error: "فشل إرسال البريد — لم يُرسل شيء. حاول مرة أخرى." },
      { status: 502 },
    )
  }

  const sentAt = await markOfferSent(offer.id)

  await logActivity(offer.lead_id, {
    type: "offer_sent",
    summary: offer.sent_at
      ? `أُعيد إرسال العرض إلى ${recipient}`
      : `أُرسل العرض إلى ${recipient}`,
    actor: user ? `admin:${user.email}` : "admin",
    metadata: {
      offer_id: offer.id,
      to_email: recipient,
      resend: Boolean(offer.sent_at),
      password_protected: Boolean(offer.password_hash),
    },
  })

  return NextResponse.json({ success: true, sent_at: sentAt, to: recipient })
}
