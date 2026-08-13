/**
 * `POST /api/admin/offers/<id>/responses/<id>/counter` — «ردّ خط», against the
 * REAL local database.
 *
 * ── WHY NOT `tests/db-mock.ts` ─────────────────────────────────────────────
 * The same reasons as `offer-respond-db.test.ts`, and one more. "Our reply is
 * APPENDED" is a claim about rows accumulating. "An amount of zero is refused"
 * is enforced twice, once in the route and once by a CHECK constraint the mock
 * has never heard of. And "our reply does not change the offer's packages" is a
 * claim about a table the route must NOT have written — which a mock cannot
 * distinguish from a route that wrote nothing anywhere.
 *
 * ── THE ONE THING MOCKED ───────────────────────────────────────────────────
 * The admin session, because vitest is not `next dev` and `devNoAuthUser()`
 * correctly returns null outside development. Everything else — the offer, the
 * reply, the insert, the constraints — is the real database. The file seeds one
 * throwaway lead, offer and reply, and deletes precisely what it created.
 *
 * ── EVERY REJECTION IS PAIRED WITH THE PROOF IT SEES ───────────────────────
 * A test asserting only 400 cannot tell "the guard fired" from "the request was
 * malformed for another reason". Each rejection below is therefore run twice:
 * once with the offending field, once with ONLY that field corrected. The
 * second must succeed.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { Pool } from "pg"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()

const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-counter-${Date.now()}`
const LEAD_ID = `${TAG}-lead`
const OFFER_ID = `${TAG}-offer`
const RESPONSE_ID = `${TAG}-resp`
const OTHER_OFFER_ID = `${TAG}-offer-other`

const PKG = "الباقة الموسمية"
const PACKAGES = [
  { name: PKG, description: "الموسم كاملاً", price_range: "2,750 د.ك للموسم (10 حلقات)", deliverables: ["ذكر في المقدمة"] },
]

// Only the session. See the header.
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  requireAdminAPI: vi.fn(async () => null),
  getAdminAuthUser: vi.fn(async () => ({
    id: "11111111-1111-1111-1111-111111111111",
    email: "khaled@khatpodcast.com",
    display_name: "خالد",
  })),
}))

let pool: Pool
let POST: typeof import("@/app/api/admin/offers/[offerId]/responses/[responseId]/counter/route")["POST"]

function payload(over: Record<string, unknown> = {}) {
  return { message: "نقدر ننزل إلى 2,500 د.ك للموسم كاملاً.", counter_amount: "2500", ...over }
}

async function post(offerId: string, responseId: string, body: Record<string, unknown>) {
  const { NextRequest } = await import("next/server")
  const req = new NextRequest(`http://localhost/api/admin/offers/${offerId}/responses/${responseId}/counter`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "khat" },
    body: JSON.stringify(body),
  })
  const res = await POST(req, { params: Promise.resolve({ offerId, responseId }) })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

const countersFor = async (responseId: string) =>
  (await pool.query(`select * from offer_counters where response_id = $1 order by created_at asc`, [responseId])).rows

const offerRow = async (id: string) =>
  (await pool.query(`select packages, updated_at from partnership_offers where id = $1`, [id])).rows[0]

d("POST .../counter — real database", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })

    await pool.query(
      `insert into sponsorship_leads
         (id, company_name, industry, contact_name, job_title, email, phone, main_goal, target_audience, budget_range)
       values ($1,'شركة الاختبار','إعلام','سالم','مدير','t@example.com','+96500000000','اختبار','عام','—')`,
      [LEAD_ID],
    )
    for (const id of [OFFER_ID, OTHER_OFFER_ID]) {
      await pool.query(
        `insert into partnership_offers (id, lead_id, token, title, packages, published)
         values ($1,$2,$3,'عرض اختبار',$4::jsonb,true)`,
        [id, LEAD_ID, `${id}-token`, JSON.stringify(PACKAGES)],
      )
    }
    await pool.query(
      `insert into offer_responses
         (id, offer_id, selected_package, proposed_amount, responder_name, responder_email, internal_note)
       values ($1,$2,$3,2000,'سالم العلي','salem@example.com','سقفنا الحقيقي 2400')`,
      [RESPONSE_ID, OFFER_ID, PKG],
    )

    POST = (await import("@/app/api/admin/offers/[offerId]/responses/[responseId]/counter/route")).POST
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query(`delete from offer_counters where response_id = $1`, [RESPONSE_ID])
    await pool.query(`delete from offer_responses where offer_id = $1`, [OFFER_ID])
    await pool.query(`delete from crm_activities where subject_id = $1`, [LEAD_ID]).catch(() => {})
    await pool.query(`delete from partnership_offers where id = any($1)`, [[OFFER_ID, OTHER_OFFER_ID]])
    await pool.query(`delete from sponsorship_leads where id = $1`, [LEAD_ID])
    await pool.end()
  })

  // ── The reply must belong to the offer in the path ────────────────────────
  describe("the reply has to belong to the offer named in the URL", () => {
    it("404s when the reply belongs to a different offer", async () => {
      const before = (await countersFor(RESPONSE_ID)).length
      const res = await post(OTHER_OFFER_ID, RESPONSE_ID, payload())
      expect(res.status).toBe(404)
      // And nothing was written. A guard that 404s after inserting is not a guard.
      expect((await countersFor(RESPONSE_ID)).length).toBe(before)
    })

    it("404s an unknown reply id", async () => {
      expect((await post(OFFER_ID, `${TAG}-no-such-reply`, payload())).status).toBe(404)
    })

    it("SIGHT: the identical body succeeds with the right offer id", async () => {
      const res = await post(OFFER_ID, RESPONSE_ID, payload())
      expect(res.status).toBe(200)
      expect((await countersFor(RESPONSE_ID)).length).toBe(1)
    })
  })

  // ── A number with no sentence is not an answer ────────────────────────────
  describe("the message is required", () => {
    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["markup that strips to nothing", "<b></b>"],
      ["not a string", 42],
    ])("rejects a message that is %s", async (_label, message) => {
      const before = (await countersFor(RESPONSE_ID)).length
      const res = await post(OFFER_ID, RESPONSE_ID, payload({ message }))
      expect(res.status).toBe(400)
      expect((await countersFor(RESPONSE_ID)).length).toBe(before)
    })

    it("SIGHT: the identical body succeeds once the message has text", async () => {
      expect((await post(OFFER_ID, RESPONSE_ID, payload({ message: "نوافق." }))).status).toBe(200)
    })

    it("the database refuses an empty message even if the route ever stopped doing so", async () => {
      // The floor under the API. Proves the CHECK is real and not merely
      // described in a migration file.
      await expect(
        pool.query(
          `insert into offer_counters (id, offer_id, response_id, message) values ($1,$2,$3,'   ')`,
          [`${TAG}-direct`, OFFER_ID, RESPONSE_ID],
        ),
      ).rejects.toThrow(/offer_counters_message_check/)
    })
  })

  // ── The figure, when given ────────────────────────────────────────────────
  describe("a counter amount that is not a positive number is refused", () => {
    it.each([
      ["zero", 0],
      ["zero as text", "0"],
      ["negative", -1],
      ["not a number", "كثير"],
      // The column's ceiling: numeric(10,3) cannot hold 10^7. Without this the
      // value sails past validation and Postgres raises an uncaught overflow.
      ["at the column ceiling", "10000000"],
      ["ceiling reached by rounding", "9999999.9995"],
    ])("rejects %s", async (_label, value) => {
      const before = (await countersFor(RESPONSE_ID)).length
      const res = await post(OFFER_ID, RESPONSE_ID, payload({ counter_amount: value }))
      expect(res.status).toBe(400)
      expect((await countersFor(RESPONSE_ID)).length).toBe(before)
    })

    it("SIGHT: the largest value the column CAN hold still passes", async () => {
      const res = await post(OFFER_ID, RESPONSE_ID, payload({ counter_amount: "9999999.999" }))
      expect(res.status).toBe(200)
      expect(Number((await countersFor(RESPONSE_ID)).at(-1)!.counter_amount)).toBe(9999999.999)
    })

    it("SIGHT: an omitted amount is allowed — we may hold the price and only answer", async () => {
      const res = await post(OFFER_ID, RESPONSE_ID, payload({ counter_amount: "" }))
      expect(res.status).toBe(200)
      expect((await countersFor(RESPONSE_ID)).at(-1)!.counter_amount).toBeNull()
    })

    it("keeps the dinar's third decimal", async () => {
      await post(OFFER_ID, RESPONSE_ID, payload({ counter_amount: "2500.750" }))
      expect(Number((await countersFor(RESPONSE_ID)).at(-1)!.counter_amount)).toBe(2500.75)
    })

    it("the database refuses zero even if the route ever stopped doing so", async () => {
      await expect(
        pool.query(
          `insert into offer_counters (id, offer_id, response_id, message, counter_amount)
           values ($1,$2,$3,'x',0)`,
          [`${TAG}-direct-zero`, OFFER_ID, RESPONSE_ID],
        ),
      ).rejects.toThrow(/offer_counters_amount_check/)
    })
  })

  // ── Append-only ───────────────────────────────────────────────────────────
  describe("our replies accumulate — a second answer never overwrites the first", () => {
    it("keeps both rounds with their own figures", async () => {
      const before = await countersFor(RESPONSE_ID)

      await post(OFFER_ID, RESPONSE_ID, payload({ message: "أولاً", counter_amount: "2600" }))
      await post(OFFER_ID, RESPONSE_ID, payload({ message: "ثانياً", counter_amount: "2450" }))

      const after = await countersFor(RESPONSE_ID)
      expect(after.length).toBe(before.length + 2)
      expect(after.slice(-2).map((r) => Number(r.counter_amount))).toEqual([2600, 2450])
      // Distinct ids: the second insert did not reuse the first row.
      expect(new Set(after.map((r) => r.id)).size).toBe(after.length)
      // And the first answer is still exactly as it was sent.
      expect(after[0].message).toBe(before[0].message)
    })
  })

  // ── A message, not an amendment ───────────────────────────────────────────
  describe("our reply does not touch the published offer", () => {
    it("leaves packages and updated_at alone", async () => {
      const before = await offerRow(OFFER_ID)

      const res = await post(OFFER_ID, RESPONSE_ID, payload({ counter_amount: "1234.5" }))
      expect(res.status).toBe(200)

      const after = await offerRow(OFFER_ID)
      // The published price is still 2,750 — the counter named 1,234.5 and the
      // contract did not move. Khaled edits the offer by hand or it does not
      // change.
      expect(after.packages).toEqual(before.packages)
      expect(JSON.stringify(after.packages)).toContain("2,750 د.ك للموسم (10 حلقات)")
      // `updated_at` is content's timestamp. A conversation is not content.
      expect(after.updated_at?.toISOString?.()).toBe(before.updated_at?.toISOString?.())
    })

    it("SIGHT: the same comparison DOES catch a real package change", async () => {
      // The control for the assertion above. Without it, `toEqual` passing
      // would be indistinguishable from a comparison that can never fail.
      const before = await offerRow(OFFER_ID)
      const mutated = [{ ...PACKAGES[0], price_range: "9,999 د.ك" }]
      await pool.query(`update partnership_offers set packages = $2::jsonb where id = $1`, [
        OFFER_ID,
        JSON.stringify(mutated),
      ])
      try {
        const after = await offerRow(OFFER_ID)
        expect(after.packages).not.toEqual(before.packages)
      } finally {
        await pool.query(`update partnership_offers set packages = $2::jsonb where id = $1`, [
          OFFER_ID,
          JSON.stringify(PACKAGES),
        ])
      }
    })
  })

  // ── It never writes the private column ────────────────────────────────────
  describe("the public answer and the private note stay apart", () => {
    it("does not touch offer_responses.internal_note", async () => {
      await post(OFFER_ID, RESPONSE_ID, payload({ message: "ردّ عام", internal_note: "حاول يكتبها هنا" }))
      const [row] = (
        await pool.query(`select internal_note, status from offer_responses where id = $1`, [RESPONSE_ID])
      ).rows
      // Unchanged from the seed, and the smuggled key was ignored entirely.
      expect(row.internal_note).toBe("سقفنا الحقيقي 2400")
      expect(row.status).toBe("new")
    })

    it("records who sent it, by id and by name", async () => {
      await post(OFFER_ID, RESPONSE_ID, payload({ message: "مع التوقيع" }))
      const last = (await countersFor(RESPONSE_ID)).at(-1)!
      expect(last.author_admin_id).toBe("11111111-1111-1111-1111-111111111111")
      expect(last.author_name).toBe("خالد")
    })
  })
})
