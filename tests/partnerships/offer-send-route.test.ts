/**
 * `POST /api/admin/offers/<id>/send` — the button that mails the offer.
 *
 * ── WHERE THE SEAM IS ──────────────────────────────────────────────────────
 * Only `getResend()` is replaced. Everything above it is the real thing: the
 * real route, the real `sendPartnershipOffer`, the real `partnershipOfferHtml`.
 * So the payload captured here is the actual message that would have left the
 * building — recipient, subject, replyTo and body — and NOT a restatement of
 * what the test hoped the template would do. Nothing reaches api.resend.com;
 * `emails.send` is a spy.
 *
 * The database is mocked because the two facts worth checking about it are
 * "`markOfferSent` was called" and "it was NOT called" — call-or-not, which a
 * spy represents exactly. That the column exists and round-trips is a separate,
 * unmockable claim; it lives in `offer-sent-at-db.test.ts` against Postgres.
 *
 * ── EVERY REFUSAL IS PAIRED WITH THE PROOF IT SEES ─────────────────────────
 * A 409 on its own cannot tell "the publish guard fired" from "the request was
 * malformed". So each refusal is run twice: once offending, once with ONLY the
 * offending fact corrected — and the second run must succeed. Same for the
 * absence assertions: the detector that finds no password in the body is fed a
 * body with one spliced in, and must fire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── The send layer, replaced ────────────────────────────────────────────────
const sendSpy = vi.fn()
vi.mock("@/lib/email/resend", () => ({
  getResend: () => ({ emails: { send: sendSpy } }),
  FROM_DISPLAY: "بودكاست خط <noreply@khatpodcast.com>",
  REPLY_TO: "hello@khatpodcast.com",
  APP_URL: "https://khatpodcast.com",
  FROM_EMAIL: "noreply@khatpodcast.com",
  WEBHOOK_SECRET: "",
}))

vi.mock("@/lib/api-utils", () => ({
  requireAdminAPI: vi.fn(async () => null),
  getAdminAuthUser: vi.fn(async () => ({ email: "khaled@khatpodcast.com" })),
}))
vi.mock("@/lib/admin/queries", () => ({ getSponsorshipLeadById: vi.fn() }))
vi.mock("@/lib/partnership-offers", () => ({
  getOfferById: vi.fn(),
  markOfferSent: vi.fn(async () => "2026-08-13T10:00:00.000Z"),
}))
vi.mock("@/lib/partnership-crm", () => ({ logActivity: vi.fn(async () => {}) }))

import { requireAdminAPI } from "@/lib/api-utils"
import { getSponsorshipLeadById } from "@/lib/admin/queries"
import { getOfferById, markOfferSent } from "@/lib/partnership-offers"
import { logActivity } from "@/lib/partnership-crm"
import { POST } from "@/app/api/admin/offers/[offerId]/send/route"

const OFFER_ID = "offer-row-1"
const LEAD_EMAIL = "partner@sharika.example"
/** OUR reply address on the offer page — never a recipient. */
const OUR_CONTACT_EMAIL = "hello@khatpodcast.com"
const PASSWORD = "correct-horse-battery-staple"
/** A real bcrypt shape; the value is what must never appear in the mail. */
const PASSWORD_HASH = "$2a$12$abcdefghijklmnopqrstuvQWERTYUIOPasdfghjklZXCVBNMqwerty"

function offer(over: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    lead_id: "lead-1",
    token: "offer-deadbeefdeadbeef",
    title: "عرض شراكة",
    intro: null,
    body: "نص العرض",
    packages: [],
    validity_note: null,
    contact_email: OUR_CONTACT_EMAIL,
    password_hash: null,
    published: true,
    view_count: 0,
    last_viewed_at: null,
    sent_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...over,
  }
}

function lead(over: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    company_name: "شركة المستقبل",
    contact_name: "سالم العلي",
    email: LEAD_EMAIL,
    ...over,
  }
}

/** The object literal handed to `emails.send` on the last call. */
function payload() {
  expect(sendSpy).toHaveBeenCalled()
  return sendSpy.mock.calls.at(-1)![0] as Record<string, unknown>
}

