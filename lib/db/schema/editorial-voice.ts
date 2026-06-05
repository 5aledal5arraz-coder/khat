/**
 * Phase Beta — Editorial Voice Signals.
 *
 * Every operator decision (accept / reject / promote / save-for-later)
 * on a discovery candidate is a vote on "what Khat sounds like."
 * Aggregated across a season, those votes form an editorial voice
 * fingerprint: which archetypes / topic domains / story shapes the
 * operator consistently chooses, and which they consistently reject.
 *
 * Phase Beta only CAPTURES these signals — it doesn't yet feed them
 * back into archetype generation. That feedback loop is Phase Gamma.
 * Capturing now means by the time Gamma ships we already have a real
 * corpus of operator preferences per season to learn from.
 *
 * Schema is intentionally narrow + append-only:
 *   - one row per operator action
 *   - immutable (no updates after insert)
 *   - season-scoped (we never cross seasons)
 *   - retention: keep indefinitely; this is small, high-signal data
 */

import {
  pgTable,
  text,
  jsonb,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core"
import { khatMapSeasons } from "./khat-map"
import { guestDiscoveryCandidates } from "./discovery"

export const EDITORIAL_VOICE_SIGNAL_TYPES = [
  "accept",
  "reject",
  "promote",
  "save_for_later",
] as const
export type EditorialVoiceSignalType =
  (typeof EDITORIAL_VOICE_SIGNAL_TYPES)[number]

export const editorialVoiceSignals = pgTable(
  "editorial_voice_signals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Required — voice differs by season. */
    season_id: text("season_id")
      .notNull()
      .references(() => khatMapSeasons.id, { onDelete: "cascade" }),

    /** The candidate the operator acted on. */
    candidate_id: text("candidate_id").references(
      () => guestDiscoveryCandidates.id,
      { onDelete: "set null" },
    ),

    signal_type: text("signal_type").$type<EditorialVoiceSignalType>().notNull(),

    /**
     * Snapshot of the row's archetype + scores AT THE TIME OF THE
     * SIGNAL. Stored as jsonb so future deletions of the candidate
     * don't destroy the fingerprint history.
     *
     * Shape:
     *   {
     *     archetype_id: string
     *     archetype_name: string
     *     topic_domain?: string
     *     editorial_fit_score?: number
     *     hidden_gem_score?: number
     *     identity_confidence?: number
     *     pipeline_version: "alpha" | null
     *   }
     */
    snapshot: jsonb("snapshot"),

    /**
     * Optional weight — operators may eventually flag actions as
     * "strong yes" / "weak yes". Phase Beta writes 1.0 always; Phase
     * Gamma uses this as the learning weight.
     */
    weight: numeric("weight").notNull().default("1.0"),

    /** Free-form reason text (operator-supplied on reject). */
    note: text("note"),

    /** Who acted. Soft FK to admin_users.id. */
    actor_id: text("actor_id"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_evs_season").on(t.season_id),
    index("idx_evs_signal_type").on(t.signal_type),
    index("idx_evs_created").on(t.created_at),
  ],
)

export interface EditorialVoiceSnapshot {
  archetype_id: string | null
  archetype_name: string | null
  topic_domain: string | null
  editorial_fit_score: number | null
  hidden_gem_score: number | null
  identity_confidence: number | null
  pipeline_version: "alpha" | null
}
