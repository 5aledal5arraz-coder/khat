/**
 * Phase X Step 1 — Market Intelligence schema.
 *
 *   market_topic_signals  — one row per externally-collected topic
 *                            signal (a YouTube video, a podcast episode).
 *                            Stores raw fetch + AI-extracted theme/
 *                            emotional_trigger/controversy_score.
 *   market_topic_clusters  — recomputed-from-scratch per nightly job.
 *                            Buckets signals by (theme, language) and
 *                            stores aggregate stats + narrative hooks.
 *
 * The clusters table is a *projection*; it is wiped + rewritten on every
 * cluster job so we never need migrations to revise its shape.
 */

import {
  pgTable,
  text,
  jsonb,
  timestamp,
  real,
  integer,
  bigint,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

export const MARKET_SIGNAL_SOURCES = [
  "youtube",
  "podcast_apple",
  // Phase 4: operator-authored editorial signals (observations, quotes,
  // social tensions, cultural shifts, …). Marked with operator_created=true.
  "manual",
] as const
export type MarketSignalSource = (typeof MARKET_SIGNAL_SOURCES)[number]

/** Sub-vocabulary for source='manual' signals. Stored in the signal
 *  row's `raw` jsonb as `manual_kind`. Internal key is English; the
 *  operator copy lives in the Phase 4 form module. */
export const MANUAL_SIGNAL_KINDS = [
  "observation",
  "quote",
  "social_tension",
  "cultural_shift",
  "emotional_phenomenon",
  "conversation_pattern",
  "philosophical_contradiction",
  "audience_pain_point",
  "other",
] as const
export type ManualSignalKind = (typeof MANUAL_SIGNAL_KINDS)[number]

export const marketTopicSignals = pgTable(
  "market_topic_signals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Origin platform. CHECK constraint enforced in post-schema.sql. */
    source: text("source").$type<MarketSignalSource>().notNull(),
    /** Stable upstream identifier (videoId, trackId, episodeGuid). */
    external_id: text("external_id").notNull(),

    title: text("title").notNull(),
    description: text("description"),
    language: text("language").notNull().default("ar"),

    /** Popularity proxy. Views for YouTube; null for iTunes (no API). */
    view_signal: bigint("view_signal", { mode: "number" }),

    collected_at: timestamp("collected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Set by the extraction pass — null until then. */
    theme: text("theme"),
    emotional_trigger: text("emotional_trigger"),
    controversy_score: real("controversy_score"),

    /** Reserved for v2 — title embedding for similarity dedup. */
    embedding: jsonb("embedding"),

    /** Untrimmed adapter response for forensic replay. */
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),

    // ─── Phase 1 — Editorial intelligence columns ────────────────────
    // No job/UI reads or writes these yet. Backfill on existing rows
    // sets review_status='new', operator_created=false, everything
    // else null. Vocab + CHECKs live in editorial-intelligence.ts +
    // post-schema. Soft FK on trusted_source_id (SET NULL on delete).

    /** Editorial review state. Mutually exclusive — see
     *  SIGNAL_REVIEW_STATUSES in editorial-intelligence.ts. */
    review_status: text("review_status").notNull().default("new"),

    /** Multi-tag editorial annotations (strong, timeless, etc.).
     *  See SIGNAL_EDITORIAL_TAGS for the closed vocab. */
    editorial_tags: jsonb("editorial_tags").$type<string[]>(),

    /** admin_users.id of the last reviewer. Soft link. */
    reviewed_by: text("reviewed_by"),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),

    /** Free-text editorial note from the operator. */
    operator_notes: text("operator_notes"),

    /** True when this signal was authored by an operator (not
     *  ingested from an adapter). Used by the scorer as a strong
     *  positive prior. */
    operator_created: boolean("operator_created").notNull().default(false),

    /** Optional link to a market_trusted_sources row. Drives the
     *  source_trust + editorial_alignment terms in signal_score. */
    trusted_source_id: text("trusted_source_id"),

    /** Output of the scorer (Phase 5). Range [0..1]. Null until
     *  scoring runs. */
    signal_score: real("signal_score"),

    /** Per-component breakdown for explainability + dev panels. */
    score_components: jsonb("score_components").$type<
      Record<string, number>
    >(),
  },
  (t) => [
    uniqueIndex("uq_market_signals_source_external").on(t.source, t.external_id),
    index("idx_market_signals_collected_at").on(t.collected_at),
    index("idx_market_signals_theme").on(t.theme),
    index("idx_market_signals_language").on(t.language),
    index("idx_market_signals_review_status").on(t.review_status),
    index("idx_market_signals_signal_score").on(t.signal_score),
    index("idx_market_signals_trusted_source").on(t.trusted_source_id),
  ],
)

export const marketTopicClusters = pgTable(
  "market_topic_clusters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label").notNull(),
    language: text("language").notNull(),
    signal_count: integer("signal_count").notNull(),
    dominant_themes: jsonb("dominant_themes").$type<string[]>().notNull(),
    dominant_emotions: jsonb("dominant_emotions").$type<string[]>().notNull(),
    median_view_signal: bigint("median_view_signal", { mode: "number" }),
    source_breakdown: jsonb("source_breakdown")
      .$type<Record<string, number>>()
      .notNull(),
    narrative_hooks: jsonb("narrative_hooks").$type<string[]>(),
    /** Phase 6: sum of per-signal contribution weights inside the
     *  bucket. Generator sorts by this column so reviewed + scored
     *  signals dominate over raw popularity. */
    editorial_score: real("editorial_score"),
    computed_at: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_market_clusters_computed_at").on(t.computed_at),
    index("idx_market_clusters_language").on(t.language),
    index("idx_market_clusters_editorial_score").on(t.editorial_score),
  ],
)
