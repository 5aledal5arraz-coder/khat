/**
 * The four claims the negotiation screen makes.
 *
 *  1. Once a reply exists, the FULL EDITOR IS FOLDED — and it is folded on the
 *     server, closed, not merely collapsed by JS after paint.
 *  2. With no reply, it is the screen, exactly as before.
 *  3. The internal note NEVER reaches `/offer/<token>` — not the built payload,
 *     not the rendered HTML.
 *  4. «ردّ خط» DOES reach it.
 *
 * ── 3 AND 4 ARE ONE TEST, NOT TWO ──────────────────────────────────────────
 * A page that rendered nothing at all would satisfy claim 3 forever. So the
 * private note and the public reply are pushed through the SAME call with the
 * SAME shape, and the assertions run in opposite directions: the note must be
 * absent, the reply must be present. Only a page that actually distinguishes
 * them can pass both.
 *
 * The strings are deliberately unmistakable — a real note reads like an offer
 * body, and «سقفنا 2400» appearing on a partner's screen would be indexed as
 * "some price text" by a lazier assertion.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi, beforeEach } from "vitest"
import type { OfferCounter, OfferResponse, PartnershipOffer } from "@/types/database"

// ── The strings the whole file turns on ──────────────────────────────────────
const SECRET_NOTE = "سقفنا الحقيقي 2400 ولا تنزل تحته"
const PUBLIC_REPLY = "نستطيع 2500 د.ك للموسم كاملاً"

const OFFER: PartnershipOffer = {
  id: "offer-1",
  lead_id: "lead-1",
  token: "offer-token-1",
  title: "عرض شراكة",
  intro: null,
  body: null,
  packages: [
    { name: "الباقة الموسمية", description: "الموسم كاملاً", price_range: "2,750 د.ك للموسم (10 حلقات)", deliverables: [] },
  ],
  validity_note: null,
  contact_email: "hello@khatpodcast.com",
  password_hash: null,
  published: true,
  view_count: 4,
  last_viewed_at: null,
  sent_at: "2026-08-10T09:00:00.000Z",
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
}

const RESPONSE: OfferResponse = {
  id: "resp-1",
  offer_id: "offer-1",
  selected_package: "الباقة الموسمية",
  proposed_amount: 2000,
  proposed_currency: "KWD",
  notes: "الميزانية هذا الربع محدودة.",
  responder_name: "سالم العلي",
  responder_email: "salem@example.com",
  responder_job_title: "مدير التسويق",
  status: "reviewed",
  internal_note: SECRET_NOTE,
  created_at: "2026-08-11T09:00:00.000Z",
  updated_at: "2026-08-11T09:00:00.000Z",
}

const COUNTER: OfferCounter = {
  id: "counter-1",
  offer_id: "offer-1",
  response_id: "resp-1",
  message: PUBLIC_REPLY,
  counter_amount: 2500,
  counter_currency: "KWD",
  author_admin_id: "admin-1",
  author_name: "خالد",
  created_at: "2026-08-12T09:00:00.000Z",
}

// ── Mocks: everything the admin page reaches for, and nothing else ───────────
const listOfferResponses = vi.fn(async () => [RESPONSE])
const listOfferCounters = vi.fn(async () => [COUNTER])
const listOfferCountersByResponse = vi.fn(async () => new Map([["resp-1", [COUNTER]]]))

vi.mock("@/lib/api-utils", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", email: "k@khat.local", role: "OWNER" })),
}))
vi.mock("@/lib/admin/queries", () => ({
  getSponsorshipLeadById: vi.fn(async () => ({
    id: "lead-1",
    company_name: "شركة المستقبل",
    email: "contact@future.example",
    contact_name: "سالم العلي",
  })),
}))
// PARTIAL on purpose: `getOfferByLead` is stubbed so the page has an offer to
// render, but `buildPublicOffer` — the whitelist this file is here to test — is
// the real one. Mocking the module wholesale would have the leak test asserting
// against a fixture instead of against the code.
vi.mock("@/lib/partnership-offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/partnership-offers")>()),
  getOfferByLead: vi.fn(async () => OFFER),
  getOfferCompanyName: vi.fn(async () => "شركة المستقبل"),
}))
vi.mock("@/lib/offer-responses", () => ({ listOfferResponses }))
vi.mock("@/lib/offer-counters", () => ({
  listOfferCounters,
  listOfferCountersByResponse,
  COUNTER_AMOUNT_CEILING: 10_000_000,
}))

beforeEach(() => {
  listOfferResponses.mockResolvedValue([RESPONSE])
  listOfferCounters.mockResolvedValue([COUNTER])
})

/** The admin screen, rendered exactly as the server would emit it. */
async function adminHtml(): Promise<string> {
  // Imported inside so the mocks above are in place first.
  const { default: OfferEditorPage } = await import("@/app/admin/offers/[leadId]/page")
  const element = await OfferEditorPage({ params: Promise.resolve({ leadId: "lead-1" }) })
  return renderToStaticMarkup(element)
}

