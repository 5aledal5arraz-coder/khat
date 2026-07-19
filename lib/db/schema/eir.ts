/**
 * Khat Brain — Episode Intelligence Record (EIR).
 *
 * The single editorial spine. One row per episode-ever-considered, from
 * "idea" to "archived". Every other subsystem (preparation, recording,
 * studio, publishing, performance, learning) attaches to an EIR via
 * eir_id. Phase moves forward through `episode_phase`; backwards moves
 * are not allowed in Phase 1 — admin archives + creates a new EIR if
 * they need to restart.
 *
 * The EIR replaces the implicit episode-state-machine that was previously
 * smeared across khat_map_episode_candidates → episode_preparations →
 * studio_sessions → episodes. Going forward, those tables become *lenses*
 * on the EIR rather than parallel state owners.
 */

import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core"
import type {
  KhatMapTopicDomain,
  KhatMapEpisodeType,
  KhatMapRiskLevel,
  KhatMapEffortLevel,
} from "@/types/khat-map"
import { khatMapSeasons } from "./khat-map"
import { guests } from "./guests"

/**
 * Linear pipeline. Forward-only transitions are enforced by the
 * Episode Pipeline service in lib/eir/transitions.ts. The `archived`
 * state is terminal and reachable from every other state.
 */
export const EPISODE_PHASES = [
  "idea",
  "guest_discovery",
  "guest_assigned",
  "approved",
  "researching",
  "prepared",
  "ready_to_record",
  "recording",
  "recorded",
  "producing",
  "ready_to_publish",
  "published",
  "analyzing",
  "learned",
  "archived",
] as const

export type EpisodePhase = (typeof EPISODE_PHASES)[number]

/**
 * Editorial intent — the WHAT and WHY of the episode. Carries forward
 * through every phase. Free-form JSONB (rather than columns) so phases
 * can append without migrations: `hook`, `why_matters`, `why_now`,
 * `goal`, `main_axes`, `suggested_questions`, `production_notes`, etc.
 */
export interface EditorialIntent {
  hook?: string | null
  why_matters?: string | null
  why_now?: string | null
  goal?: string | null
  description?: string | null
  main_axes?: string[]
  suggested_questions?: string[]
  production_notes?: string | null
  /**
   * Provenance — where this EIR came from. `source` and `source_id` let
   * us trace back to the originating record (Khat Map candidate,
   * application, manual entry, discovery candidate, etc.) without a
   * dedicated FK column per source type.
   */
  source?:
    | "khat_map_candidate"
    | "guest_application"
    | "guest_candidate"
    | "discovery_candidate"
    | "manual"
  source_id?: string | null
  [key: string]: unknown
}

export const episodeIntelligenceRecords = pgTable(
  "episode_intelligence_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // ─── State machine ─────────────────────────────────────────────────
    /** Current phase. CHECK constraint applied in post-schema.sql. */
    phase: text("phase").$type<EpisodePhase>().notNull().default("idea"),

    // ─── Editorial slot ────────────────────────────────────────────────
    season_id: text("season_id").references(() => khatMapSeasons.id, {
      onDelete: "set null",
    }),
    working_title: text("working_title").notNull(),
    final_title: text("final_title"),

    // Soft enums — values come from existing Khat Map vocabulary so
    // upstream candidates and downstream episodes share language.
    topic_domain: text("topic_domain").$type<KhatMapTopicDomain>(),
    episode_type: text("episode_type").$type<KhatMapEpisodeType>(),
    topic_angle_code: text("topic_angle_code"),

    // ─── Guest binding ─────────────────────────────────────────────────
    guest_id: text("guest_id").references(() => guests.id, {
      onDelete: "set null",
    }),

    // ─── Free-form intent blob ─────────────────────────────────────────
    editorial_intent: jsonb("editorial_intent")
      .$type<EditorialIntent>()
      .notNull()
      .default({}),

    // ─── Risk / effort scoring (carried from candidate, mutable) ───────
    risk_level: text("risk_level").$type<KhatMapRiskLevel>(),
    effort_level: text("effort_level").$type<KhatMapEffortLevel>(),

    // ─── Recording schedule ────────────────────────────────────────────
    /**
     * Planned filming date/time — ADMIN-ONLY internal scheduling. This is the
     * RECORDING date, NOT publish (publish lives on episodes.release_date /
     * episodes.scheduled_for). MUST NOT appear on any public surface; the
     * public teaser reads select `phase` only and never this column.
     */
    recording_scheduled_at: timestamp("recording_scheduled_at", {
      withTimezone: true,
    }),

    // ─── Audit ─────────────────────────────────────────────────────────
    // Soft reference to admin_users.id — declared as text without an FK
    // to match the rest of the codebase (e.g. episode_preparations.created_by).
    // admin_users.id is uuid; values are stored as their text representation.
    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
)

/**
 * Phase transition log — append-only audit of every state change. This
 * table is the source of truth for "when did EIR X reach phase Y" and
 * powers reporting + the Command Center timeline view.
 */
export const eirPhaseTransitions = pgTable("eir_phase_transitions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  eir_id: text("eir_id")
    .notNull()
    .references(() => episodeIntelligenceRecords.id, { onDelete: "cascade" }),
  from_phase: text("from_phase").$type<EpisodePhase>(),
  to_phase: text("to_phase").$type<EpisodePhase>().notNull(),
  /** Soft reference to admin_users.id — text without FK (see created_by note). */
  actor_id: text("actor_id"),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
