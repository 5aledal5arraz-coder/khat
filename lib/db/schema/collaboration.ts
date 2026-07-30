/**
 * Live Collaboration Room — DB schema.
 *
 * Tables supporting the Interview Cards + Live Recording Room MVP:
 *   - interview_cards: rich question cards (source of truth for live sessions)
 *   - card_materials: supporting evidence/context per card
 *   - collaboration_rooms: live recording sessions
 *   - room_takes: one row per recording attempt + the wall-clock anchor
 *   - room_participants: who is in a room + presence
 *   - room_card_state: per-card live status within a room
 *   - room_session_markers: timestamped flags during a take
 *   - room_card_notes: team notes attached to cards during recording
 *
 * TWO CLOCKS, on purpose — see `roomTakes` and `roomSessionMarkers` below:
 * net recording time (cockpit) and camera wall-clock time (editors). Mixing
 * them is the bug class this file's comments exist to prevent.
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
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
   * Which take is currently loaded in this room. Incremented by `resetTimer`
   * ("إعادة ضبط لتسجيل جديد"), never decremented. Every marker copies this
   * value at insert time so take-1 flags never mix with take-2 flags in an
   * export — see `room_takes` for the per-take wall-clock anchor.
   *
   * NOTE: `recording_started_at` above is NOT an anchor — `resumeTimer`
   * overwrites it on every resume. `room_takes.anchor_at` is the anchor.
   */
  take_number: integer("take_number").notNull().default(1),

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
// Room Takes — one row per recording attempt, and the ONLY wall-clock anchor
// ═══════════════════════════════════════════════════════════════

/**
 * A "take" is one attempt at recording the episode. Re-shooting (the WrapView
 * "إعادة ضبط لتسجيل جديد" button) opens take N+1 in the SAME room, against the
 * same EIR — the episode walks back to `ready_to_record`, it does not become a
 * new episode.
 *
 * This table exists for ONE reason: **`anchor_at` is the only stable wall-clock
 * zero point we have.** `collaboration_rooms.recording_started_at` cannot serve
 * as one because `resumeTimer` overwrites it on every resume.
 *
 * Why that matters: the camera keeps rolling through a pause, but
 * `room_session_markers.net_recording_ms` deliberately EXCLUDES paused time.
 * So after the first break the two clocks diverge, and the divergence
 * accumulates. Editors need camera time; the cockpit needs net time. Both are
 * available:
 *
 *   net time    = room_session_markers.net_recording_ms       (stored)
 *   camera time = (marker.wall_time − take.anchor_at)
 *                 + take.camera_offset_ms                     (derived)
 *
 * Camera time is DERIVED, not stored, precisely so `camera_offset_ms` can fix
 * it after the fact — see below. Net time must be stored because it cannot be
 * reconstructed from wall clocks alone (that would need the full pause history).
 * The derivation lives in `lib/recording-v2/camera-time.ts`.
 */
export const roomTakes = pgTable(
  "room_takes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    room_id: text("room_id")
      .notNull()
      .references(() => collaborationRooms.id, { onDelete: "cascade" }),

    /** 1-based, matches `collaboration_rooms.take_number` while the take is live. */
    take_number: integer("take_number").notNull().default(1),

    /**
     * Wall clock at the FIRST "ابدأ التسجيل" of this take. Written exactly once
     * (`startTimer` only sets it when creating the row) and never overwritten —
     * not by resume, not by pause, not by end. Sourced from the Node clock, the
     * same clock that stamps `room_session_markers.wall_time`, so the
     * subtraction carries no app↔DB clock skew.
     */
    anchor_at: timestamp("anchor_at", { withTimezone: true }).notNull(),

    /** Wall clock at "أوقف التسجيل" (`endTimer`). Null while the take is open. */
    ended_at: timestamp("ended_at", { withTimezone: true }),

    /**
     * Manual sync correction, in ms, added to every derived camera timestamp of
     * this take. Positive = the camera started BEFORE we pressed "ابدأ".
     *
     * Nobody presses a browser button on the exact frame the camera rolls, so
     * the raw anchor is always off by seconds. The editor measures the real
     * offset once and it is entered here; every marker of the take re-derives
     * correctly with no re-export and no data rewrite. This field is the whole
     * reason camera time is derived instead of frozen onto each marker row.
     */
    camera_offset_ms: integer("camera_offset_ms").notNull().default(0),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("room_takes_room_take").on(t.room_id, t.take_number),
  ],
)

// ═══════════════════════════════════════════════════════════════
// Recording Checklist — the director's pre-shoot confirmation, per take
// ═══════════════════════════════════════════════════════════════

