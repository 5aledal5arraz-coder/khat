import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core"
import { partnershipOffers } from "./sponsorship-ai"

/**
 * The company's reply to a partnership offer.
 *
 * ── A COUNTER-OFFER, NOT AN EDIT ────────────────────────────────────────────
 * Khaled's first sketch let the company type over our prices. That inverts the
 * negotiation: the moment they erase 2,750 and write 1,800, THEY have set the
 * anchor and we are bargaining upward from their number — the hardest position
 * in a sale. So our price is never overwritten and never leaves the page. It
 * stays printed, and their figure sits BESIDE it under «اقتراحكم».
 *
 * The flexibility is identical; the framing is not. They are asking for a
 * concession, not announcing a price.
 *
 * For the same reason they SELECT a package rather than compose one — otherwise
 * a reply arrives proposing a season at a single-episode rate, and we end up
 * negotiating over something we never offered.
 *
 * ── APPEND-ONLY ─────────────────────────────────────────────────────────────
 * Every submission is a new row; nothing is ever updated in place. A
 * negotiation is a sequence, and six months later the answer to "what did they
 * ask for, and what did we settle on?" has to exist. `partnership_offers`
 * itself keeps no history — an edit there overwrites the previous version —
 * which is exactly why this table cannot behave the same way.
 *
 * ── WHO REPLIED ─────────────────────────────────────────────────────────────
 * Name, email and job title are captured on every submission. The link and
 * password are shared inside a company, so "the company replied" is not a fact
 * the system can otherwise establish — and if a later click-to-agree is ever to
 * carry weight, the identity of the person clicking is the whole point.
 */
export const offerResponses = pgTable(
  "offer_responses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

    offer_id: text("offer_id")
      .notNull()
      .references(() => partnershipOffers.id, { onDelete: "cascade" }),

    /**
     * The package they chose, stored as the NAME as it was shown to them —
     * not an index or an id. Offers are edited between versions, so an index
     * would silently point at a different package after any reorder, and a
     * dispute would turn on which list we happened to be looking at.
     */
    selected_package: text("selected_package").notNull(),

    /**
     * Their proposed figure. Nullable: a reply may accept the price as offered
     * and only ask a question. `numeric(10,3)` because the Kuwaiti dinar has
     * three decimal places — a two-decimal column would round 1,500.750 away.
     */
    proposed_amount: numeric("proposed_amount", { precision: 10, scale: 3 }),
    proposed_currency: text("proposed_currency").notNull().default("KWD"),

    /** Free text: conditions, questions, timing. Often the useful part. */
    notes: text("notes"),

    responder_name: text("responder_name").notNull(),
    responder_email: text("responder_email").notNull(),
    responder_job_title: text("responder_job_title"),

    /**
     * new → nobody has looked. reviewed → seen, no decision yet.
     * accepted / declined → Khaled's answer, written from the admin only.
     * The company can never move this column.
     */
    status: text("status").notNull().default("new"),

    /** Khaled's own note on the reply — never shown to the company. */
    internal_note: text("internal_note"),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_offer_responses_offer").on(t.offer_id),
    index("idx_offer_responses_status").on(t.status),
  ],
)
