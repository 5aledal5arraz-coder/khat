/**
 * `partnership_offers.sent_at` — against the REAL database.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY ────────────────────────────────────────
 * `offer-send-route.test.ts` proves the route CALLS `markOfferSent`, and calls
 * are all a spy can prove. The claim that matters to Khaled is different: that
 * the stamp survives, so an offer sent on Sunday still says so on Wednesday.
 * That is a claim about a column, and this codebase has been burned by exactly
 * this gap before — 2142 green tests once survived a deleted column because the
 * mock ignored Drizzle's projection. So this one talks to Postgres.
 *
 * It seeds one throwaway lead and one throwaway offer and deletes precisely
 * what it created. Nothing pre-existing is read or written.
 *
 * ── AND IT REFUSES TO SKIP ─────────────────────────────────────────────────
 * If the column is missing, this fails and says which migration is absent. It
 * does NOT skip: the column is not optional — `getOfferById` selects it, so
 * without it every read of an offer errors and the whole offers screen is dead.
 * A skipped test here would report health on a broken feature.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Pool } from "pg"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()

const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-sentat-${Date.now()}`
const LEAD_ID = `${TAG}-lead`
const OFFER_ID = `${TAG}-offer`

let pool: Pool

d("partnership_offers.sent_at — real database", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(
      `insert into sponsorship_leads
         (id, company_name, industry, contact_name, job_title, email, phone, main_goal, target_audience, budget_range)
       values ($1,'شركة الاختبار','إعلام','سالم','مدير','t@example.com','+96500000000','اختبار','عام','—')`,
      [LEAD_ID],
    )
    await pool.query(
      `insert into partnership_offers (id, lead_id, token, title, packages, published)
       values ($1,$2,$3,'عرض اختبار','[]'::jsonb,true)`,
      [OFFER_ID, LEAD_ID, `${TAG}-token`],
    )
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query(`delete from crm_activities where subject_id = $1`, [LEAD_ID]).catch(() => {})
    await pool.query(`delete from partnership_offers where id = $1`, [OFFER_ID])
    await pool.query(`delete from sponsorship_leads where id = $1`, [LEAD_ID])
    await pool.end()
  })

  it("the column exists, nullable and timezone-aware", async () => {
    const { rows } = await pool.query(
      `select data_type, is_nullable from information_schema.columns
        where table_name = 'partnership_offers' and column_name = 'sent_at'`,
    )
    expect(
      rows.length,
      "partnership_offers.sent_at is missing — the migration for lib/db/schema/sponsorship-ai.ts has not been applied to this database",
    ).toBe(1)
    expect(rows[0].data_type).toBe("timestamp with time zone")
    // Nullable is the whole design: NULL means "never sent", which is the state
    // the system could not previously express.
    expect(rows[0].is_nullable).toBe("YES")
  })

  it("a freshly created offer has never been sent", async () => {
    const { getOfferById } = await import("@/lib/partnership-offers")
    const offer = await getOfferById(OFFER_ID)
    expect(offer).not.toBeNull()
    expect(offer!.sent_at).toBeNull()
  })

  it("markOfferSent writes a stamp that survives a re-read", async () => {
    const { getOfferById, markOfferSent } = await import("@/lib/partnership-offers")
    const at = new Date("2026-08-13T09:15:00.000Z")
    const returned = await markOfferSent(OFFER_ID, at)
    expect(returned).toBe(at.toISOString())

    // Re-read through the same mapper the page uses — not the update's own
    // RETURNING — so a column the SELECT does not project would be caught.
    const offer = await getOfferById(OFFER_ID)
    expect(offer!.sent_at).toBe(at.toISOString())

    // And straight from the table, past the ORM entirely.
    const { rows } = await pool.query(`select sent_at from partnership_offers where id = $1`, [OFFER_ID])
    expect(new Date(rows[0].sent_at).toISOString()).toBe(at.toISOString())
  })

  it("stamping again moves the time — a resend is the latest send", async () => {
    const { markOfferSent } = await import("@/lib/partnership-offers")
    const later = new Date("2026-08-14T11:00:00.000Z")
    await markOfferSent(OFFER_ID, later)
    const { rows } = await pool.query(`select sent_at from partnership_offers where id = $1`, [OFFER_ID])
    expect(new Date(rows[0].sent_at).toISOString()).toBe(later.toISOString())
  })

  it("stamping does NOT disturb updated_at — delivery is not an edit", async () => {
    const { markOfferSent } = await import("@/lib/partnership-offers")
    const before = (await pool.query(`select updated_at from partnership_offers where id = $1`, [OFFER_ID])).rows[0]
    await markOfferSent(OFFER_ID, new Date("2026-08-15T12:00:00.000Z"))
    const after = (await pool.query(`select updated_at from partnership_offers where id = $1`, [OFFER_ID])).rows[0]
    expect(new Date(after.updated_at).toISOString()).toBe(new Date(before.updated_at).toISOString())
  })
})
