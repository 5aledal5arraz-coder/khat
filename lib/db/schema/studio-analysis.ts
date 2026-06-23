/**
 * Khat Brain Phase 4 — consolidated Studio persistence.
 *
 * One table per session/kind tuple, replacing the 11 legacy `studio_*`
 * output tables. Each kind's domain shape lives inside `data` (jsonb),
 * the row metadata (status, error, timestamps, edited fields) is
 * uniform across all kinds.
 *
 * Migration approach is incremental:
 *   - Phase 4 routes 4 kinds through here (chapters, clips,
 *     deep_analysis, guest_intelligence)
 *   - Backfill copies all kinds from legacy tables
 *   - Other kinds' write paths migrate in Phase 5+
 *
 * The eir_id column is the spine link; studio_session_id is the
 * legacy session reference. Both nullable so a row can be authored at
 * any granularity (e.g. an early intelligence record can land before
 * a session is created).
 */

import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core"
import { episodeIntelligenceRecords } from "./eir"

/**
 * Discriminator for what the row represents. Add new kinds here as
 * features land — the migration's CHECK constraint enforces the set.
 */
export const STUDIO_ANALYSIS_KINDS = [
  "transcript",
  "ai_outputs",
  "chapters",
  "clips",
  "quotes",
  "website_package",
  "analyzer",
  "deep_analysis",
  "guest_intelligence",
  "push_log",
  "metadata",
  "reserved",
  // Studio redesign (two-deliverable OS):
  /** Persisted GlobalEpisodeIntelligence — the shared understanding layer,
   *  reused by the Growth package + Website knowledge hub. */
  "episode_intelligence",
  /** Copy-ready YouTube growth package (Goal 1). */
  "growth_package",
] as const
export type StudioAnalysisKind = (typeof STUDIO_ANALYSIS_KINDS)[number]

/** Lifecycle of a single record. */
export const STUDIO_ANALYSIS_STATUSES = [
  "pending",
  "generating",
  "ready",
  "error",
  "archived",
] as const
export type StudioAnalysisStatus = (typeof STUDIO_ANALYSIS_STATUSES)[number]

export const studioAnalysisRecords = pgTable(
  "studio_analysis_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Spine link. SET NULL on EIR delete — record survives. */
    eir_id: text("eir_id").references(() => episodeIntelligenceRecords.id, {
      onDelete: "set null",
    }),

    /**
     * Legacy studio_sessions.id. Kept as text since the legacy table
     * uses uuid PK; we cast to text on write so this column accepts
     * both legacy uuid and Phase 5+ text-keyed sessions.
     */
    studio_session_id: text("studio_session_id"),

    kind: text("kind").$type<StudioAnalysisKind>().notNull(),
    status: text("status")
      .$type<StudioAnalysisStatus>()
      .notNull()
      .default("ready"),

    /** Domain-specific shape per kind. Validated by the repository. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),

    /** Untrimmed provider output for forensic replay. */
    raw_provider_response: jsonb("raw_provider_response").$type<Record<string, unknown>>(),

    error: text("error"),

    /** Field-level edit log when admin overrides AI output. */
    edited_fields: jsonb("edited_fields").$type<Record<string, unknown>>(),

    generated_at: timestamp("generated_at", { withTimezone: true }),
    published_at: timestamp("published_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_studio_analysis_eir").on(t.eir_id),
    index("idx_studio_analysis_session").on(t.studio_session_id),
    index("idx_studio_analysis_eir_kind").on(t.eir_id, t.kind),
    index("idx_studio_analysis_session_kind").on(t.studio_session_id, t.kind),
    index("idx_studio_analysis_status").on(t.status),
  ],
)

// ─── Performance snapshots (time-series) ──────────────────────────────
//
// Companion to khat_map_episode_performance, which stores ONE row per
// candidate (latest known). performance_snapshots stores N rows per EIR
// across time, so the YouTube worker writes a fresh row per refresh
// instead of overwriting history.

export const PERFORMANCE_SNAPSHOT_SOURCES = [
  "youtube_api",
  "manual_sync",
  "seed",
  "backfill",
] as const
export type PerformanceSnapshotSource = (typeof PERFORMANCE_SNAPSHOT_SOURCES)[number]

export const performanceSnapshots = pgTable(
  "performance_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    eir_id: text("eir_id")
      .notNull()
      .references(() => episodeIntelligenceRecords.id, { onDelete: "cascade" }),

    /** Soft pointer to episodes.id; we don't FK because the YouTube
        worker may write before/after the episode row exists. */
    episode_id: text("episode_id"),

    snapshot_at: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    view_count: text("view_count"),
    like_count: text("like_count"),
    comment_count: text("comment_count"),

    source: text("source").$type<PerformanceSnapshotSource>().notNull(),

    /** Untrimmed YouTube response for forensic replay. */
    raw: jsonb("raw").$type<Record<string, unknown>>(),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_perf_snap_eir_at").on(t.eir_id, t.snapshot_at),
    index("idx_perf_snap_episode").on(t.episode_id),
  ],
)
