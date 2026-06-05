/**
 * Phase 1.3 — JSONB validation drift log.
 *
 * Every time a Zod schema rejects a JSONB value (REPORT mode, ENFORCE
 * mode, or the scanner pass), one row is written here. The wrapper
 * (lib/db/validators/index.ts) fires the insert and-forgets it so a
 * failure to log can never break the real write path.
 *
 * Useful queries:
 *   • Drift in the last 24h:
 *       SELECT count(*) FROM jsonb_validation_events
 *       WHERE created_at > now() - interval '24 hours';
 *   • Which column drifts most:
 *       SELECT column_name, count(*) FROM jsonb_validation_events
 *       GROUP BY column_name ORDER BY 2 DESC;
 *   • Same offending value repeating:
 *       SELECT raw_value_hash, count(*) FROM jsonb_validation_events
 *       GROUP BY raw_value_hash ORDER BY 2 DESC LIMIT 20;
 *
 * Retention: handled in Phase 1.5 (nightly job). For Phase 1.3, no TTL.
 */

import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core"

export const JSONB_VALIDATION_MODES = ["report", "enforce", "scanner"] as const
export type JsonbValidationMode = (typeof JSONB_VALIDATION_MODES)[number]

export const JSONB_VALIDATION_SOURCES = ["write-wrapper", "scanner"] as const
export type JsonbValidationSource = (typeof JSONB_VALIDATION_SOURCES)[number]

export const jsonbValidationEvents = pgTable(
  "jsonb_validation_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Which JSONB column the rejected value was destined for. */
    column_name: text("column_name").notNull(),
    /** Owning table. */
    table_name: text("table_name").notNull(),
    /**
     * Row id when known. NULL on inserts where the id is generated
     * downstream of the wrapper call. The scanner always sets this.
     */
    row_id: text("row_id"),
    /** report | enforce | scanner. */
    mode: text("mode").$type<JsonbValidationMode>().notNull(),
    /** write-wrapper | scanner. */
    source: text("source").$type<JsonbValidationSource>().notNull(),

    /** Number of Zod issues observed. */
    issue_count: integer("issue_count").notNull(),
    /** Compact human-readable issue summary (capped at ~500 chars). */
    issue_summary: text("issue_summary").notNull(),
    /** SHA-256[:16] of the JSON-stringified rejected value. */
    raw_value_hash: text("raw_value_hash").notNull(),
  },
  (t) => [
    index("idx_jve_created_at").on(t.created_at),
    index("idx_jve_table_column_created").on(t.table_name, t.column_name, t.created_at),
    index("idx_jve_raw_value_hash").on(t.raw_value_hash),
  ],
)
