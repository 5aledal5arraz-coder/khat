/**
 * «ردّ خط» — our side of the negotiation. Data layer.
 *
 * The shape rules live in `lib/db/schema/offer-counters.ts`. Two of them decide
 * everything below:
 *
 *  1. APPEND-ONLY. There is a create and there are reads. There is no update
 *     and no delete, because a message the partner has already read cannot be
 *     unsaid, and a record that can be rewritten is not a record.
 *
 *  2. IT NEVER TOUCHES THE OFFER. Nothing in this file writes to
 *     `partnership_offers`. Naming a counter-price is a sentence, not an
 *     amendment; the published packages change only when Khaled edits them.
 */

import { asc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { offerCounters } from "@/lib/db/schema/offer-counters"
import type { OfferCounter } from "@/types/database"

/** Matches the company's column: `numeric(10,3)` tops out below 10^7. */
export const COUNTER_AMOUNT_CEILING = 10_000_000

/**
 * `numeric` arrives from node-postgres as a STRING — it can exceed float64, so
 * pg refuses to guess. Parse once, here, exactly as `lib/offer-responses.ts`
 * does; a number-typed string is the kind of value that fails silently at every
 * comparison downstream.
 */
function mapCounter(row: typeof offerCounters.$inferSelect): OfferCounter {
  const amount = row.counter_amount == null ? null : Number(row.counter_amount)
  return {
    id: row.id,
    offer_id: row.offer_id,
    response_id: row.response_id,
    message: row.message,
    counter_amount: amount != null && Number.isFinite(amount) ? amount : null,
    counter_currency: row.counter_currency,
    author_admin_id: row.author_admin_id,
    author_name: row.author_name,
    created_at: (row.created_at ?? new Date()).toISOString(),
  }
}

export interface NewOfferCounter {
  offer_id: string
  response_id: string
  message: string
  counter_amount: number | null
  author_admin_id: string | null
  author_name: string | null
}

/** Append one reply. Never an upsert — see the header. */
export async function createOfferCounter(input: NewOfferCounter): Promise<OfferCounter | null> {
  if (!db) return null
  const [row] = await db
    .insert(offerCounters)
    .values({
      offer_id: input.offer_id,
      response_id: input.response_id,
      message: input.message,
      // Drizzle's numeric column takes a string; a number would go through JS
      // float formatting on the way in.
      counter_amount: input.counter_amount == null ? null : String(input.counter_amount),
      author_admin_id: input.author_admin_id,
      author_name: input.author_name,
    })
    .returning()
  return row ? mapCounter(row) : null
}

/**
 * Every reply we sent on this offer, OLDEST FIRST.
 *
 * Deliberately the opposite order to `listOfferResponses()`: the rounds are
 * listed newest-first because the operator wants the latest move at the top,
 * but within one round the exchange reads forwards, the way a conversation does.
 */
export async function listOfferCounters(offerId: string): Promise<OfferCounter[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(offerCounters)
    .where(eq(offerCounters.offer_id, offerId))
    .orderBy(asc(offerCounters.created_at))
  return rows.map(mapCounter)
}

/** The same, grouped by the reply each one answers. */
export async function listOfferCountersByResponse(
  responseIds: string[],
): Promise<Map<string, OfferCounter[]>> {
  const grouped = new Map<string, OfferCounter[]>()
  if (!db || responseIds.length === 0) return grouped
  const rows = await db
    .select()
    .from(offerCounters)
    .where(inArray(offerCounters.response_id, responseIds))
    .orderBy(asc(offerCounters.created_at))
  for (const row of rows) {
    const counter = mapCounter(row)
    const list = grouped.get(counter.response_id)
    if (list) list.push(counter)
    else grouped.set(counter.response_id, [counter])
  }
  return grouped
}
