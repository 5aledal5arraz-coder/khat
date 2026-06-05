/**
 * Phase 1.6 — AI rate-limit audit log.
 *
 * Every permit evaluation produces one row here (unless the policy mode
 * is `off`). This is the operator's visibility surface: which calls
 * would have been blocked under `enforce` while we're in `report`, who
 * the heavy actors are, and how often subject-level locks fire.
 *
 * The row is written BEFORE the AI call lands. `decision` records the
 * permit outcome at evaluation time. `enforced` reflects whether the
 * outcome actually short-circuited the call (true) or was advisory
 * (false — REPORT mode lets blocked calls through but still logs).
 *
 * Useful queries:
 *   • Calls that would have been blocked in the last day:
 *       SELECT decision, count(*) FROM ai_rate_limit_events
 *       WHERE created_at > now() - interval '24 hours'
 *         AND decision LIKE 'blocked_%'
 *       GROUP BY decision;
 *   • Top actors by allowed runs:
 *       SELECT actor_id, count(*) FROM ai_rate_limit_events
 *       WHERE decision = 'allowed'
 *       GROUP BY actor_id ORDER BY 2 DESC;
 *   • Subject thrash:
 *       SELECT subject_table, subject_id, count(*) FROM ai_rate_limit_events
 *       WHERE decision = 'blocked_subject_lock'
 *       GROUP BY 1,2 ORDER BY 3 DESC;
 *
 * Retention: P1.5 patch — `allowed` events older than 30 days are
 * deleted by the retention job. All `blocked_*` events kept forever.
 */

import { pgTable, text, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core"
import type { AiTaskKind } from "./ai-runs"

export const RATE_LIMIT_MODES = ["off", "report", "enforce"] as const
export type RateLimitMode = (typeof RATE_LIMIT_MODES)[number]

export const RATE_LIMIT_TIERS = ["light", "expensive"] as const
export type RateLimitTier = (typeof RATE_LIMIT_TIERS)[number]

/**
 * The full set of decisions the policy may return.
 *
 *   allowed                 — permit granted
 *   blocked_concurrency     — tier concurrency limit reached
 *   blocked_daily_cost      — tier daily-cost limit reached
 *   blocked_subject_lock    — another run is already active for the
 *                             same (subject_table, subject_id)
 *   bypassed_call           — the call passed `bypassRateLimit: true`
 *   bypassed_actor          — actor matched the env-var allowlist
 *   bypassed_session        — a session-level bypass (e.g. eval CLI)
 *                             is active
 */
export const RATE_LIMIT_DECISIONS = [
  "allowed",
  "blocked_concurrency",
  "blocked_daily_cost",
  "blocked_subject_lock",
  "bypassed_call",
  "bypassed_actor",
  "bypassed_session",
] as const
export type RateLimitDecision = (typeof RATE_LIMIT_DECISIONS)[number]

export const aiRateLimitEvents = pgTable(
  "ai_rate_limit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** off | report | enforce — the mode in effect at evaluation. */
    mode: text("mode").$type<RateLimitMode>().notNull(),
    /** What the policy decided. */
    decision: text("decision").$type<RateLimitDecision>().notNull(),
    /**
     * Whether this decision actually short-circuited the call.
     *   true  → an error was thrown to the caller
     *   false → the call proceeded (REPORT mode, or allowed/bypass)
     */
    enforced: text("enforced").notNull().default("false"),

    /** light | expensive — derived from task_kind by the policy. */
    tier: text("tier").$type<RateLimitTier>().notNull(),
    task_kind: text("task_kind").$type<AiTaskKind>().notNull(),

    actor_id: text("actor_id"),
    subject_table: text("subject_table"),
    subject_id: text("subject_id"),

    // ─── Snapshot of policy state at decision time ─────────────────────
    /**
     * Number of ai_runs with status='running' for this tier when the
     * permit was evaluated. NULL when not measured (off mode / bypass).
     */
    current_concurrency: integer("current_concurrency"),
    /** Configured tier concurrency limit (10 / 3 default). */
    concurrency_limit: integer("concurrency_limit"),
    /**
     * Sum of cost_usd for completed ai_runs of this tier today (UTC
     * day boundary). NULL when not measured.
     */
    daily_cost_so_far_usd: real("daily_cost_so_far_usd"),
    /** Configured tier daily cost limit ($5 / $25 default). */
    daily_cost_limit_usd: real("daily_cost_limit_usd"),

    /**
     * Free-form details — bypass reason, limit-override source,
     * tier-mapping diagnostics. Lenient (no Zod schema yet).
     */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("idx_arle_created_at").on(t.created_at),
    index("idx_arle_decision_created").on(t.decision, t.created_at),
    index("idx_arle_actor_created").on(t.actor_id, t.created_at),
    index("idx_arle_subject").on(t.subject_table, t.subject_id),
  ],
)
