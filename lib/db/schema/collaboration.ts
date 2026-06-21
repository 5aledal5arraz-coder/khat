/**
 * Live Collaboration Room — DB schema.
 *
 * Six tables supporting the Interview Cards + Live Recording Room MVP:
 *   - interview_cards: rich question cards (source of truth for live sessions)
 *   - card_materials: supporting evidence/context per card
 *   - collaboration_rooms: live recording sessions
 *   - room_participants: who is in a room + presence
 *   - room_card_state: per-card live status within a room
 *   - room_card_notes: team notes attached to cards during recording
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core"
import { episodePreparations } from "./preparation"

// ═══════════════════════════════════════════════════════════════
// Interview Cards
// ═══════════════════════════════════════════════════════════════

export const interviewCards = pgTable("interview_cards", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  preparation_id: text("preparation_id")
    .notNull()
    .references(() => episodePreparations.id, { onDelete: "cascade" }),

  // Identity
  sort_order: integer("sort_order").notNull().default(0),
  section_id: text("section_id").notNull(),
  section_label: text("section_label").notNull(),
  bucket: text("bucket").notNull(), // opening|deep|escalation|surprise|backup|recovery
  short_title: text("short_title").notNull(),

  // Traceability back to AI-generated question_system
  source_question_id: text("source_question_id"),

  // Question versions
  spoken_kuwaiti: text("spoken_kuwaiti").notNull(),
  formal_version: text("formal_version"),
  shorter_version: text("shorter_version"),
  deeper_version: text("deeper_version"),
  softer_version: text("softer_version"),

  // Entry styles (maddakhel)
  entry_soft: text("entry_soft"),
  entry_direct: text("entry_direct"),
  entry_emotional: text("entry_emotional"),
  entry_provocative: text("entry_provocative"),
  transition_out: text("transition_out"),

  // Follow-ups: [{ id, text, trigger_condition? }]
  follow_ups: jsonb("follow_ups")
    .$type<{ id: string; text: string; trigger_condition?: string }[]>()
    .notNull()
    .default([]),

  // Host guidance
  why_this_matters: text("why_this_matters"),
  when_to_ask: text("when_to_ask"),
  how_to_ask: text("how_to_ask"),
  emotional_tone: text("emotional_tone"),
  if_guest_avoids: text("if_guest_avoids"),
  if_guest_emotional: text("if_guest_emotional"),
  if_answer_weak: text("if_answer_weak"),
  sensitivity_note: text("sensitivity_note"),

  // Content potential flags
  clip_potential: boolean("clip_potential").notNull().default(false),
  quote_potential: boolean("quote_potential").notNull().default(false),
  emotional_peak: boolean("emotional_peak").notNull().default(false),

  // Metadata
  is_pinned: boolean("is_pinned").notNull().default(false),
  is_deleted: boolean("is_deleted").notNull().default(false),
  ai_generated: boolean("ai_generated").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

// ═══════════════════════════════════════════════════════════════
// Card Materials — supporting evidence/context per card
// ═══════════════════════════════════════════════════════════════

export const cardMaterials = pgTable("card_materials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  card_id: text("card_id")
    .notNull()
    .references(() => interviewCards.id, { onDelete: "cascade" }),

  // fact|background|quote|statistic|article|image|video
  // |old_interview|social_post|guest_statement|contradiction
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source_url: text("source_url"),
  source_name: text("source_name"),
  credibility: text("credibility").notNull().default("unverified"), // verified|strong|weak|unverified
  sort_order: integer("sort_order").notNull().default(0),
  is_pinned: boolean("is_pinned").notNull().default(false),
  ai_generated: boolean("ai_generated").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

// ═══════════════════════════════════════════════════════════════
// Collaboration Rooms — live recording sessions
// ═══════════════════════════════════════════════════════════════

export const collaborationRooms = pgTable("collaboration_rooms", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  preparation_id: text("preparation_id")
    .notNull()
    .references(() => episodePreparations.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  status: text("status").notNull().default("waiting"), // waiting|live|paused|ended
  phase: text("phase").notNull().default("opening"),
  energy_level: integer("energy_level").notNull().default(3), // 0-5
  active_card_id: text("active_card_id").references(() => interviewCards.id, {
    onDelete: "set null",
  }),
  host_notes: text("host_notes").notNull().default(""),
  recording_started_at: timestamp("recording_started_at", { withTimezone: true }),
  recording_ended_at: timestamp("recording_ended_at", { withTimezone: true }),
  recording_paused_at: timestamp("recording_paused_at", { withTimezone: true }),
  recording_elapsed_ms: integer("recording_elapsed_ms").notNull().default(0),

  /**
   * Phase X Step 5 — Live V2 director surface state. Independent from
   * the legacy `phase` column (which maps to EIR phases via the room
   * status walker). The V2 page reads/writes these and stays a no-op
   * for the legacy collab page.
   */
  director_notes: text("director_notes"),
  current_section_key: text("current_section_key"),
  current_section_index: integer("current_section_index"),
  /**
   * prep_v2 question ids the host has marked as asked/covered during the
   * live recording. Persisted so the "completed" treatment survives reloads
   * and (via room_update) syncs to every participant.
   */
  completed_question_ids: jsonb("completed_question_ids")
    .$type<string[]>()
    .notNull()
    .default([]),

  /**
   * Khat Brain — link to the master EIR. Inherited from the linked
   * preparation on room creation. Phase transitions (waiting→ready_to_record,
   * live→recording, ended→recorded) flow through the EIR service.
   */
  eir_id: text("eir_id"),

  created_by: text("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

// ═══════════════════════════════════════════════════════════════
// Room Participants — who is in a room + presence
// ═══════════════════════════════════════════════════════════════

export const roomParticipants = pgTable(
  "room_participants",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    room_id: text("room_id")
      .notNull()
      .references(() => collaborationRooms.id, { onDelete: "cascade" }),

    // Nullable: MVP uses admin users only, but schema is future-ready for invite-based participants
    user_id: text("user_id"),
    display_name: text("display_name").notNull(),
    role: text("role").notNull().default("viewer"), // host|director|photographer|editor|viewer
    is_online: boolean("is_online").notNull().default(false),
    last_heartbeat: timestamp("last_heartbeat", { withTimezone: true }).defaultNow().notNull(),
    joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    left_at: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    unique("room_participants_room_user").on(t.room_id, t.user_id),
  ],
)

