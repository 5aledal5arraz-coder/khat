/**
 * `POST /api/admin/offers/<id>/send` end to end, against the REAL database.
 *
 * ── WHAT THIS ADDS OVER `offer-send-route.test.ts` ─────────────────────────
 * That file mocks the data layer, so its strongest claim is "`markOfferSent`
 * was called". A call is not a column. The two facts Khaled actually needs are
 * that the stamp LANDS IN POSTGRES, and that it DOES NOT MOVE when the send
 * fails — because a `sent_at` written on a refused message is worse than no
 * feature at all: it tells him the partner has the offer when nobody does, and
 * he never resends.
 *
 * So here the route runs against real rows: real `partnership_offers`, real
 * `sponsorship_leads`, real `crm_activities`. Every assertion reads back
 * through `pool.query`, PAST the ORM — a column Drizzle stopped projecting, or
 * a write that silently went nowhere, cannot hide behind the mapper.
 *
 * ── ONLY TWO THINGS ARE FAKE, AND BOTH ON PURPOSE ─────────────────────────
 * `getResend` (nothing may leave the building) and the admin session (there is
 * no cookie in a test process). Everything between them is production code.
 *
 * Seeds one lead and two offers, deletes exactly those, and asserts the
 * deletion left nothing behind.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { Pool } from "pg"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()

const sendSpy = vi.fn()
vi.mock("@/lib/email/resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/resend")>()
  return { ...actual, getResend: () => ({ emails: { send: sendSpy } }) }
})
vi.mock("@/lib/api-utils", () => ({
  requireAdminAPI: vi.fn(async () => null),
  getAdminAuthUser: vi.fn(async () => ({ email: "khaled@khatpodcast.com" })),
}))

const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-send-${Date.now()}`
const LEAD_ID = `${TAG}-lead`
const LIVE_ID = `${TAG}-offer-live`
const DRAFT_ID = `${TAG}-offer-draft`
const LEAD_EMAIL = "partner@sharika.example"

let pool: Pool
let POST: typeof import("@/app/api/admin/offers/[offerId]/send/route")["POST"]

async function post(offerId: string, body: Record<string, unknown> = {}) {
  const res = await POST(
    new Request(`http://localhost/api/admin/offers/${offerId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ offerId }) },
  )
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

/** `sent_at` straight from the table — no ORM, no mapper, no cache. */
async function sentAtInDb(offerId: string): Promise<string | null> {
  const { rows } = await pool.query(`select sent_at from partnership_offers where id = $1`, [offerId])
  return rows[0].sent_at ? new Date(rows[0].sent_at).toISOString() : null
}

const activities = async () =>
  (await pool.query(
    `select type, summary, actor, metadata from crm_activities
      where subject_id = $1 order by created_at asc`,
    [LEAD_ID],
  )).rows

