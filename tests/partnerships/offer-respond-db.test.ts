/**
 * `POST /api/offer/<token>/respond` — against the REAL local database.
 *
 * ── WHY NOT `tests/db-mock.ts` ─────────────────────────────────────────────
 * Every claim worth making here is about something the mock cannot represent.
 * "The reply is APPENDED" is a statement about rows accumulating; "amount 0 is
 * refused" is enforced twice, once in the route and once by a CHECK constraint
 * the mock has never heard of; "the gate holds" depends on a bcrypt hash that
 * has to round-trip through a column. A mocked version of this file would go
 * green with the table dropped — the prep-journey failure exactly.
 *
 * So this talks to Postgres. It seeds one throwaway lead and two throwaway
 * offers (one open, one password-gated), and deletes precisely what it created.
 * Nothing pre-existing is read or written. Skipped when DATABASE_URL is unset;
 * an UNREACHABLE database fails loudly rather than passing quietly.
 *
 * ── EVERY REJECTION IS PAIRED WITH THE PROOF IT SEES ───────────────────────
 * A test that only asserts 400 cannot tell "the guard fired" from "the request
 * was malformed for some other reason" — and that is how a guard goes blind
 * while its test stays green. So each rejection here is run TWICE: once with
 * the offending field, and once with ONLY that field corrected. The second run
 * must succeed. If the guard stops seeing, the pair disagrees and the file
 * fails; if the request were broken for an unrelated reason, the positive half
 * would fail too and say so.
 *
 * Every request carries its own `x-forwarded-for`, because the IP limiter
 * allows five per hour and this file sends more than five.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Pool } from "pg"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()

const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-offer-${Date.now()}`
const LEAD_ID = `${TAG}-lead`
const OPEN_ID = `${TAG}-offer-open`
const GATED_ID = `${TAG}-offer-gated`
const OPEN_TOKEN = `${TAG}-token-open`
const GATED_TOKEN = `${TAG}-token-gated`
const PASSWORD = "correct-horse-battery"

/** The two packages the seeded offers carry. Names are the contract. */
const PKG_SEASON = "الباقة الموسمية"
const PKG_SINGLE = "حلقة واحدة"
const PACKAGES = [
  { name: PKG_SEASON, description: "الموسم كاملاً", price_range: "٢٧٥ د.ك للحلقة", deliverables: ["ذكر في المقدمة"] },
  { name: PKG_SINGLE, description: "تجربة أولى", price_range: "٣٥٠ د.ك", deliverables: ["ذكر في المقدمة"] },
]

let pool: Pool
let POST: typeof import("@/app/api/offer/[token]/respond/route")["POST"]

/** A valid body. Tests override exactly one field to isolate one guard. */
function payload(over: Record<string, unknown> = {}) {
  return {
    selected_package: PKG_SEASON,
    proposed_amount: "250.5",
    notes: "نودّ مناقشة التوقيت.",
    responder_name: "سالم العلي",
    responder_email: "salem@example.com",
    responder_job_title: "مدير التسويق",
    ...over,
  }
}

let ipSeed = 0
async function post(token: string, body: Record<string, unknown>) {
  const { NextRequest } = await import("next/server")
  const req = new NextRequest(`http://localhost/api/offer/${token}/respond`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // `validateMutation` = same-origin + this header. Both are real guards;
      // sending them is what makes the rest of the assertions about THIS route.
      "x-requested-with": "khat",
      "x-forwarded-for": `10.0.0.${++ipSeed % 250}`,
    },
    body: JSON.stringify(body),
  })
  const res = await POST(req, { params: Promise.resolve({ token }) })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

const rowsFor = async (offerId: string) =>
  (await pool.query(`select * from offer_responses where offer_id = $1 order by created_at asc`, [offerId])).rows