/**
 * One row per confirmed (or explicitly waived) checklist item.
 *
 * The ITEM CATALOGUE is not in the database — it lives in
 * `lib/recording-v2/preflight-checklist.ts`, the same way the marker taxonomy
 * lives in `marker-types.ts`. This table stores only *what happened*: which key
 * was confirmed, when, and by whom. Adding or renaming a checklist item is then
 * a code change with no migration, and a row whose `item_key` is no longer in
 * the catalogue is simply ignored rather than corrupting the flow.
 *
 * **Scoped to `take_number` on purpose.** A re-shoot means the studio was
 * changed or struck — usually that IS the reason for the re-shoot — so take 1's
 * confirmations say nothing about take 2. State is never copied forward; the UI
 * shows a context line that the previous take was fully confirmed instead.
 *
 * `checked_by` holds the ADMIN USER id from the session (soft ref, no FK, the
 * same pattern as `created_by` / `eir_phase_transitions.actor_id`). It is
 * deliberately NOT a `room_participants.id`: `ensureParticipant` hardcodes
 * `role: "director"` for anyone who creates a marker, so participant rows carry
 * a role that is not trustworthy. Session identity is.
 */
export const recordingChecklistItems = pgTable(
  "recording_checklist_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    room_id: text("room_id")
      .notNull()
      .references(() => collaborationRooms.id, { onDelete: "cascade" }),
    /** Which take these confirmations belong to. See `room_takes`. */
    take_number: integer("take_number").notNull().default(1),
    /** Stable key from the code catalogue, e.g. `cam.guest_main`. */
    item_key: text("item_key").notNull(),

    checked_at: timestamp("checked_at", { withTimezone: true }),
    /** admin_users.id — soft reference, project convention. */
    checked_by: text("checked_by"),

    /**
     * Set when the item is waived rather than satisfied. A waived item counts as
     * resolved for the gate, but the reason is recorded so "we shot without
     * cam 4" is answerable afterwards instead of being indistinguishable from
     * "cam 4 was fine".
     */
    not_applicable_reason: text("not_applicable_reason"),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("recording_checklist_room_take_item").on(
      t.room_id,
      t.take_number,
      t.item_key,
    ),
  ],
)

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

export const roomSessionMarkers = pgTable(
  "room_session_markers",
  {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  room_id: text("room_id")
    .notNull()
    .references(() => collaborationRooms.id, { onDelete: "cascade" }),
  author_id: text("author_id")
    .notNull()
    .references(() => roomParticipants.id, { onDelete: "cascade" }),

  /**
   * Which take this marker belongs to. Copied from
   * `collaboration_rooms.take_number` at insert time — NOT looked up later,
   * because the room's counter moves on the next reset and a late lookup would
   * relabel take-1 markers as take-3. Also the join key to `room_takes` for the
   * wall-clock anchor.
   */
  take_number: integer("take_number").notNull().default(1),

  marker_type: text("marker_type").notNull(),
  // Canonical quick-marker taxonomy (single vocabulary for host/director/editor)
  // — see lib/recording-v2/marker-types.ts (QUICK_MARKER_TYPES):
  //   content: clip | quote | highlight
  //   editing: cut | retake | tech_issue
  //   flow:    break_start | break_end | chapter
  // (Older rows may carry legacy values; they render via a fallback style.)
  label: text("label").notNull(),
  note: text("note"),
  /**
   * NET recording time in ms — accumulated time the app spent in `live`,
   * EXCLUDING every paused stretch. This is the cockpit clock's number: what
   * the host sees on the big timer and where the pin sits on the live timeline.
   *
   * ⚠️ NEVER export this to an editor. The camera keeps rolling through a
   * pause, so from the first break onward this value drifts behind the camera
   * file by the total paused duration. Editor-facing timestamps come from
   * `cameraMsForMarker()` in `lib/recording-v2/camera-time.ts`.
   *
   * (Renamed from the ambiguous `recording_ms`, which read like "position in
   * the recording" and was being treated as such.)
   */
  net_recording_ms: integer("net_recording_ms").notNull(),
  /** Phase X Step 5 — current Prep V2 section key when the marker was created. */
  section_key: text("section_key"),
  /**
   * Wall clock at which the marker was flagged — the basis for CAMERA time
   * (`wall_time − room_takes.anchor_at`). Always written explicitly from the
   * Node clock by every insert path; never left to the Postgres `now()` default,
   * because the app server and the managed DB are different hosts and the skew
   * between them would land directly in the exported timecode. The `defaultNow()`
   * below is a safety net for hand-written SQL only.
   */
  wall_time: timestamp("wall_time", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_room_session_markers_room_take").on(t.room_id, t.take_number),
  ],
)

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
