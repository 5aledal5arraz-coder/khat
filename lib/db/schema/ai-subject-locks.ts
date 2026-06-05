/**
 * Phase 1.6 (PATCH) — subject-level double-generation lock.
 *
 * Why a row table instead of `pg_advisory_lock`:
 *
 *   The connection pool reuses pg sessions. `pg_try_advisory_lock` is
 *   session-scoped and reentrant — two sequential acquires from the
 *   same JS process can land on the same pg session, where the second
 *   `pg_try_advisory_lock` call returns TRUE (already held by this
 *   session) instead of FALSE. A unique row-with-conflict gives true
 *   cross-pool exclusion.
 *
 * Lifecycle:
 *
 *   acquire → INSERT ... ON CONFLICT (subject_table, subject_id)
 *             DO NOTHING RETURNING owner_token
 *             • If rows.length === 1, the caller owns the lock.
 *             • Otherwise, another in-flight call holds it.
 *   release → DELETE WHERE (table, id, owner_token = me)
 *             The owner-token guard means a stale-cleanup acquire
 *             can't release someone else's lock.
 *   stale-clean → DELETE WHERE acquired_at < now() - 10 minutes
 *                 (router default timeout is 120 s, so 10 min is a
 *                  generous orphan window).
 *
 * The table is small (one row per in-flight AI call). Bounded growth.
 */

import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core"

export const aiSubjectLocks = pgTable(
  "ai_subject_locks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subject_table: text("subject_table").notNull(),
    subject_id: text("subject_id").notNull(),
    acquired_at: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Random 16-hex-char token so the owning caller can release safely. */
    owner_token: text("owner_token").notNull(),
  },
  (t) => [
    uniqueIndex("uq_asl_subject").on(t.subject_table, t.subject_id),
    index("idx_asl_acquired_at").on(t.acquired_at),
  ],
)
