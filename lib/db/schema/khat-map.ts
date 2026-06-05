/**
 * Khat Map — DB schema (v2-only).
 *
 * 11 tables forming the editorial-intelligence layer:
 *
 *   1. khat_map_seasons              — top-level season container
 *   2. khat_map_episode_candidates   — proposed episodes (status = proposed/approved/rejected/converted)
 *   3. khat_map_guest_candidates     — proposed guests (season-scoped)
 *   4. khat_map_user_feedback        — accept/reject/edit audit (written by conversion)
 *   5. khat_map_rejected_patterns    — global memory: patterns to avoid
 *   6. khat_map_accepted_patterns    — global memory: patterns that worked
 *   7. khat_map_topic_bank           — angle inventory + freshness tracking
 *   8. khat_map_channel_fingerprint  — versioned editorial DNA (Gemini-derived)
 *   9. khat_map_season_decisions     — v2 wizard decision journal (append-only)
 *  10. khat_map_topic_fingerprints   — v2 semantic-dedup embeddings
 *  11. khat_map_user_taste_profile   — v2 derived admin preferences
 *
 * Cross-table design rules:
 *   - Every mutable table has created_at + updated_at (triggers in post-schema).
 *   - Seasons support archived_at / deleted_at soft-delete.
 *   - Foreign keys cascade on delete within a season; global memory tables
 *     (topic_bank, rejected_patterns, accepted_patterns, fingerprint) are
 *     deliberately independent and survive season deletion.
 *   - `converted_*` columns use `set null` so removing a downstream record
 *     (preparation, episode, guest_candidate) doesn't break the Khat Map row.
 */

import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core"
import type {
  KhatMapSeasonStatus,
  KhatMapTopicDomain,
  KhatMapEpisodeType,
  KhatMapEpisodeCandidateStatus,
  KhatMapGuestCandidateStatus,
  KhatMapRiskLevel,
  KhatMapEffortLevel,
  KhatMapSponsorAppeal,
  KhatMapGuestPublicLink,
  KhatMapGuestSocialAccounts,
  KhatMapGuestGender,
  KhatMapGuestQuality,
  KhatMapDecisionKind,
  KhatMapDecisionTarget,
  KhatMapV2Mode,
  KhatMapWizardStage,
  KhatMapEditorialControls,
  KhatMapFingerprintSource,
  KhatMapTasteDomainWeight,
  KhatMapTasteRejectedPattern,
  KhatMapEvidenceCitation,
  KhatMapFeedbackAction,
  KhatMapFeedbackReasonCategory,
  KhatMapPatternType,
  KhatMapPatternSeverity,
  KhatMapFreshness,
  KhatMapTopicStatus,
  KhatMapTopicQuality,
  KhatMapKhatDna,
  KhatMapFingerprintEpisodeEntry,
  KhatMapFingerprintGuestEntry,
} from "@/types/khat-map"
import { episodePreparations } from "./preparation"
import { guestCandidates } from "./guest-candidates"
import { episodes } from "./episodes"
import { guests } from "./guests"

// ─── 1. Seasons ──────────────────────────────────────────────────────────────

