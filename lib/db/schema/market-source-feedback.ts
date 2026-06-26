/**
 * Performance → market-source feedback events.
 *
 * Closes the third learning loop: when a published episode performs well (or
 * poorly), the trusted source(s) behind the market signals that inspired its
 * topic get their trust nudged. One row per (episode, source) credit — also
 * the idempotency guard (an EIR is credited at most once) and the audit trail.
 */

import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core"
import { episodeIntelligenceRecords } from "./eir"

export const marketSourceFeedbackEvents = pgTable(
  "market_source_feedback_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eir_id: text("eir_id").notNull().references(() => episodeIntelligenceRecords.id, { onDelete: "cascade" }),
    /** Soft ref to market_trusted_sources.id (no FK — sources may be archived). */
    source_id: text("source_id").notNull(),
    /** The cluster label / signal theme that bridged episode → source. */
    theme: text("theme").notNull(),
    /** The episode's editorial_signal_score [0,1] at credit time. */
    signal_score: real("signal_score").notNull(),
    trust_before: real("trust_before").notNull(),
    trust_after: real("trust_after").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_source_feedback_eir").on(t.eir_id),
    index("idx_source_feedback_source").on(t.source_id),
  ],
)
