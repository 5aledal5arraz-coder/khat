import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core"
import { partnershipOffers } from "./sponsorship-ai"
import { offerResponses } from "./offer-responses"

/**
 * OUR reply to the company's counter-offer — «ردّ خط».
 *
 * ── WHY A SECOND TABLE AND NOT A COLUMN ON `offer_responses` ────────────────
 * `offer_responses.internal_note` already exists and is the exact thing this
 * must NOT be. That note is Khaled's own, never leaves the admin, and can be
 * rewritten at will. This row is the opposite on all three counts: it is
 * addressed to the company, it is rendered on `/offer/<token>`, and it is
 * append-only. Two lifetimes and two audiences do not belong in one column —
 * the day they share one, a private note ships to the partner.
 *
 * The separation is therefore structural, not a matter of remembering to pick
 * the right field: there is no code path that can read a note out of this table
 * because the note is not in it.
 *
 * ── APPEND-ONLY, LIKE THEIRS ───────────────────────────────────────────────
 * A negotiation is a sequence. Their side already refuses to be overwritten
 * (see `offer-responses.ts`); ours has to refuse for the same reason, or the
 * record reads as "they moved three times and we said one thing".
 *
 * ── A MESSAGE, NOT AN AMENDMENT ────────────────────────────────────────────
 * `counter_amount` is a number we NAME, not a number we SET. It never touches
 * `partnership_offers.packages` — the published offer stays exactly as it was
 * until Khaled edits it by hand. This row is a sentence in a conversation; the
 * offer is the contract, and a conversation does not silently rewrite one.
 *
 * The package is deliberately absent as a column: this row answers ONE reply,
 * and that reply already records the package it chose. Storing it twice creates
 * a pair that can disagree, and the reply is the side that cannot be edited.
 */
export const offerCounters = pgTable(
  "offer_counters",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

    /**
     * Denormalised on purpose. Every read is "the conversation on this offer",
     * and routing that through `offer_responses` on each query buys nothing
     * except a join — the reply's `offer_id` is immutable, so the two can
     * never drift.
     */
    offer_id: text("offer_id")
      .notNull()
      .references(() => partnershipOffers.id, { onDelete: "cascade" }),

    /** The reply this answers. The public page nests it directly underneath. */
    response_id: text("response_id")
      .notNull()
      .references(() => offerResponses.id, { onDelete: "cascade" }),

    /** Shown to the company verbatim. Required — a bare number is not an answer. */
    message: text("message").notNull(),

    /**
     * Our counter figure for the package they picked. Nullable: a reply may
     * hold the price and only answer a question. Same `numeric(10,3)` as their
     * column — the dinar has three decimals.
     */
    counter_amount: numeric("counter_amount", { precision: 10, scale: 3 }),
    counter_currency: text("counter_currency").notNull().default("KWD"),

    /**
     * Who sent it, kept two ways on purpose. The id is the trace; the name is a
     * SNAPSHOT, because a deactivated or renamed admin must not turn a
     * six-month-old negotiation into «— قال». Same reasoning as
     * `offer_responses.responder_name` and `selected_package`.
     *
     * ── AND DELIBERATELY NOT A FOREIGN KEY ──────────────────────────────────
     * It was one, briefly, and it took the feature down on the first real
     * click. `devNoAuthUser()` serves `next dev` with a synthetic admin whose
     * id (`00000000-…`) is in no table, so every reply written locally failed
     * on `offer_counters_author_admin_id_admin_users_id_fk` and the partner-
     * facing message was refused because of a field nobody reads.
     *
     * That is the wrong trade whatever the environment: the MESSAGE is the
     * record and authorship is metadata about it. Referential integrity on the
     * metadata must never be able to reject the record. `crm_activities.actor`
     * — the same question, asked everywhere else in this domain — is plain text
     * with no key for exactly this reason, and admin accounts are deactivated
     * rather than deleted, so the key was buying very little in the first place.
     */
    author_admin_id: text("author_admin_id"),
    author_name: text("author_name"),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_offer_counters_offer").on(t.offer_id),
    index("idx_offer_counters_response").on(t.response_id),
  ],
)
