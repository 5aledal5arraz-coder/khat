/**
 * Phase 2.1 — Illegal EIR phase transition audit.
 *
 * Append-only log of any UPDATE on `episode_intelligence_records.phase`
 * that does not match the legal transition matrix in
 * `lib/eir/transitions.ts`. Written by the database-level trigger
 * function `khat_eir_check_transition()` introduced by
 * `scripts/migrate-phase2-1-eir-trigger.ts`.
 *
 * The trigger function ships in REPORT mode by default:
 *   • Every illegal attempt is logged here.
 *   • The UPDATE still succeeds (no exception).
 *
 * Flipping to ENFORCE mode (`SET app.khat_eir_transition_mode = 'enforce'`
 * at the session level, or `ALTER DATABASE … SET …` globally) causes the
 * trigger to RAISE EXCEPTION on illegal transitions while still logging
 * here. Same REPORT/ENFORCE pattern as P1.3 JSONB validators and P1.6
 * rate-limit.
 *
 * Useful queries:
 *   • Any illegal attempts in the last 7 days:
 *       SELECT count(*) FROM eir_invalid_transition_attempts
 *       WHERE attempted_at > now() - interval '7 days';
 *   • Most common illegal pairs:
 *       SELECT from_phase, attempted_to_phase, count(*)
 *       FROM eir_invalid_transition_attempts
 *       GROUP BY 1, 2 ORDER BY 3 DESC;
 *   • Which actor (when set) most frequently attempts illegal moves:
 *       SELECT actor, count(*) FROM eir_invalid_transition_attempts
 *       WHERE actor IS NOT NULL
 *       GROUP BY 1 ORDER BY 2 DESC;
 *
 * Soft FK on eir_id intentional — matches the codebase pattern for
 * audit tables (cf. eir_phase_transitions.eir_id which DOES have an FK,
 * but this table is meta-audit and we don't want CASCADE-on-delete to
 * erase evidence of illegal-write attempts).
 */

import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core"

export const EIR_TRANSITION_MODES = ["report", "enforce"] as const
export type EirTransitionMode = (typeof EIR_TRANSITION_MODES)[number]

export const eirInvalidTransitionAttempts = pgTable(
  "eir_invalid_transition_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Soft pointer to episode_intelligence_records.id. NO FK on purpose:
     *  the audit row must survive even if the offending EIR is deleted. */
    eir_id: text("eir_id").notNull(),

    /** The phase the EIR was in when the illegal UPDATE arrived. */
    from_phase: text("from_phase"),

    /** The phase the offending UPDATE attempted to move to. */
    attempted_to_phase: text("attempted_to_phase").notNull(),

    /** Whoever the session has identified as the actor via
     *  `SET app.khat_eir_transition_actor = '<id>'`. NULL when unset. */
    actor: text("actor"),

    /** 'report' (default) or 'enforce'. Mode in effect at the moment
     *  the trigger fired. */
    mode: text("mode").$type<EirTransitionMode>().notNull(),

    attempted_at: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Reserved for future forensics — currently always NULL because
     *  the trigger can't reach the originating SQL statement text from
     *  a row-level trigger. Kept as a column so a later operator-facing
     *  forensic tool can populate it without a schema migration. */
    raw_sql: text("raw_sql"),
  },
  (t) => [
    index("idx_eita_attempted_at").on(t.attempted_at),
    index("idx_eita_eir_attempted").on(t.eir_id, t.attempted_at),
    index("idx_eita_mode_attempted").on(t.mode, t.attempted_at),
  ],
)