d("POST /api/offer/[token]/respond — real database", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const bcrypt = (await import("bcryptjs")).default
    const hash = await bcrypt.hash(PASSWORD, 10)

    await pool.query(
      `insert into sponsorship_leads
         (id, company_name, industry, contact_name, job_title, email, phone, main_goal, target_audience, budget_range)
       values ($1,'شركة الاختبار','إعلام','سالم','مدير','t@example.com','+96500000000','اختبار','عام','—')`,
      [LEAD_ID],
    )
    for (const [id, token, pw] of [
      [OPEN_ID, OPEN_TOKEN, null],
      [GATED_ID, GATED_TOKEN, hash],
    ] as const) {
      await pool.query(
        `insert into partnership_offers (id, lead_id, token, title, packages, published, password_hash)
         values ($1,$2,$3,'عرض اختبار',$4::jsonb,true,$5)`,
        [id, LEAD_ID, token, JSON.stringify(PACKAGES), pw],
      )
    }

    POST = (await import("@/app/api/offer/[token]/respond/route")).POST
  })

  afterAll(async () => {
    if (!pool) return
    // Children first — the FK is ON DELETE CASCADE, but deleting explicitly
    // means a failure here is visible instead of being swallowed by a cascade.
    await pool.query(`delete from offer_responses where offer_id = any($1)`, [[OPEN_ID, GATED_ID]])
    await pool.query(`delete from crm_activities where subject_id = $1`, [LEAD_ID]).catch(() => {})
    await pool.query(`delete from partnership_offers where id = any($1)`, [[OPEN_ID, GATED_ID]])
    await pool.query(`delete from sponsorship_leads where id = $1`, [LEAD_ID])
    await pool.end()
  })

  // ── The password gate ─────────────────────────────────────────────────────
  describe("a password-gated offer refuses a reply that cannot produce the password", () => {
    it("rejects with no password at all", async () => {
      const before = (await rowsFor(GATED_ID)).length
      const res = await post(GATED_TOKEN, payload())
      expect(res.status).toBe(401)
      // And nothing was written. A guard that returns 401 after inserting is
      // not a guard.
      expect((await rowsFor(GATED_ID)).length).toBe(before)
    })

    it("rejects a wrong password", async () => {
      const res = await post(GATED_TOKEN, payload({ password: "not-the-password" }))
      expect(res.status).toBe(401)
    })

    it("SIGHT: the identical body succeeds once the password is correct", async () => {
      // Same request, one field changed. If this fails, the two tests above
      // were rejecting something other than the password.
      const res = await post(GATED_TOKEN, payload({ password: PASSWORD }))
      expect(res.status).toBe(200)
      expect(res.json.success).toBe(true)
      expect((await rowsFor(GATED_ID)).length).toBe(1)
    })

    it("an OPEN offer needs no password — the gate is not applied where there is none", async () => {
      const res = await post(OPEN_TOKEN, payload())
      expect(res.status).toBe(200)
    })
  })

  // ── The package must be one we offered ────────────────────────────────────
  describe("the selected package must exist on this offer", () => {
    it("rejects a package this offer does not carry", async () => {
      const before = (await rowsFor(OPEN_ID)).length
      const res = await post(OPEN_TOKEN, payload({ selected_package: "باقة اخترعوها" }))
      expect(res.status).toBe(400)
      expect((await rowsFor(OPEN_ID)).length).toBe(before)
    })

    it("rejects an empty package", async () => {
      const res = await post(OPEN_TOKEN, payload({ selected_package: "" }))
      expect(res.status).toBe(400)
    })

    it("SIGHT: the identical body succeeds with a package that IS on the offer", async () => {
      const res = await post(OPEN_TOKEN, payload({ selected_package: PKG_SINGLE }))
      expect(res.status).toBe(200)
      const rows = await rowsFor(OPEN_ID)
      expect(rows.at(-1)!.selected_package).toBe(PKG_SINGLE)
    })
  })

  // ── The figure, when given, must be a real positive number ────────────────
  describe("a proposed amount that is not a positive number is refused", () => {
    it.each([
      ["zero", 0],
      ["zero as text", "0"],
      ["negative", -1],
      ["negative decimal", "-250.5"],
      ["not a number", "كثير"],
      // THE COLUMN'S CEILING, which the route did not know about. `numeric(10,3)`
      // cannot hold 10^7, so these sailed past validation and Postgres raised an
      // uncaught overflow — the partner received HTTP 500 with an EMPTY BODY and
      // no reason. A company typing one zero too many is the likeliest way to
      // reach it, which makes a bare 500 the worst possible answer.
      ["at the column ceiling", "10000000"],
      ["far past the ceiling", 9999999999],
      ["ceiling reached by decimals", "9999999.9995"],
    ])("rejects %s", async (_label, value) => {
      const before = (await rowsFor(OPEN_ID)).length
      const res = await post(OPEN_TOKEN, payload({ proposed_amount: value }))
      expect(res.status).toBe(400)
      expect((await rowsFor(OPEN_ID)).length).toBe(before)
    })

    it("SIGHT: the largest value the column CAN hold still passes", async () => {
      // The boundary is a real number, not a guess: 9,999,999.999 fits and
      // 10,000,000 does not. Without this the ceiling check could be tightened
      // to something arbitrary and no test would notice.
      const res = await post(OPEN_TOKEN, payload({ proposed_amount: "9999999.999" }))
      expect(res.status).toBe(200)
      expect(Number((await rowsFor(OPEN_ID)).at(-1)!.proposed_amount)).toBe(9999999.999)
    })

    it("SIGHT: the identical body succeeds with a positive amount", async () => {
      const res = await post(OPEN_TOKEN, payload({ proposed_amount: "1500.75" }))
      expect(res.status).toBe(200)
      // And the dinar's third decimal survived the round trip — `numeric`
      // arrives as a string, so this also pins the parse in `mapResponse`.
      expect(Number((await rowsFor(OPEN_ID)).at(-1)!.proposed_amount)).toBe(1500.75)
    })

    it("SIGHT: an omitted amount is allowed — the field is optional, not required", async () => {
      const res = await post(OPEN_TOKEN, payload({ proposed_amount: "" }))
      expect(res.status).toBe(200)
      expect((await rowsFor(OPEN_ID)).at(-1)!.proposed_amount).toBeNull()
    })

    it("the database refuses zero even if the route ever stopped doing so", async () => {
      // The floor under the API. Proves the CHECK constraint is real and not
      // just described in a migration file.
      await expect(
        pool.query(
          `insert into offer_responses (id, offer_id, selected_package, proposed_amount, responder_name, responder_email)
           values ($1,$2,$3,0,'x','x@example.com')`,
          [`${TAG}-direct`, OPEN_ID, PKG_SEASON],
        ),
      ).rejects.toThrow(/offer_responses_amount_check/)
    })
  })

  // ── Append-only ───────────────────────────────────────────────────────────
  describe("a second reply is APPENDED, never written over the first", () => {
    it("keeps both rounds, each with its own figure", async () => {
      const fresh = `${TAG}-token-append`
      const offerId = `${TAG}-offer-append`
      await pool.query(
        `insert into partnership_offers (id, lead_id, token, title, packages, published)
         values ($1,$2,$3,'عرض اختبار',$4::jsonb,true)`,
        [offerId, LEAD_ID, fresh, JSON.stringify(PACKAGES)],
      )
      try {
        expect(await rowsFor(offerId)).toHaveLength(0)

        await post(fresh, payload({ proposed_amount: "200" }))
        await post(fresh, payload({ proposed_amount: "240" }))

        const rows = await rowsFor(offerId)
        // Two rows, not one updated in place — the negotiation is a sequence.
        expect(rows).toHaveLength(2)
        expect(rows.map((r) => Number(r.proposed_amount))).toEqual([200, 240])
        // Distinct ids: the second insert did not reuse the first row.
        expect(new Set(rows.map((r) => r.id)).size).toBe(2)
      } finally {
        await pool.query(`delete from offer_responses where offer_id = $1`, [offerId])
        await pool.query(`delete from partnership_offers where id = $1`, [offerId])
      }
    })
  })

  // ── What the company may not decide ───────────────────────────────────────
  describe("the company cannot write the columns the admin owns", () => {
    it("ignores status and internal_note in the body", async () => {
      const res = await post(OPEN_TOKEN, payload({ status: "accepted", internal_note: "نقبل فوراً" }))
      expect(res.status).toBe(200)
      const row = (await rowsFor(OPEN_ID)).at(-1)!
      // Not "accepted", and no note — the route never reads either key.
      expect(row.status).toBe("new")
      expect(row.internal_note).toBeNull()
    })
  })

  // ── The offer has to be reachable at all ──────────────────────────────────
  describe("unknown and unpublished offers answer the same way", () => {
    it("404s an unknown token", async () => {
      expect((await post(`${TAG}-no-such-token`, payload())).status).toBe(404)
    })

    it("404s a published-then-unpublished offer, and 200s once it is published again", async () => {
      await pool.query(`update partnership_offers set published = false where id = $1`, [OPEN_ID])
      expect((await post(OPEN_TOKEN, payload())).status).toBe(404)
      // SIGHT: the only thing that changed is the flag.
      await pool.query(`update partnership_offers set published = true where id = $1`, [OPEN_ID])
      expect((await post(OPEN_TOKEN, payload())).status).toBe(200)
    })
  })

  // ── Who replied ───────────────────────────────────────────────────────────
  describe("the sender identifies themselves", () => {
    it("rejects a missing name", async () => {
      expect((await post(OPEN_TOKEN, payload({ responder_name: "  " }))).status).toBe(400)
    })

    it("rejects an invalid email", async () => {
      expect((await post(OPEN_TOKEN, payload({ responder_email: "not-an-email" }))).status).toBe(400)
    })

    it("SIGHT: the identical body succeeds with both present", async () => {
      const res = await post(OPEN_TOKEN, payload())
      expect(res.status).toBe(200)
      expect((await rowsFor(OPEN_ID)).at(-1)!.responder_email).toBe("salem@example.com")
    })
  })

  // ── CSRF ──────────────────────────────────────────────────────────────────
  it("refuses a request without the CSRF header", async () => {
    const { NextRequest } = await import("next/server")
    const req = new NextRequest(`http://localhost/api/offer/${OPEN_TOKEN}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
      body: JSON.stringify(payload()),
    })
    const res = await POST(req, { params: Promise.resolve({ token: OPEN_TOKEN }) })
    expect(res.status).toBe(403)
  })
})
