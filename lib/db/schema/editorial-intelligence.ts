/**
 * Phase 1 — Editorial Intelligence schema.
 *
 * Three new tables that turn the market layer from passive ingestion
 * into operator-guided editorial memory:
 *
 *   market_signal_review_events  — audit log of every operator
 *                                   approve/reject/tag/archive. The
 *                                   learning loop reads from here.
 *   market_trusted_sources        — operator-curated source registry
 *                                   (YouTube channels, podcasts,
 *                                   websites, creators, thinkers).
 *                                   Trust + alignment scores feed the
 *                                   signal scorer.
 *   editorial_taste_weights       — soft weights learned from operator
 *                                   actions, keyed by (dimension, key).
 *                                   Decays nightly; clamped to [-1, 1].
 *
 * Phase 1 ships SCHEMA ONLY — no jobs read or write these yet. The
 * scorer (Phase 5) and the review UI (Phase 2) will wire them in.
 *
 * Cross-cutting columns on `market_topic_signals` (review_status,
 * editorial_tags, trusted_source_id, signal_score, etc.) are declared
 * in market-intelligence.ts so they live with the table.
 */

import {
  pgTable,
  text,
  jsonb,
  timestamp,
  real,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { marketTopicSignals } from "./market-intelligence"

// ─── Vocabulary (closed sets enforced by CHECK constraints) ──────────

export const SIGNAL_REVIEW_STATUSES = [
  "new",
  "approved",
  "rejected",
  "archived",
] as const
export type SignalReviewStatus = (typeof SIGNAL_REVIEW_STATUSES)[number]

export const SIGNAL_EDITORIAL_TAGS = [
  "strong",
  "weak",
  "timeless",
  "repetitive",
  "emotional",
  "controversial",
  "deep",
  "surface_level",
  "off_identity",
] as const
export type SignalEditorialTag = (typeof SIGNAL_EDITORIAL_TAGS)[number]

export const SIGNAL_REVIEW_ACTIONS = [
  "approve",
  "reject",
  "tag",
  "untag",
  "note",
  "archive",
  "restore",
  // Phase 4: operator-authored signal birth. previous_status is null.
  "create",
] as const
export type SignalReviewAction = (typeof SIGNAL_REVIEW_ACTIONS)[number]

export const TRUSTED_SOURCE_TYPES = [
  "youtube",
  "podcast",
  "website",
  "rss",
  "creator",
  "journalist",
  "thinker",
] as const
export type TrustedSourceType = (typeof TRUSTED_SOURCE_TYPES)[number]

export const TASTE_WEIGHT_DIMENSIONS = [
  "theme",
  "lens",
  "source",
  "tag",
  "topic_domain",
  // Phase 5: small contribution — learn which languages the operator
  // attends to most. Half-strength delta vs. theme/source.
  "language",
] as const
export type TasteWeightDimension = (typeof TASTE_WEIGHT_DIMENSIONS)[number]

// ─── market_signal_review_events ─────────────────────────────────────

export const marketSignalReviewEvents = pgTable(
  "market_signal_review_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    signal_id: text("signal_id")
      .notNull()
      .references(() => marketTopicSignals.id, { onDelete: "cascade" }),

    /** Operator user id (soft link to admin_users.id — not FK-enforced
     *  so historical events survive an admin deletion). */
    actor_id: text("actor_id"),

    /** What the operator did. CHECK constraint in post-schema. */
    action: text("action").$type<SignalReviewAction>().notNull(),

    /** Status snapshots for approve/reject/archive/restore actions. */
    previous_status: text("previous_status").$type<SignalReviewStatus | null>(),
    new_status: text("new_status").$type<SignalReviewStatus | null>(),

    /** For tag/untag actions only — the tag added/removed. */
    tag: text("tag").$type<SignalEditorialTag | null>(),

    /** Free-text editorial note (optional on any action). */
    note: text("note"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_signal_review_events_signal").on(t.signal_id),
    index("idx_signal_review_events_created").on(t.created_at),
    index("idx_signal_review_events_actor").on(t.actor_id),
  ],
)

// ─── market_trusted_sources ──────────────────────────────────────────

export const marketTrustedSources = pgTable(
  "market_trusted_sources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Source category. CHECK constraint enforced in post-schema. */
    source_type: text("source_type").$type<TrustedSourceType>().notNull(),

    /** URL, handle, RSS endpoint, or canonical identifier. Unique
     *  per (source_type, identifier). */
    identifier: text("identifier").notNull(),

    display_name: text("display_name").notNull(),

    language: text("language").notNull().default("ar"),
    geography: text("geography"),

    /** Operator-set, 0..1. CHECK in post-schema. */
    trust_score: real("trust_score").notNull().default(0.5),

    /** How aligned this source is with Khat's editorial identity. 0..1. */
    editorial_alignment_score: real("editorial_alignment_score")
      .notNull()
      .default(0.5),

    active: boolean("active").notNull().default(true),

    /** Phase 3: archived sources are hidden from default lists. Distinct
     *  from `active` — deactivation pauses, archival removes from view. */
    archived_at: timestamp("archived_at", { withTimezone: true }),

    notes: text("notes"),

    /** Soft link to admin_users.id. */
    created_by: text("created_by"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_trusted_sources_type_identifier").on(
      t.source_type,
      t.identifier,
    ),
    index("idx_trusted_sources_active").on(t.active),
    index("idx_trusted_sources_language").on(t.language),
    index("idx_trusted_sources_archived").on(t.archived_at),
  ],
)

// ─── editorial_taste_weights ─────────────────────────────────────────

export const editorialTasteWeights = pgTable(
  "editorial_taste_weights",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** What kind of signal-attribute this weight refers to. */
    dimension: text("dimension").$type<TasteWeightDimension>().notNull(),

    /** The actual value (e.g. "identity_fragments" for dimension=lens). */
    key: text("key").notNull(),

    /** Soft weight in [-1, 1]. Updated via EMA on each review event;
     *  decays nightly. CHECK constraint in post-schema. */
    weight: real("weight").notNull().default(0),

    /** Number of review events that have touched this weight. Used by
     *  the scorer to gate low-confidence weights. */
    sample_size: integer("sample_size").notNull().default(0),

    last_reinforced_at: timestamp("last_reinforced_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_taste_weights_dimension_key").on(t.dimension, t.key),
    index("idx_taste_weights_last_reinforced").on(t.last_reinforced_at),
  ],
)