describe("the full editor folds once a reply exists", () => {
  it("wraps the editor in a CLOSED <details> when there is a reply", async () => {
    const html = await adminHtml()

    // The disclosure is there…
    expect(html).toContain("data-full-editor")
    expect(html).toContain("تعديل العرض كاملاً")

    // …and it is CLOSED. `<details open>` is what a folded-in-name-only
    // implementation emits, and it looks identical in a screenshot taken after
    // hydration. Assert on the attribute, not on the appearance.
    const details = html.match(/<details[^>]*data-full-editor[^>]*>/)![0]
    expect(details).not.toMatch(/\bopen\b/)

    // The editor's own fields are still in the markup — folded, not removed.
    // Losing them would be a different bug wearing this test's green.
    expect(html).toContain("نص العرض")
  })

  it("shows the negotiation screen as the default", async () => {
    const html = await adminHtml()
    expect(html).toContain("التفاوض على العرض")
    expect(html).toContain("ردّ خط")
    // Their figure against ours, with the difference computed.
    expect(html).toContain("2,000 د.ك")
    expect(html).toContain("2,750 د.ك")
    expect(html).toContain("−750 د.ك")
  })

  it("SIGHT: with NO reply there is no <details> and the editor is the screen", async () => {
    // The control. Only one input changes — the reply list — so a `<details>`
    // that never rendered under any condition cannot pass both halves.
    listOfferResponses.mockResolvedValue([])
    listOfferCounters.mockResolvedValue([])

    const html = await adminHtml()
    expect(html).not.toContain("data-full-editor")
    expect(html).not.toContain("تعديل العرض كاملاً")
    expect(html).toContain("صفحة العرض")
    expect(html).toContain("نص العرض")
  })
})

describe("the internal note stops at the admin, and our reply does not", () => {
  it("builds a public payload holding the reply and NOT the note", async () => {
    const { buildPublicOffer } = await import("@/lib/partnership-offers")
    const publicOffer = await buildPublicOffer(OFFER)

    // Serialised, because this object is what crosses the wire to the browser —
    // a leak hiding in a nested field is still a leak.
    const wire = JSON.stringify(publicOffer)

    expect(wire).not.toContain(SECRET_NOTE)
    expect(wire).not.toContain("internal_note")
    // `status` is Khaled's read on the reply. «مرفوض» is not something to send
    // to the company that sent it.
    expect(wire).not.toContain("reviewed")
    // Nor the colleague's address.
    expect(wire).not.toContain("salem@example.com")

    // SIGHT, same call: the payload is not simply empty.
    expect(wire).toContain(PUBLIC_REPLY)
    expect(publicOffer.exchanges).toHaveLength(1)
    expect(publicOffer.exchanges[0].counters[0].counter_amount).toBe(2500)
    expect(publicOffer.exchanges[0].responder_name).toBe("سالم العلي")
  })

  it("renders the reply on the public page and never the note", async () => {
    const { buildPublicOffer } = await import("@/lib/partnership-offers")
    const { OfferClient } = await import("@/app/offer/[token]/offer-client")
    const publicOffer = await buildPublicOffer(OFFER)

    const html = renderToStaticMarkup(
      createElement(OfferClient, {
        token: "offer-token-1",
        requiresPassword: false,
        initialOffer: publicOffer,
      }),
    )

    expect(html).not.toContain(SECRET_NOTE)
    // SIGHT: the conversation rendered at all.
    expect(html).toContain(PUBLIC_REPLY)
    expect(html).toContain("سجلّ المحادثة")
    expect(html).toContain("2,500 د.ك")
  })
})

describe("our reply is a message, not an amendment", () => {
  it("leaves the offer's packages untouched", async () => {
    // The counter names 2,500. The published package still says 2,750 — on the
    // admin screen and on the partner's page both. A conversation does not
    // rewrite a contract; Khaled edits the offer by hand or it does not change.
    const { buildPublicOffer } = await import("@/lib/partnership-offers")
    const publicOffer = await buildPublicOffer(OFFER)

    expect(publicOffer.packages[0].price_range).toBe("2,750 د.ك للموسم (10 حلقات)")
    expect(publicOffer.exchanges[0].counters[0].counter_amount).toBe(2500)

    // And the in-memory offer object was not mutated on the way through.
    expect(OFFER.packages[0].price_range).toBe("2,750 د.ك للموسم (10 حلقات)")

    const html = await adminHtml()
    expect(html).toContain("2,750 د.ك")
  })
})