// ═══════════════════════════════════════════════════════════════
// Room Card State — per-card live status within a room
// ═══════════════════════════════════════════════════════════════

export const roomCardState = pgTable(
  "room_card_state",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    room_id: text("room_id")
      .notNull()
      .references(() => collaborationRooms.id, { onDelete: "cascade" }),
    card_id: text("card_id")
      .notNull()
      .references(() => interviewCards.id, { onDelete: "cascade" }),

    status: text("status").notNull().default("pending"), // pending|active|used|skipped
    is_pinned: boolean("is_pinned").notNull().default(false),
    activated_at: timestamp("activated_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("room_card_state_room_card").on(t.room_id, t.card_id),
  ],
)

// ═══════════════════════════════════════════════════════════════
// Room Card Notes — team notes attached to cards during recording
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Room Session Markers — timestamped events during recording
// ═══════════════════════════════════════════════════════════════

export const roomSessionMarkers = pgTable("room_session_markers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  room_id: text("room_id")
    .notNull()
    .references(() => collaborationRooms.id, { onDelete: "cascade" }),
  author_id: text("author_id")
    .notNull()
    .references(() => roomParticipants.id, { onDelete: "cascade" }),

  marker_type: text("marker_type").notNull(),
  // Canonical quick-marker taxonomy (single vocabulary for host/director/editor)
  // — see lib/recording-v2/marker-types.ts (QUICK_MARKER_TYPES):
  //   content: clip | quote | highlight
  //   editing: cut | retake | tech_issue
  //   flow:    break_start | break_end | chapter
  // (Older rows may carry legacy values; they render via a fallback style.)
  label: text("label").notNull(),
  note: text("note"),
  recording_ms: integer("recording_ms").notNull(), // ms offset from recording start
  /** Phase X Step 5 — current Prep V2 section key when the marker was created. */
  section_key: text("section_key"),
  wall_time: timestamp("wall_time", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

// ═══════════════════════════════════════════════════════════════
// Room Card Notes — team notes attached to cards during recording
// ═══════════════════════════════════════════════════════════════

export const roomCardNotes = pgTable("room_card_notes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  room_id: text("room_id")
    .notNull()
    .references(() => collaborationRooms.id, { onDelete: "cascade" }),
  // Nullable: prep_v2 rooms have no interview cards, so notes attach to a
  // prep_v2 section (section_key) or are room-global (both null) instead.
  card_id: text("card_id")
    .references(() => interviewCards.id, { onDelete: "cascade" }),
  // prep_v2 section this note is attached to (SectionKind), or null.
  section_key: text("section_key"),
  author_id: text("author_id")
    .notNull()
    .references(() => roomParticipants.id, { onDelete: "cascade" }),

  content: text("content").notNull(),
  note_type: text("note_type").notNull().default("normal"), // normal|urgent|tactical
  priority: text("priority").notNull().default("medium"), // low|medium|high
  is_seen_by_host: boolean("is_seen_by_host").notNull().default(false),
  seen_by_host_at: timestamp("seen_by_host_at", { withTimezone: true }),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
