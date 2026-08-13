/**
 * The company's reply to an offer. PUBLIC — no admin session behind it, so
 * every guard the newsletter endpoint uses applies here too, plus two this one
 * needs on its own.
 *
 * ── THE PASSWORD GATE, AND WHY IT IS SHAPED THIS WAY ───────────────────────
 * The brief asked to reuse "whatever `verify` uses to prove the offer was
 * opened". Measured: THERE IS NO SUCH MECHANISM. `verify` checks the password,
 * returns the offer JSON, and sets no cookie and issues no token — nothing
 * about that request survives it. So there was no existing session to reuse,
 * and inventing one (a signed cookie, a server-side unlock table) would be a
 * second auth mechanism next to the one that already exists.
 *
 * The smaller answer, and the one taken here: a gated offer requires THE SAME
 * PASSWORD on this request, checked with the SAME `verifyOfferPassword()` the
 * verify route calls. It is one mechanism used at two endpoints rather than
 * two mechanisms. The client already holds the password from unlocking, so it
 * costs the partner nothing, and the endpoint is not reachable by anyone who
 * does not know it.
 *
 * ── WHAT THE CALLER MAY NOT DECIDE ─────────────────────────────────────────
 * `status` and `internal_note` are not read from the body at any point. They
 * are Khaled's columns; a reply arrives as `new` and only the admin moves it.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateMutation } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { stripHtml } from "@/lib/sanitize"
import { validateEmail } from "@/lib/validation/forms"
import { getOfferByToken, verifyOfferPassword } from "@/lib/partnership-offers"
import { createOfferResponse } from "@/lib/offer-responses"

/** Five replies an hour per IP. A negotiation is not a high-frequency activity. */
const MAX_SUBMISSIONS = 5
const WINDOW_MS = 60 * 60 * 1000

const LIMITS = {
  NAME: 120,
  EMAIL: 200,
  JOB_TITLE: 120,
  NOTES: 2000,
} as const

/** Trim, strip any markup, and cap. Returns "" for anything that isn't a string. */
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  return stripHtml(v).slice(0, max).trim()
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // CSRF: same origin + the custom header, exactly as /api/newsletter.
  const csrfError = validateMutation(request)
  if (csrfError) return csrfError

  const rate = checkIpRateLimit(request, "offer_respond", MAX_SUBMISSIONS, WINDOW_MS)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "تم استلام عدة طلبات منك. يرجى المحاولة بعد قليل." },
      { status: 429 },
    )
  }

  const { token } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const offer = await getOfferByToken(token)
  // Unknown token or an unpublished draft — the same answer, so this endpoint
  // cannot be used to discover which tokens exist.
  if (!offer || !offer.published) {
    return NextResponse.json({ error: "هذا العرض غير متاح" }, { status: 404 })
  }

  // A gated offer stays gated here. See the header comment.
  if (offer.password_hash) {
    const ok = await verifyOfferPassword(String(body.password ?? ""), offer.password_hash)
    if (!ok) {
      return NextResponse.json({ error: "انتهت الجلسة — افتح العرض من جديد" }, { status: 401 })
    }
  }

  // They SELECT a package, they do not compose one. Matching against the names
  // this offer actually carries is what stops a reply arriving for a season at
  // a single-episode rate.
  const selected = clean(body.selected_package, 300)
  const known = offer.packages.map((p) => p.name)
  if (!selected || !known.includes(selected)) {
    return NextResponse.json({ error: "اختر إحدى الباقات المعروضة" }, { status: 400 })
  }

  // The figure is optional — a reply may accept the price and only ask a
  // question. If it IS given it must be a real positive number: "" , "abc",
  // NaN, Infinity, 0 and negatives are all rejected rather than coerced.
  let proposedAmount: number | null = null
  const rawAmount = body.proposed_amount
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== "") {
    const n = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount).trim())
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "المبلغ المقترح يجب أن يكون رقمًا أكبر من صفر" }, { status: 400 })
    }
    // AND AN UPPER BOUND, because the column has one.
    //
    // `numeric(10,3)` cannot hold 10^7 or more. Without this check the value
    // sailed through validation and Postgres raised `numeric field overflow`
    // deep inside the insert — an uncaught 22003 that reached the partner as
    // **HTTP 500 with an empty body**, so a company that typed one zero too
    // many saw «تعذّر إرسال ردّكم» and no reason at all. Measured: 9,999,999.999
    // succeeds and 10,000,000 did not.
    //
    // The rule any validator here has to follow: a bound the DATABASE enforces
    // must be enforced by the API too, or the database's error becomes the
    // user's error message.
    // Three decimals: the dinar's precision, and the column's. ROUNDED FIRST,
    // then bounded — checking the raw value would pass 9,999,999.9995, which
    // rounds UP to exactly 10,000,000 on the way to the insert and overflows
    // anyway. The value that must satisfy the column is the value being stored.
    proposedAmount = Math.round(n * 1000) / 1000
    if (proposedAmount >= 10_000_000) {
      return NextResponse.json(
        { error: "المبلغ المقترح كبير جدًا — تأكّدوا من عدد الأصفار" },
        { status: 400 },
      )
    }
  }

  // Who replied. The link travels inside a company, so without these two
  // «الشركة ردّت» is not a fact the system holds.
  const responderName = clean(body.responder_name, LIMITS.NAME)
  if (!responderName) {
    return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 })
  }
  const responderEmail = clean(body.responder_email, LIMITS.EMAIL).toLowerCase()
  const emailCheck = validateEmail(responderEmail)
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 })
  }

  const response = await createOfferResponse({
    offer_id: offer.id,
    selected_package: selected,
    proposed_amount: proposedAmount,
    notes: clean(body.notes, LIMITS.NOTES) || null,
    responder_name: responderName,
    responder_email: responderEmail,
    responder_job_title: clean(body.responder_job_title, LIMITS.JOB_TITLE) || null,
  })
  if (!response) {
    return NextResponse.json({ error: "تعذّر إرسال ردّكم. حاول مرة أخرى." }, { status: 500 })
  }

  // A reply is a stronger signal than the view that is already logged beside
  // it. Imported inline to avoid the CRM↔offers import cycle, as in
  // `recordOfferView()`.
  try {
    const { logActivity } = await import("@/lib/partnership-crm/activities")
    await logActivity(offer.lead_id, {
      type: "offer_responded",
      summary: proposedAmount
        ? `ردّ الشريك على العرض — «${selected}» باقتراح ${proposedAmount} د.ك`
        : `ردّ الشريك على العرض — «${selected}» دون اقتراح سعر`,
      actor: "public",
      metadata: {
        offer_id: offer.id,
        response_id: response.id,
        selected_package: selected,
        proposed_amount: proposedAmount,
        responder_email: responderEmail,
      },
    })
  } catch {
    // The reply is saved; a timeline entry failing must not tell the partner
    // their submission was lost.
  }

  return NextResponse.json({ success: true })
}
