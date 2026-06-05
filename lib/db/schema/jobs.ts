/**
 * Khat Brain — background job queue.
 *
 * Postgres-backed queue. Workers claim jobs via `SELECT ... FOR UPDATE
 * SKIP LOCKED` (see lib/jobs/worker.ts) so multiple worker processes
 * are safe. We deliberately did NOT take a Redis dependency in Phase 1 —
 * the project already runs Postgres on DigitalOcean Managed; adding
 * Redis is a real ops cost. When throughput demands it (10+ jobs/sec
 * sustained, or sub-second wake latency), the abstraction in lib/jobs
 * lets us swap in BullMQ without rewriting callers.
 */

import { pgTable, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core"

export const JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead", // exceeded max_attempts
  "cancelled",
] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const jobs = pgTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  /** Logical job type — handlers register against this string. */
  type: text("type").notNull(),

  status: text("status").$type<JobStatus>().notNull().default("pending"),

  /** Producer payload — handler input. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),

  /** Handler output, only set on success. */
  result: jsonb("result").$type<Record<string, unknown>>(),

  /** Last failure message; cleared on retry success. */
  error_message: text("error_message"),

  // ─── Queue mechanics ─────────────────────────────────────────────────
  /** Higher numbers run first when many jobs are pending. */
  priority: integer("priority").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  max_attempts: integer("max_attempts").notNull().default(3),
  /** Earliest time the job is eligible to run. Default = now (immediate). */
  run_after: timestamp("run_after", { withTimezone: true })
    .notNull()
    .defaultNow(),

  /**
   * Worker lock — set when a worker claims the job, cleared on completion.
   * Stale locks (locked_at older than the lease window) are reclaimable.
   */
  locked_by: text("locked_by"),
  locked_at: timestamp("locked_at", { withTimezone: true }),

  // ─── Lifecycle ───────────────────────────────────────────────────────
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
