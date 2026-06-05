/**
 * Khat Brain Phase 8 — Performance learning signals.
 *
 * One row per published EIR. Stores rolling-window metrics (7/14/28d
 * views, engagement rates, velocities) plus the composite
 * editorial_signal_score that feeds the next season's editorial
 * controls.
 *
 * Companion to:
 *   - performance_snapshots (raw time-series, written by YouTube worker)
 *   - khat_map_episode_performance (per-candidate latest, written by
 *     syncSeasonPerformance — Phase 1+2)
 *
 * This new table is per-EIR (not per-candidate), so the spine drives
 * learning rather than the candidate-stage record.
 */

import { pgTable, text, jsonb, timestamp, real, index, uniqueIndex } from "drizzle-orm/pg-core"
import { episodeIntelligenceRecords } from "./eir"

export const PERFORMANCE_SIGNAL_BASELINES = ["season", "global", "absolute"] as const
export type PerformanceSignalBaseline = (typeof PERFORMANCE_SIGNAL_BASELINES)[number]

export const episodePerformanceSignals = pgTable(
  "episode_performance_signals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eir_id: text("eir_id")
      .notNull()
      .references(() => episodeIntelligenceRecords.id, { onDelete: "cascade" }),

    // Rolling-window views (text — matches performance_snapshots type).
    views_at_7d: real("views_at_7d"),
    views_at_14d: real("views_at_14d"),
    views_at_28d: real("views_at_28d"),

    // Engagement metrics (computed at the latest snapshot we have).
    like_rate: real("like_rate"),
    comment_rate: real("comment_rate"),
    engagement_rate: real("engagement_rate"),

    // Velocities — views per day across each window.
    view_velocity_7d: real("view_velocity_7d"),
    view_velocity_14d: real("view_velocity_14d"),
    view_velocity_28d: real("view_velocity_28d"),

    // Composite editorial signal in [0, 1]. Higher = stronger.
    editorial_signal_score: real("editorial_signal_score"),

    // Which baseline drove the views_score component.
    baseline_used: text("baseline_used").$type<PerformanceSignalBaseline>(),

    /** Sample sizes + median + raw inputs — for explainability. */
    explanation: jsonb("explanation").$type<PerformanceSignalExplanation>(),

    calculated_at: timestamp("calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_episode_performance_signals_eir").on(t.eir_id),
    index("idx_episode_performance_signals_score").on(t.editorial_signal_score),
  ],
)

export interface PerformanceSignalExplanation {
  /** First snapshot timestamp used (the publish-anchor). */
  publish_anchor_at: string | null
  /** Per-window snapshot pick metadata. */
  windows: {
    [k: "7d" | "14d" | "28d" | string]:
      | {
          chosen_snapshot_at: string | null
          views: number | null
          /** distance in hours from the ideal window boundary */
          distance_hours: number | null
          /** "exact" | "before" | "after" | "missing" */
          fit: string
        }
      | undefined
  }
  /** Median used for normalization. */
  baseline: {
    type: PerformanceSignalBaseline
    median_views: number | null
    sample_size: number
  }
  /** Component scores (each in [0,1]) before weighting. */
  components: {
    normalized_views_score: number | null
    engagement_rate_score: number | null
    comment_rate_score: number | null
  }
  /** Weight applied to each. Sum must equal 1.0. */
  weights: {
    normalized_views: number
    engagement: number
    comment: number
  }
  /** Final score derivation in plain words for the dashboard. */
  notes: string[]
}