d("POST /api/admin/offers/[offerId]/send — real database", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(
      `insert into sponsorship_leads
         (id, company_name, industry, contact_name, job_title, email, phone, main_goal, target_audience, budget_range)
       values ($1,'شركة المستقبل','إعلام','سالم العلي','مدير التسويق',$2,'+96500000000','اختبار','عام','—')`,
      [LEAD_ID, LEAD_EMAIL],
    )
    for (const [id, token, published] of [
      [LIVE_ID, `${TAG}-token-live`, true],
      [DRAFT_ID, `${TAG}-token-draft`, false],
    ] as const) {
      await pool.query(
        `insert into partnership_offers (id, lead_id, token, title, packages, published, contact_email)
         values ($1,$2,$3,'عرض اختبار','[]'::jsonb,$4,'hello@khatpodcast.com')`,
        [id, LEAD_ID, token, published],
      )
    }
    POST = (await import("@/app/api/admin/offers/[offerId]/send/route")).POST
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query(`delete from crm_activities where subject_id = $1`, [LEAD_ID])
    await pool.query(`delete from partnership_offers where id = any($1)`, [[LIVE_ID, DRAFT_ID]])
    await pool.query(`delete from sponsorship_leads where id = $1`, [LEAD_ID])
    // The cleanup is itself checked — a silent failure here would leak rows
    // into Khaled's database and no assertion would ever mention it.
    const { rows } = await pool.query(
      `select
         (select count(*)::int from partnership_offers where lead_id = $1) as offers,
         (select count(*)::int from crm_activities where subject_id = $1) as acts,
         (select count(*)::int from sponsorship_leads where id = $1) as leads`,
      [LEAD_ID],
    )
    expect(rows[0]).toEqual({ offers: 0, acts: 0, leads: 0 })
    await pool.end()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    sendSpy.mockResolvedValue({ data: { id: "resend-msg-1" }, error: null })
    await pool.query(`update partnership_offers set sent_at = null where id = any($1)`, [[LIVE_ID, DRAFT_ID]])
    await pool.query(`delete from crm_activities where subject_id = $1`, [LEAD_ID])
  })

  // ── The stamp lands in the column ─────────────────────────────────────────
  it("writes sent_at into Postgres, and the row proves it", async () => {
    expect(await sentAtInDb(LIVE_ID)).toBeNull()

    const before = Date.now()
    const res = await post(LIVE_ID)
    expect(res.status).toBe(200)

    const stored = await sentAtInDb(LIVE_ID)
    expect(stored).not.toBeNull()
    // A real clock reading, not a placeholder: within a minute of this test.
    const drift = Math.abs(new Date(stored!).getTime() - before)
    expect(drift).toBeLessThan(60_000)
    // And what the caller was told matches what the table holds.
    expect(res.json.sent_at).toBe(stored)
  })

  it("writes the offer_sent event beside it, naming the address it went to", async () => {
    await post(LIVE_ID)
    const rows = await activities()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("offer_sent")
    expect(rows[0].summary).toContain(LEAD_EMAIL)
    expect(rows[0].actor).toBe("admin:khaled@khatpodcast.com")
    expect(rows[0].metadata.to_email).toBe(LEAD_EMAIL)
  })

  it("mails the lead's address and nothing else", async () => {
    await post(LIVE_ID)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    const payload = sendSpy.mock.calls[0][0] as Record<string, unknown>
    expect(payload.to).toBe(LEAD_EMAIL)
    // The offer's own contact_email is OUR reply address, not a recipient.
    expect(payload.to).not.toBe("hello@khatpodcast.com")
    expect(payload.replyTo).toBe("hello@khatpodcast.com")
  })

  // ── And it does not move when the send fails ──────────────────────────────
  describe("a failed send leaves the record exactly as it was", () => {
    it("leaves sent_at NULL when the provider refuses a first send", async () => {
      sendSpy.mockResolvedValue({ data: null, error: { message: "domain is not verified", name: "validation_error" } })
      const res = await post(LIVE_ID)
      expect(res.status).toBe(502)
      // The column, read from the table: still nothing.
      expect(await sentAtInDb(LIVE_ID)).toBeNull()
      expect(await activities()).toHaveLength(0)
    })

    it("leaves an EARLIER sent_at untouched when a resend fails", async () => {
      // The nastier half. An offer sent last week, resent today, refused today:
      // the old stamp must survive unchanged — neither advanced (a lie) nor
      // cleared (losing the fact that it did go out once).
      const original = "2026-08-01T08:30:00.000Z"
      await pool.query(`update partnership_offers set sent_at = $2 where id = $1`, [LIVE_ID, original])

      sendSpy.mockRejectedValue(new Error("ECONNRESET"))
      const res = await post(LIVE_ID, { confirm_resend: true })
      expect(res.status).toBe(502)
      expect(await sentAtInDb(LIVE_ID)).toBe(original)
      expect(await activities()).toHaveLength(0)
    })

    it("SIGHT: the identical resend DOES move the stamp when the provider accepts", async () => {
      // Same request, same row, one thing different — the provider's answer.
      // Without this pair the two tests above could be passing because the
      // route never writes `sent_at` at all.
      const original = "2026-08-01T08:30:00.000Z"
      await pool.query(`update partnership_offers set sent_at = $2 where id = $1`, [LIVE_ID, original])

      const res = await post(LIVE_ID, { confirm_resend: true })
      expect(res.status).toBe(200)
      const moved = await sentAtInDb(LIVE_ID)
      expect(moved).not.toBe(original)
      expect(new Date(moved!).getTime()).toBeGreaterThan(new Date(original).getTime())
      const rows = await activities()
      expect(rows[0].summary).toContain("أُعيد إرسال")
    })
  })

  // ── An unpublished offer is never mailed ──────────────────────────────────
  describe("the draft offer", () => {
    it("is refused, sends nothing, and is not stamped", async () => {
      const res = await post(DRAFT_ID)
      expect(res.status).toBe(409)
      expect(sendSpy).not.toHaveBeenCalled()
      expect(await sentAtInDb(DRAFT_ID)).toBeNull()
      expect(await activities()).toHaveLength(0)
    })

    it("SIGHT: the identical request goes through once the row is published", async () => {
      // One column flipped in the database — nothing else about the request
      // changes. If this fails, the 409 above was not about `published`.
      await pool.query(`update partnership_offers set published = true where id = $1`, [DRAFT_ID])
      try {
        const res = await post(DRAFT_ID)
        expect(res.status).toBe(200)
        expect(await sentAtInDb(DRAFT_ID)).not.toBeNull()
      } finally {
        await pool.query(`update partnership_offers set published = false, sent_at = null where id = $1`, [DRAFT_ID])
      }
    })
  })

  // ── Sending twice is a decision ───────────────────────────────────────────
  it("refuses an unconfirmed resend without touching the existing stamp", async () => {
    const original = "2026-08-01T08:30:00.000Z"
    await pool.query(`update partnership_offers set sent_at = $2 where id = $1`, [LIVE_ID, original])

    const res = await post(LIVE_ID)
    expect(res.status).toBe(409)
    expect(sendSpy).not.toHaveBeenCalled()
    expect(await sentAtInDb(LIVE_ID)).toBe(original)
  })
})
