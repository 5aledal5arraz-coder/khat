/**
 * Phase X Step 3 — Hybrid Topic Generation log.
 *
 * Append-only audit + analytics record for every hybrid generation
 * attempt. One row per AI call. The accepted topics live in
 * khat_map_episode_candidates (the existing wizard surface); this
 * table is the *trace* — what the model saw, what it produced, what
 * was rejected, and why.
 *
 * Used by:
 *   - admin UI (show last N generations + their reject reasons)
 *   - cost analytics (join on ai_run_id)
 *   - performance learning (see what kinds of inputs predict accepts)
 */

import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core"
import { khatMapSeasons } from "./khat-map"
import { aiRuns } from "./ai-runs"

export const HYBRID_GENERATION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const
export type HybridGenerationStatus = (typeof HYBRID_GENERATION_STATUSES)[number]

export const hybridTopicGenerations = pgTable(
  "hybrid_topic_generations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    season_id: text("season_id").references(() => khatMapSeasons.id, {
      onDelete: "set null",
    }),
    language: text("language").notNull().default("ar"),
    status: text("status")
      .$type<HybridGenerationStatus>()
      .notNull()
      .default("pending"),

    /** Counts + provenance for the inputs the AI saw. */
    input_snapshot: jsonb("input_snapshot")
      .$type<HybridInputSnapshot>()
      .notNull(),
    /** All topics returned by the model (accepted + rejected together). */
    output_topics: jsonb("output_topics").$type<HybridOutputTopic[]>(),
    accepted_count: integer("accepted_count").notNull().default(0),
    rejected_count: integer("rejected_count").notNull().default(0),
    /** Map of reason → count, e.g. { generic_title: 2, kuwait_bias: 1 }. */
    rejection_summary: jsonb("rejection_summary").$type<Record<string, number>>(),

    /** Soft FK to ai_runs.id. SET NULL if the AI run row is purged. */
    ai_run_id: text("ai_run_id").references(() => aiRuns.id, {
      onDelete: "set null",
    }),

    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    error_message: text("error_message"),
  },
  (t) => [
    index("idx_hybrid_gen_season_id").on(t.season_id),
    index("idx_hybrid_gen_language").on(t.language),
    index("idx_hybrid_gen_status").on(t.status),
    index("idx_hybrid_gen_created_at").on(t.created_at),
  ],
)

// ─── Domain shapes (TS-only, no DB enforcement) ──────────────────────

export interface HybridInputSnapshot {
  /** Number of fresh original-thinking topics fed in. */
  original_topic_count: number
  /** Number of market clusters fed in. */
  market_cluster_count: number
  /** Number of perf-learning hints (strong/weak topic_domains). */
  worked_hint_count: number
  /** Total existing-title exclusions surfaced to the model. */
  exclusion_count: number
  /** Whether Kuwait framing was permitted on this run. */
  allow_kuwait_bias: boolean
  /** Caller-supplied count target. */
  asked_count: number
  /** Lens keys that appeared in the original-topic feed. */
  lens_keys: string[]
}

export interface HybridOutputTopic {
  title: string
  why_it_matters: string
  why_now: string
  emotional_hook: string
  conflict_angle: string
  market_inspiration: string
  /** The market cluster label (= signal theme) this topic drew from, or "none". */
  primary_theme?: string
  original_lens: string
  suggested_episode_type: string
  suggested_topic_domain: string
  estimated_strength_score: number
  /** Stamped by reject.ts when the candidate fails filters. */
  rejected: boolean
  rejection_reasons?: string[]
  /** Source ids when accepted: which original_thinking_topics row was consumed. */
  consumed_original_topic_id?: string | null
}