async function post(body: Record<string, unknown> = {}) {
  const res = await POST(
    new Request(`http://localhost/api/admin/offers/${OFFER_ID}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ offerId: OFFER_ID }) },
  )
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  sendSpy.mockResolvedValue({ data: { id: "resend-msg-1" }, error: null })
  vi.mocked(requireAdminAPI).mockResolvedValue(null)
  vi.mocked(getOfferById).mockResolvedValue(offer() as never)
  vi.mocked(getSponsorshipLeadById).mockResolvedValue(lead() as never)
  vi.mocked(markOfferSent).mockResolvedValue("2026-08-13T10:00:00.000Z")
})

// ── The offer has to be live before anyone is told to open it ────────────────
describe("an unpublished offer is never mailed", () => {
  it("refuses, and sends nothing", async () => {
    vi.mocked(getOfferById).mockResolvedValue(offer({ published: false }) as never)
    const res = await post()
    expect(res.status).toBe(409)
    expect(String(res.json.error)).toContain("غير منشور")
    // The point of the refusal: no message, and no record of one.
    expect(sendSpy).not.toHaveBeenCalled()
    expect(markOfferSent).not.toHaveBeenCalled()
    expect(logActivity).not.toHaveBeenCalled()
  })

  it("SIGHT: the identical request succeeds once the offer is published", async () => {
    // One field differs from the test above. If this fails, that 409 was about
    // something other than the publish flag.
    const res = await post()
    expect(res.status).toBe(200)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })
})

// ── Who receives it is not a decision anyone gets to make at send time ───────
describe("the recipient is the lead's registered contact, and nothing else", () => {
  it("mails sponsorship_leads.email", async () => {
    await post()
    expect(payload().to).toBe(LEAD_EMAIL)
  })

  it("does NOT mail the offer's contact_email — that address is ours", async () => {
    await post()
    expect(payload().to).not.toBe(OUR_CONTACT_EMAIL)
    // …and ours is where a reply goes instead.
    expect(payload().replyTo).toBe("hello@khatpodcast.com")
  })

  it("ignores a recipient supplied in the request body", async () => {
    await post({ to: "attacker@elsewhere.example", email: "attacker@elsewhere.example" })
    expect(payload().to).toBe(LEAD_EMAIL)
  })

  it("SIGHT: the address follows the lead row, so the assertion is not a constant", async () => {
    vi.mocked(getSponsorshipLeadById).mockResolvedValue(lead({ email: "other@company.example" }) as never)
    await post()
    expect(payload().to).toBe("other@company.example")
  })

  it("refuses when the lead has no usable address, rather than mailing nobody", async () => {
    vi.mocked(getSponsorshipLeadById).mockResolvedValue(lead({ email: "   " }) as never)
    const res = await post()
    expect(res.status).toBe(400)
    expect(sendSpy).not.toHaveBeenCalled()
    expect(markOfferSent).not.toHaveBeenCalled()
  })
})

// ── The lock and the key never travel together ───────────────────────────────
describe("the password is absent from the message", () => {
  /** Scans the ENTIRE outgoing payload — body, subject, headers alike. */
  const leaks = (p: unknown) => {
    const flat = JSON.stringify(p)
    return flat.includes(PASSWORD) || flat.includes(PASSWORD_HASH)
  }

  it("carries neither the password nor its hash on a gated offer", async () => {
    vi.mocked(getOfferById).mockResolvedValue(offer({ password_hash: PASSWORD_HASH }) as never)
    const res = await post()
    expect(res.status).toBe(200)

    const p = payload()
    // Guard the guard: the message rendered at all. Without this, an empty
    // body would satisfy the absence check.
    expect(String(p.html)).toContain("https://khatpodcast.com/offer/offer-deadbeefdeadbeef")
    expect(String(p.html)).toContain("شركة المستقبل")

    expect(leaks(p)).toBe(false)
    // …and it says the key comes by another road.
    expect(String(p.html)).toContain("رسالة منفصلة")
  })

  it("SIGHT: the same detector fires when a secret IS spliced into the payload", async () => {
    vi.mocked(getOfferById).mockResolvedValue(offer({ password_hash: PASSWORD_HASH }) as never)
    await post()
    const p = payload()
    // Mutation, one secret at a time — proof the scan above can see either.
    expect(leaks({ ...p, html: `${p.html}<p>${PASSWORD}</p>` })).toBe(true)
    expect(leaks({ ...p, html: `${p.html}<p>${PASSWORD_HASH}</p>` })).toBe(true)
    expect(leaks({ ...p, subject: `${p.subject} ${PASSWORD}` })).toBe(true)
  })

  it("an ungated offer does not claim a password is coming", async () => {
    await post()
    expect(String(payload().html)).not.toContain("رسالة منفصلة")
    // SIGHT for that absence: the note appears the moment a gate exists.
    vi.mocked(getOfferById).mockResolvedValue(offer({ password_hash: PASSWORD_HASH }) as never)
    await post()
    expect(String(payload().html)).toContain("رسالة منفصلة")
  })
})

// ── A failure the operator can see ───────────────────────────────────────────
describe("a refused send is reported, never swallowed", () => {
  it("surfaces the failure when Resend RESOLVES with an error", async () => {
    // The trap this exists for: the SDK does not reject on an API error, it
    // resolves with `{ data: null, error }`. A try/catch alone reads that as
    // success and stamps a delivery that never happened.
    sendSpy.mockResolvedValue({ data: null, error: { message: "domain is not verified", name: "validation_error" } })
    const res = await post()
    expect(res.status).toBe(502)
    expect(String(res.json.error)).toContain("لم يُرسل شيء")
    expect(res.json.success).toBeUndefined()
    expect(markOfferSent).not.toHaveBeenCalled()
    expect(logActivity).not.toHaveBeenCalled()
  })

  it("surfaces a thrown transport failure the same way", async () => {
    sendSpy.mockRejectedValue(new Error("ECONNRESET"))
    const res = await post()
    expect(res.status).toBe(502)
    expect(markOfferSent).not.toHaveBeenCalled()
  })

  it("SIGHT: the identical request reports success when the provider accepts it", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(res.json.success).toBe(true)
  })
})

// ── What the record learns ───────────────────────────────────────────────────
describe("a successful send is written down", () => {
  it("stamps sent_at and logs offer_sent with the address it went to", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(markOfferSent).toHaveBeenCalledWith(OFFER_ID)
    expect(res.json.sent_at).toBe("2026-08-13T10:00:00.000Z")

    expect(logActivity).toHaveBeenCalledTimes(1)
    const [leadId, entry] = vi.mocked(logActivity).mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(leadId).toBe("lead-1")
    expect(entry.type).toBe("offer_sent")
    expect(String(entry.summary)).toContain(LEAD_EMAIL)
    expect(entry.actor).toBe("admin:khaled@khatpodcast.com")
    expect((entry.metadata as Record<string, unknown>).to_email).toBe(LEAD_EMAIL)
  })
})

// ── Sending twice is a decision, not an accident ─────────────────────────────
describe("a resend needs its own acknowledgement", () => {
  it("refuses an already-sent offer when the request does not confirm", async () => {
    vi.mocked(getOfferById).mockResolvedValue(offer({ sent_at: "2026-08-10T09:00:00.000Z" }) as never)
    const res = await post()
    expect(res.status).toBe(409)
    expect(res.json.sent_at).toBe("2026-08-10T09:00:00.000Z")
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it("SIGHT: the identical request goes through with confirm_resend", async () => {
    vi.mocked(getOfferById).mockResolvedValue(offer({ sent_at: "2026-08-10T09:00:00.000Z" }) as never)
    const res = await post({ confirm_resend: true })
    expect(res.status).toBe(200)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    // And the timeline says it was a resend, not a first send.
    const [, entry] = vi.mocked(logActivity).mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(String(entry.summary)).toContain("أُعيد إرسال")
  })

  it("a first send needs no acknowledgement", async () => {
    const res = await post()
    expect(res.status).toBe(200)
  })
})

// ── Who may press it ─────────────────────────────────────────────────────────
describe("the endpoint is admin-gated", () => {
  it("returns the auth guard's own response and does nothing else", async () => {
    const { NextResponse } = await import("next/server")
    vi.mocked(requireAdminAPI).mockResolvedValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 }),
    )
    const res = await post()
    expect(res.status).toBe(403)
    expect(sendSpy).not.toHaveBeenCalled()
    expect(getOfferById).not.toHaveBeenCalled()
  })

  it("asks for ADMIN, not the default EDITOR — mailing an outside company is not an edit", async () => {
    await post()
    expect(requireAdminAPI).toHaveBeenCalledWith("ADMIN")
  })
})