export const khatMapSeasons = pgTable("khat_map_seasons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  /** Sequential season index (1, 2, 3, …). Optional but typically set. */
  season_number: integer("season_number"),
  status: text("status").$type<KhatMapSeasonStatus>().notNull().default("planning"),

  /** How many episodes the wizard targets for this season. */
  target_episode_count: integer("target_episode_count").notNull().default(10),

  /**
   * v2 wizard metadata. `v2_mode` selects the generation strategy
   * (guided / strict / open_ai / manual). `v2_episode_target` mirrors
   * `target_episode_count` for the wizard's slider — kept separate to
   * avoid coupling the slider state to the season's official target.
   */
  v2_mode: text("v2_mode").$type<KhatMapV2Mode>(),
  v2_episode_target: integer("v2_episode_target"),

  /**
   * Per-season editorial controls (guest filters, domain weights, identity
   * override, hard-avoid lists). The query layer substitutes neutral
   * defaults when this is null, so consumers always receive a fully-
   * populated object.
   */
  editorial_controls: jsonb("editorial_controls")
    .$type<KhatMapEditorialControls>()
    .notNull()
    .default({
      guest_filters: { gender: "all", nationality: "any" },
      domain_weights: {},
      identity_override: {
        priorities: [],
        tone_emphasis: {},
        identity_description: null,
      },
      hard_avoid: {
        banned_topics: [],
        banned_guests: [],
        repeated_topics_to_avoid: [],
      },
    }),

  created_by: text("created_by").notNull(),

  /**
   * Two-phase wizard gate. Setup → topics → topics_locked → guests → complete.
   * Defaults to `"topics"` so newly-created seasons land in Phase A. The
   * post-schema layer enforces the enum via a CHECK constraint.
   */
  wizard_stage: text("wizard_stage")
    .$type<KhatMapWizardStage>()
    .notNull()
    .default("topics"),
  /** Stamped by `lockSeasonTopicsAction` when Phase A finishes. */
  topics_locked_at: timestamp("topics_locked_at", { withTimezone: true }),
  /**
   * Stamped the first time the operator triggers per-episode guest
   * discovery in Phase B (used for analytics + dashboard rendering).
   */
  guests_started_at: timestamp("guests_started_at", { withTimezone: true }),

  archived_at: timestamp("archived_at", { withTimezone: true }),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 2. Episode candidates ───────────────────────────────────────────────────

export const khatMapEpisodeCandidates = pgTable("khat_map_episode_candidates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  season_id: text("season_id")
    .notNull()
    .references(() => khatMapSeasons.id, { onDelete: "cascade" }),

  status: text("status")
    .$type<KhatMapEpisodeCandidateStatus>()
    .notNull()
    .default("proposed"),
  /** Slot ordering hint set when the admin pins a position. */
  slot_index: integer("slot_index"),

  // Editorial core
  working_title: text("working_title").notNull(),
  hook: text("hook"),
  why_matters: text("why_matters"),
  why_now: text("why_now"),
  goal: text("goal"),
  description: text("description"),

  // Typing
  episode_type: text("episode_type").$type<KhatMapEpisodeType>().notNull(),
  /**
   * Subject-matter axis (orthogonal to editorial-role `episode_type`).
   * Domain list maintained on the TypeScript side as KhatMapTopicDomain.
   */
  topic_domain: text("topic_domain")
    .$type<KhatMapTopicDomain>()
    .notNull()
    .default("none"),
  /**
   * Stable angle code referencing an active row in khat_map_topic_bank
   * (e.g. "philosophy.friendship_in_algorithms" or "invasion.prisoners").
   * Strict mode requires this to match a fresh bank entry; freshness is
   * advanced when the candidate is approved + converted.
   */
  topic_angle_code: text("topic_angle_code"),

  // Guest link (single — wizard does not stage backups)
  suggested_guest_candidate_id: text("suggested_guest_candidate_id"),

  // Structure
  main_axes: jsonb("main_axes").$type<string[]>().notNull().default([]),
  suggested_questions: jsonb("suggested_questions")
    .$type<string[]>()
    .notNull()
    .default([]),
  production_notes: text("production_notes"),

  // Indicators
  risk_level: text("risk_level").$type<KhatMapRiskLevel>(),
  effort_level: text("effort_level").$type<KhatMapEffortLevel>(),
  sponsor_appeal: text("sponsor_appeal").$type<KhatMapSponsorAppeal>(),

  /**
   * Production-readiness fix sprint — persist the batch engine's
   * `final_score` (editorial × taste × domain_balance × similarity).
   * Stored as `real` so we don't round to integers; nullable because
   * historical rows have no score and external imports may skip it.
   */
  composite_score: real("composite_score"),
  /**
   * Free-form rationale for the score, surfaced to the operator UI
   * (e.g. "editorial 8.4 · taste 0.71 · domain_load 0.33"). Pre-built
   * during persistence so the wizard doesn't need to recompute.
   */
  composite_score_rationale: text("composite_score_rationale"),

  // Conversion — `set null` so downstream deletes don't break history
  converted_preparation_id: text("converted_preparation_id").references(
    () => episodePreparations.id,
    { onDelete: "set null" },
  ),
  converted_episode_id: text("converted_episode_id").references(() => episodes.id, {
    onDelete: "set null",
  }),
  converted_at: timestamp("converted_at", { withTimezone: true }),

  // Lightweight feedback snapshots — full audit trail in khat_map_user_feedback
  rejection_reason: text("rejection_reason"),
  postponed_reason: text("postponed_reason"),

  /**
   * Khat Brain — link to the master Episode Intelligence Record. Set on
   * acceptance. The EIR becomes the authoritative lifecycle record;
   * this column is the back-pointer for analytics + dashboards. SET
   * NULL on EIR deletion so candidates survive an EIR cleanup.
   *
   * Declared as text without a Drizzle .references() to avoid a
   * circular import (eir.ts already references khat_map_seasons).
   * The migration installs the FK at the DB level.
   */
  eir_id: text("eir_id"),

  /**
   * Stamped by `editEpisodeAction` when the operator edits a locked-topic
   * episode after Phase B discovery has already run. Surfaces a "re-run
   * discovery" CTA on the candidate card. Cleared when a fresh discovery
   * run completes for this episode.
   */
  discovery_stale_at: timestamp("discovery_stale_at", { withTimezone: true }),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 3. Guest candidates (season-scoped) ─────────────────────────────────────

export const khatMapGuestCandidates = pgTable("khat_map_guest_candidates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  season_id: text("season_id")
    .notNull()
    .references(() => khatMapSeasons.id, { onDelete: "cascade" }),

  status: text("status")
    .$type<KhatMapGuestCandidateStatus>()
    .notNull()
    .default("proposed"),

  // Identity
  full_name: text("full_name").notNull(),
  display_name: text("display_name"),
  bio: text("bio"),
  gender: text("gender")
    .$type<KhatMapGuestGender>()
    .notNull()
    .default("unknown"),
  profession: text("profession"),

  // Fit
  why_fit: text("why_fit"),
  /**
   * Phase B redesign — per-episode rationale that survives the bridge
   * from discovery to khat_map. `why_fit` is a season-level statement
   * ("why this person fits Khat in general"); this column captures
   * "why this person fits THIS episode topic" produced by the verifier
   * when the discovery run was episode-scoped. Null otherwise.
   */
  topic_fit_rationale: text("topic_fit_rationale"),
  category: text("category"),
  country: text("country"),
  city: text("city"),

  // Discovery surface
  public_links: jsonb("public_links")
    .$type<KhatMapGuestPublicLink[]>()
    .notNull()
    .default([]),
  social_accounts: jsonb("social_accounts")
    .$type<KhatMapGuestSocialAccounts>()
    .notNull()
    .default({}),
  official_website: text("official_website"),
  evidence_summary: text("evidence_summary"),
  evidence_citations: jsonb("evidence_citations")
    .$type<KhatMapEvidenceCitation[]>()
    .notNull()
    .default([]),

  // AI-derived scores (0–10) — written by the v2 batch engine
  relevance_score: real("relevance_score"),
  depth_score: real("depth_score"),
  reach_score: real("reach_score"),
  risk_flags: jsonb("risk_flags").$type<string[]>().notNull().default([]),

  /**
   * Admin-curated quality marker (orthogonal to lifecycle status).
   * `avoid` is a soft blacklist — generation filters them out by default.
   */
  quality: text("quality")
    .$type<KhatMapGuestQuality>()
    .notNull()
    .default("normal"),

  // Conversion to the global guest_candidates table
  converted_to_guest_candidate_id: text("converted_to_guest_candidate_id").references(
    () => guestCandidates.id,
    { onDelete: "set null" },
  ),
  converted_at: timestamp("converted_at", { withTimezone: true }),

  /**
   * Bridge to the canonical `guests` table.
   *
   * When a Khat Map guest candidate is created by the discovery → promotion
   * bridge (or by the operator's manual assign-guest flow), we record the
   * canonical guest_id here. This:
   *   - Lets the bridge dedupe by `(season_id, linked_guest_id)` so we never
   *     create two khat_map rows for the same person in the same season.
   *   - Keeps an audit link from the Khat Map row back to the global guest
   *     (which itself links back to the discovery candidate via
   *     guest_discovery_links).
   */
  linked_guest_id: text("linked_guest_id").references(() => guests.id, {
    onDelete: "set null",
  }),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 4. User feedback (audit — written by conversion) ────────────────────────

export const khatMapUserFeedback = pgTable("khat_map_user_feedback", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  season_id: text("season_id").references(() => khatMapSeasons.id, {
    onDelete: "cascade",
  }),

  /** Polymorphic target — interpreted via `target_type`. */
  target_type: text("target_type")
    .$type<"episode_candidate" | "guest_candidate" | "topic" | "angle">()
    .notNull(),
  target_id: text("target_id").notNull(),

  action: text("action").$type<KhatMapFeedbackAction>().notNull(),
  reason_category: text("reason_category").$type<KhatMapFeedbackReasonCategory>(),
  reason_text: text("reason_text"),

  admin_id: text("admin_id"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 5. Rejected patterns (global memory) ────────────────────────────────────

export const khatMapRejectedPatterns = pgTable("khat_map_rejected_patterns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pattern_type: text("pattern_type").$type<KhatMapPatternType>().notNull(),
  pattern_text: text("pattern_text").notNull(),
  category: text("category"),
  severity: text("severity").$type<KhatMapPatternSeverity>().notNull().default("medium"),

  rejection_count: integer("rejection_count").notNull().default(1),
  last_rejected_at: timestamp("last_rejected_at", { withTimezone: true }),
  notes: text("notes"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 6. Accepted patterns (global memory) ────────────────────────────────────

export const khatMapAcceptedPatterns = pgTable("khat_map_accepted_patterns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pattern_type: text("pattern_type").$type<KhatMapPatternType>().notNull(),
  pattern_text: text("pattern_text").notNull(),
  category: text("category"),

  success_count: integer("success_count").notNull().default(1),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  notes: text("notes"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 7. Topic bank — angle inventory + freshness ─────────────────────────────

export const khatMapTopicBank = pgTable("khat_map_topic_bank", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  title: text("title").notNull(),
  description: text("description"),
  angle_notes: text("angle_notes"),
  /**
   * Stable angle code (e.g. "invasion.prisoners",
   * "philosophy.friendship_in_algorithms"). UNIQUE WHERE NOT NULL — see
   * post-schema.sql for the partial unique index.
   */
  angle_code: text("angle_code"),

  episode_type: text("episode_type").$type<KhatMapEpisodeType>(),
  category: text("category"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),

  freshness: text("freshness").$type<KhatMapFreshness>().notNull().default("fresh"),
  last_used_season_id: text("last_used_season_id").references(() => khatMapSeasons.id, {
    onDelete: "set null",
  }),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  usage_count: integer("usage_count").notNull().default(0),

  source: text("source")
    .$type<"admin_seeded" | "ai_discovered" | "rejected_revisit" | "spin_off">()
    .notNull()
    .default("ai_discovered"),
  importance_score: real("importance_score"),

  status: text("status").$type<KhatMapTopicStatus>().notNull().default("active"),
  /**
   * Editorial quality marker — orthogonal to lifecycle status.
   * `weak` is deprioritized in generation, `deprecated` is excluded
   * entirely. Defaults to `normal` on every fresh seed.
   */
  quality: text("quality")
    .$type<KhatMapTopicQuality>()
    .notNull()
    .default("normal"),
  notes: text("notes"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 8. Channel fingerprint (versioned editorial DNA) ────────────────────────

export const khatMapChannelFingerprint = pgTable("khat_map_channel_fingerprint", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  version: integer("version").notNull().default(1),
  /**
   * At most one row should have is_current = true. Enforced by a partial
   * unique index in post-schema.sql.
   */
  is_current: boolean("is_current").notNull().default(false),

  identity_summary: text("identity_summary"),
  khat_dna: jsonb("khat_dna").$type<KhatMapKhatDna>(),
  strongest_emotional_topics: jsonb("strongest_emotional_topics")
    .$type<string[]>()
    .notNull()
    .default([]),
  most_successful_episodes: jsonb("most_successful_episodes")
    .$type<KhatMapFingerprintEpisodeEntry[]>()
    .notNull()
    .default([]),
  most_successful_guests: jsonb("most_successful_guests")
    .$type<KhatMapFingerprintGuestEntry[]>()
    .notNull()
    .default([]),

  analysis_notes: text("analysis_notes"),
  raw_gemini_payload: jsonb("raw_gemini_payload").$type<Record<string, unknown>>(),

  model_name: text("model_name"),
  generated_by: text("generated_by"),

  generated_at: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 9. Season decisions (v2 wizard journal — append-only) ───────────────────
//
// Every accept / reject / skip the admin makes inside the v2 wizard lands
// here. `undone_at` is set when the 10-second undo toast is tapped;
// consumers filter on `undone_at IS NULL` to compute effective state. Rows
// are never deleted — this IS the audit trail.

export const khatMapSeasonDecisions = pgTable("khat_map_season_decisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  season_id: text("season_id")
    .notNull()
    .references(() => khatMapSeasons.id, { onDelete: "cascade" }),

  /** Soft reference to admin_users.id. */
  admin_id: text("admin_id"),

  /** 1-indexed batch this decision came from. 0 for post-hoc decisions. */
  batch_index: integer("batch_index").notNull().default(0),

  kind: text("kind").$type<KhatMapDecisionKind>().notNull(),
  target: text("target").$type<KhatMapDecisionTarget>().notNull().default("pair"),

  topic_candidate_id: text("topic_candidate_id").references(
    () => khatMapEpisodeCandidates.id,
    { onDelete: "set null" },
  ),
  guest_candidate_id: text("guest_candidate_id").references(
    () => khatMapGuestCandidates.id,
    { onDelete: "set null" },
  ),

  reason_category: text("reason_category").$type<KhatMapFeedbackReasonCategory>(),
  reason_text: text("reason_text"),

  /** Undo window marker. When set, this decision no longer counts. */
  undone_at: timestamp("undone_at", { withTimezone: true }),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 10. Topic fingerprints (semantic-dedup memory) ──────────────────────────
//
// Embedded titles/summaries for similarity filtering. Written after every
// accept and reject so the next batch's similarity scan can run before
// surfacing candidates. Embeddings are 1536-dim float arrays stored as
// jsonb (pgvector is not assumed available on Managed PostgreSQL —
// cosine similarity runs in-app, fine at < 200 fingerprints per season).

export const khatMapTopicFingerprints = pgTable("khat_map_topic_fingerprints", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  season_id: text("season_id").references(() => khatMapSeasons.id, {
    onDelete: "cascade",
  }),

  source: text("source").$type<KhatMapFingerprintSource>().notNull(),

  angle_code: text("angle_code"),
  title_ar: text("title_ar").notNull(),
  summary_ar: text("summary_ar"),
  domain: text("domain").$type<KhatMapTopicDomain>(),

  embedding: jsonb("embedding").$type<number[]>().notNull(),
  embedding_model: text("embedding_model").notNull(),

  topic_candidate_id: text("topic_candidate_id").references(
    () => khatMapEpisodeCandidates.id,
    { onDelete: "set null" },
  ),
  decision_id: text("decision_id").references(() => khatMapSeasonDecisions.id, {
    onDelete: "set null",
  }),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 11. User taste profile (derived from decision history) ──────────────────
//
// One row per admin user, recomputed from their non-undone decisions
// across all seasons. Scores live in [0, 1] with 0.5 as neutral;
// `total_decisions` is the confidence weight the UI uses to decide
// whether to show "Why this fits YOU" reasoning.

export const khatMapUserTasteProfile = pgTable("khat_map_user_taste_profile", {
  user_id: text("user_id").primaryKey(),

  preferred_domains: jsonb("preferred_domains")
    .$type<KhatMapTasteDomainWeight[]>()
    .notNull()
    .default([]),
  rejected_patterns: jsonb("rejected_patterns")
    .$type<KhatMapTasteRejectedPattern[]>()
    .notNull()
    .default([]),

  depth_score: real("depth_score").notNull().default(0.5),
  controversy_tolerance: real("controversy_tolerance").notNull().default(0.5),
  emotional_preference: real("emotional_preference").notNull().default(0.5),
  kuwait_relevance_weight: real("kuwait_relevance_weight").notNull().default(0.5),

  total_decisions: integer("total_decisions").notNull().default(0),

  last_recomputed_at: timestamp("last_recomputed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── 12. Episode performance (closes the editorial-intelligence loop) ───────
//
// One snapshot row per converted Khat Map candidate. Written by the manual
// `syncSeasonPerformanceAction`. Read by:
//   • `recomputeTasteProfile`  — accept decisions get weighted by their
//                                 published-episode performance
//   • the batch-engine scorer  — domain-performance multiplier
//   • Topic + Guest intelligence pages (deferred to follow-on PRs)
//
// `performance_score` is a composite in [0, 1] combining whatever signals
// are available at sync time. Engagement metrics that don't yet exist in
// our schema (likes / comments / retention) live as nullable columns so a
// future ingestion worker can fill them without a migration.

export const khatMapEpisodePerformance = pgTable("khat_map_episode_performance", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  candidate_id: text("candidate_id")
    .notNull()
    .references(() => khatMapEpisodeCandidates.id, { onDelete: "cascade" }),
  episode_id: text("episode_id").references(() => episodes.id, {
    onDelete: "set null",
  }),
  preparation_id: text("preparation_id").references(() => episodePreparations.id, {
    onDelete: "set null",
  }),

  // Snapshot from episodes
  episode_title: text("episode_title"),
  youtube_url: text("youtube_url"),
  release_date: text("release_date"),
  duration_minutes: integer("duration_minutes"),
  view_count: integer("view_count"),

  // Snapshot from AI Studio surfaces
  quote_count: integer("quote_count").notNull().default(0),
  has_enrichment: boolean("has_enrichment").notNull().default(false),
  has_chapters: boolean("has_chapters").notNull().default(false),
  has_clips: boolean("has_clips").notNull().default(false),

  // Optional / future ingestion
  like_count: integer("like_count"),
  comment_count: integer("comment_count"),
  retention_pct: real("retention_pct"),

  /** Composite [0, 1]. Null when zero signals available. */
  performance_score: real("performance_score"),

  // Aggregation mirrors (saves a join on every domain-perf query)
  topic_domain: text("topic_domain").$type<KhatMapTopicDomain>(),
  episode_type: text("episode_type").$type<KhatMapEpisodeType>(),
  topic_angle_code: text("topic_angle_code"),
  guest_candidate_id: text("guest_candidate_id").references(
    () => khatMapGuestCandidates.id,
    { onDelete: "set null" },
  ),

  synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
})
