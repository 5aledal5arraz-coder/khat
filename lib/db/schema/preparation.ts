/**
 * Episode Preparation Studio — DB schema.
 *
 * One row per preparation session. Inputs and AI-generated sections are
 * stored as jsonb so sections can be generated / regenerated independently.
 * A live token (hashed) is minted on approval and drives the public
 * /prepare/live/[token] control panel.
 */

import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core"
import type {
  PreparationInputs,
  PreparationSectionsStatus,
  PreparationResearch,
  PreparationExecutiveSummary,
  PreparationKnowledgeBank,
  PreparationGuestIntelligence,
  PreparationConversationAxes,
  PreparationEpisodeFlow,
  PreparationQuestionSystem,
  PreparationHostInstructions,
  PreparationQuotesReferences,
  PreparationViralMoments,
  PreparationLiveState,
  PreparationGuestIdentity,
} from "@/types/preparation"
import { episodes } from "./episodes"

export const episodePreparations = pgTable("episode_preparations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Inputs (Step 1)
  title: text("title").notNull(),
  guest_name: text("guest_name"),
  /**
   * Admin-typed description of the guest used to disambiguate identity.
   * Required at create time by the API layer; nullable in DB only for
   * backward compat with rows created before the identity flow existed.
   */
  guest_description: text("guest_description"),
  /** Optional profile URL supplied by the admin. */
  guest_profile_link: text("guest_profile_link"),
  /**
   * Confirmed identity blob. Populated only after the admin picks one
   * candidate and answers the confirmation gate. Research is refused when
   * this is null. Nullable for backward compat with legacy rows.
   */
  guest_identity: jsonb("guest_identity").$type<PreparationGuestIdentity>(),
  short_description: text("short_description"),
  episode_goal: text("episode_goal"),
  key_questions: jsonb("key_questions").$type<string[]>().default([]).notNull(),
  tone_type: text("tone_type"),
  focus_mode: text("focus_mode"),
  expected_duration_min: integer("expected_duration_min"),
  depth_level: integer("depth_level").default(3).notNull(),
  boldness_level: integer("boldness_level").default(3).notNull(),
  content_focus: jsonb("content_focus").$type<string[]>().default([]).notNull(),
  inputs_meta: jsonb("inputs_meta").$type<PreparationInputs["meta"]>(),

  // Research corpus (raw grounding: YouTube results + synthesized facts)
  research_data: jsonb("research_data").$type<PreparationResearch>(),

  // AI sections (nullable, generated independently)
  executive_summary: jsonb("executive_summary").$type<PreparationExecutiveSummary>(),
  knowledge_bank: jsonb("knowledge_bank").$type<PreparationKnowledgeBank>(),
  guest_intelligence: jsonb("guest_intelligence").$type<PreparationGuestIntelligence>(),
  conversation_axes: jsonb("conversation_axes").$type<PreparationConversationAxes>(),
  episode_flow: jsonb("episode_flow").$type<PreparationEpisodeFlow>(),
  question_system: jsonb("question_system").$type<PreparationQuestionSystem>(),
  host_instructions: jsonb("host_instructions").$type<PreparationHostInstructions>(),
  quotes_references: jsonb("quotes_references").$type<PreparationQuotesReferences>(),
  viral_moments: jsonb("viral_moments").$type<PreparationViralMoments>(),

  // Per-section status tracking (idle | generating | ready | error)
  sections_status: jsonb("sections_status")
    .$type<PreparationSectionsStatus>()
    .default({})
    .notNull(),

  // Workflow state
  status: text("status").notNull().default("draft"), // draft | reviewed | approved
  approved_at: timestamp("approved_at", { withTimezone: true }),

  // Live control panel
  live_token_hash: text("live_token_hash").unique(),
  live_state: jsonb("live_state").$type<PreparationLiveState>(),

  // Optional link to an episode (set once recorded)
  linked_episode_id: text("linked_episode_id").references(() => episodes.id, {
    onDelete: "set null",
  }),

  /**
   * Khat Brain — link to the master Episode Intelligence Record. Stamped
   * during candidate→preparation conversion. Nullable in Phase 2 because
   * legacy preparation rows pre-date the EIR. Will become NOT NULL once
   * every flow that creates a preparation does so via an EIR.
   *
   * No Drizzle .references() to avoid circular imports; the migration
   * installs the FK at the DB level.
   */
  eir_id: text("eir_id"),

  /**
   * Phase X Step 4 — Preparation V2 payload (JSONB).
   * Shape lives in lib/preparation/v2/types.ts. Null until the V2
   * pipeline runs. Legacy section columns above remain in place; the UI
   * prefers prep_v2 when present and falls back otherwise.
   */
  prep_v2: jsonb("prep_v2"),

  // Interview Cards generation tracking
  cards_generated_at: timestamp("cards_generated_at", { withTimezone: true }),

  // Lifecycle
  archived_at: timestamp("archived_at", { withTimezone: true }),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),

  // Ownership / timestamps
  created_by: text("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
