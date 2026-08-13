/**
 * Offer replies — data layer.
 *
 * A company opens `/offer/<token>`, picks one of the packages we offered, and
 * optionally names a figure of its own. That reply lands here. The design rule
 * that shapes every function below lives in `lib/db/schema/offer-responses.ts`:
 * our price is never overwritten, and a reply is APPENDED — there is no update
 * path for anything the company sent, only for the review columns Khaled owns.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { offerResponses } from "@/lib/db/schema/offer-responses"
import type { OfferResponse, OfferResponseStatus } from "@/types/database"

/** The four states the CHECK constraint allows. Used to validate input. */
export const OFFER_RESPONSE_STATUSES: readonly OfferResponseStatus[] = [
  "new",
  "reviewed",
  "accepted",
  "declined",
] as const

export function isOfferResponseStatus(v: unknown): v is OfferResponseStatus {
  return typeof v === "string" && (OFFER_RESPONSE_STATUSES as readonly string[]).includes(v)
}

/**
 * `numeric` arrives from node-postgres as a STRING, not a number — pg refuses
 * to parse it because a numeric can exceed the float64 range. Reading it as a
 * number without converting yields `"1500.750"` typed as `number`, which then
 * fails silently at every comparison downstream. Parse once, here.
 */
function mapResponse(row: typeof offerResponses.$inferSelect): OfferResponse {
  const amount = row.proposed_amount == null ? null : Number(row.proposed_amount)
  return {
    id: row.id,
    offer_id: row.offer_id,
    selected_package: row.selected_package,
    proposed_amount: amount != null && Number.isFinite(amount) ? amount : null,
    proposed_currency: row.proposed_currency,
    notes: row.notes,
    responder_name: row.responder_name,
    responder_email: row.responder_email,
    responder_job_title: row.responder_job_title,
    status: (isOfferResponseStatus(row.status) ? row.status : "new") as OfferResponseStatus,
    internal_note: row.internal_note,
    created_at: (row.created_at ?? new Date()).toISOString(),
    updated_at: (row.updated_at ?? new Date()).toISOString(),
  }
}

/** Everything the public form may set. `status` and `internal_note` are absent on purpose. */
export interface NewOfferResponse {
  offer_id: string
  selected_package: string
  proposed_amount: number | null
  notes: string | null
  responder_name: string
  responder_email: string
  responder_job_title: string | null
}

/**
 * Append a reply. Never an upsert: a second submission from the same person is
 * a second round of the negotiation, and overwriting the first would destroy
 * the only record of what they originally asked for.
 */
export async function createOfferResponse(input: NewOfferResponse): Promise<OfferResponse | null> {
  if (!db) return null
  const [row] = await db
    .insert(offerResponses)
    .values({
      offer_id: input.offer_id,
      selected_package: input.selected_package,
      // Drizzle's numeric column takes a string; passing the number would go
      // through JS float formatting on the way in.
      proposed_amount: input.proposed_amount == null ? null : String(input.proposed_amount),
      notes: input.notes,
      responder_name: input.responder_name,
      responder_email: input.responder_email,
      responder_job_title: input.responder_job_title,
    })
    .returning()
  return row ? mapResponse(row) : null
}

/** All replies to one offer, newest first — the negotiation read backwards. */
export async function listOfferResponses(offerId: string): Promise<OfferResponse[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(offerResponses)
    .where(eq(offerResponses.offer_id, offerId))
    .orderBy(desc(offerResponses.created_at))
  return rows.map(mapResponse)
}

export async function getOfferResponseById(id: string): Promise<OfferResponse | null> {
  if (!db) return null
  const [row] = await db.select().from(offerResponses).where(eq(offerResponses.id, id)).limit(1)
  return row ? mapResponse(row) : null
}

/**
 * The ONLY update path, and it reaches only the two columns the admin owns.
 * Nothing the company submitted can be edited from here — a reply is evidence
 * of what was asked, and evidence that can be rewritten is not evidence.
 */
export async function updateOfferResponseReview(
  id: string,
  patch: { status?: OfferResponseStatus; internal_note?: string | null },
): Promise<OfferResponse | null> {
  if (!db) return null
  const set: Record<string, unknown> = { updated_at: new Date() }
  if (patch.status !== undefined) {
    // Guard before the database does: an unknown value would otherwise hit the
    // CHECK constraint and surface as a 500 instead of a 400.
    if (!isOfferResponseStatus(patch.status)) return null
    set.status = patch.status
  }
  if (patch.internal_note !== undefined) set.internal_note = patch.internal_note

  const [row] = await db.update(offerResponses).set(set).where(eq(offerResponses.id, id)).returning()
  return row ? mapResponse(row) : null
}
