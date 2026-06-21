/**
 * Live Collaboration Room — shared types.
 *
 * Interview Cards, Card Materials, Collaboration Rooms, Participants,
 * Card State, and Card Notes. Used by schema, API routes, and UI.
 */

// ─── Enums / Unions ─────────────────────────────────────────────────

export type InterviewCardBucket =
  | "opening"
  | "deep"
  | "escalation"
  | "surprise"
  | "backup"
  | "recovery"

export type CardMaterialType =
  | "fact"
  | "background"
  | "quote"
  | "statistic"
  | "article"
  | "image"
  | "video"
  | "old_interview"
  | "social_post"
  | "guest_statement"
  | "contradiction"

export type CardMaterialCredibility = "verified" | "strong" | "weak" | "unverified"

export type CollaborationRoomStatus = "waiting" | "live" | "paused" | "ended"

export type ParticipantRole = "host" | "director" | "photographer" | "editor" | "viewer"

export type RoomCardStatus = "pending" | "active" | "used" | "skipped"

export type SessionMarkerType =
  | "episode_started"
  | "break"
  | "retake"
  | "important"
  | "technical_issue"
  | "custom"

export type CardNoteType = "normal" | "urgent" | "tactical"

export type NotePriority = "low" | "medium" | "high"

// ─── Follow-up sub-type (shared with jsonb column) ──────────────────

export interface CardFollowUp {
  id: string
  text: string
  trigger_condition?: string
}

// ─── Full Entity Types ──────────────────────────────────────────────

export interface InterviewCard {
  id: string
  preparation_id: string
  sort_order: number
  section_id: string
  section_label: string
  bucket: InterviewCardBucket
  short_title: string
  source_question_id: string | null

  // Question versions
  spoken_kuwaiti: string
  formal_version: string | null
  shorter_version: string | null
  deeper_version: string | null
  softer_version: string | null

  // Entry styles (maddakhel)
  entry_soft: string | null
  entry_direct: string | null
  entry_emotional: string | null
  entry_provocative: string | null
  transition_out: string | null

  // Follow-ups
  follow_ups: CardFollowUp[]

  // Host guidance
  why_this_matters: string | null
  when_to_ask: string | null
  how_to_ask: string | null
  emotional_tone: string | null
  if_guest_avoids: string | null
  if_guest_emotional: string | null
  if_answer_weak: string | null
  sensitivity_note: string | null

  // Content potential
  clip_potential: boolean
  quote_potential: boolean
  emotional_peak: boolean

  // Metadata
  is_pinned: boolean
  is_deleted: boolean
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface CardMaterial {
  id: string
  card_id: string
  type: CardMaterialType
  title: string
  content: string
  source_url: string | null
  source_name: string | null
  credibility: CardMaterialCredibility
  sort_order: number
  is_pinned: boolean
  ai_generated: boolean
  created_at: string
}

export interface CollaborationRoom {
  id: string
  preparation_id: string
  name: string
  status: CollaborationRoomStatus
  phase: string
  energy_level: number
  active_card_id: string | null
  host_notes: string
  /**
   * prep_v2 live section pointer — which section the host is currently
   * driving. Broadcast over the `room_update` SSE event so all participants
   * follow along. Mirrors the schema columns of the same name.
   */
  current_section_key: string | null
  current_section_index: number | null
  recording_started_at: string | null
  recording_ended_at: string | null
  recording_paused_at: string | null
  recording_elapsed_ms: number
  /**
   * Khat Brain — back-pointer to the master EIR. Stamped by createRoom
   * via walkForwardIfBehind so the cycle script + workspace can verify
   * phase progression. Type-only addition mirroring the schema column
   * (`collaboration.ts:eir_id`).
   */
  eir_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface RoomParticipant {
  id: string
  room_id: string
  user_id: string | null
  display_name: string
  role: ParticipantRole
  is_online: boolean
  last_heartbeat: string
  joined_at: string
  left_at: string | null
}

export interface RoomCardState {
  id: string
  room_id: string
  card_id: string
  status: RoomCardStatus
  is_pinned: boolean
  activated_at: string | null
  completed_at: string | null
}

export interface RoomSessionMarker {
  id: string
  room_id: string
  author_id: string
  marker_type: SessionMarkerType
  label: string
  note: string | null
  recording_ms: number
  wall_time: string
  created_at: string
}

export interface RoomCardNote {
  id: string
  room_id: string
  card_id: string
  author_id: string
  content: string
  note_type: CardNoteType
  priority: NotePriority
  is_seen_by_host: boolean
  seen_by_host_at: string | null
  resolved_at: string | null
  created_at: string
}

// ─── View Types (Admin / UI) ────────────────────────────────────────

/** Card with its materials attached — used in card list and detail views */
export interface InterviewCardWithMaterials extends InterviewCard {
  materials: CardMaterial[]
}

/** Full room snapshot — used by SSE initial payload and room detail view */
export interface CollaborationRoomSnapshot extends CollaborationRoom {
  cards: InterviewCardWithMaterials[]
  participants: RoomParticipant[]
  card_states: RoomCardState[]
  notes: RoomCardNote[]
  markers: RoomSessionMarker[]
}

/** Lightweight room listing item */
export interface CollaborationRoomListItem {
  id: string
  name: string
  status: CollaborationRoomStatus
  phase: string
  participants_count: number
  created_at: string
}

// ─── SSE Event Types ────────────────────────────────────────────────

export type RoomEventType =
  | "snapshot"          // full state on connect
  | "room_update"       // room-level changes (status, phase, energy, active_card, timer)
  | "card_state_update" // single card state change
  | "participant_update"// participant join/leave/role change
  | "note_added"        // new note from team
  | "note_seen"         // host marked note as seen
  | "card_pinned"       // card pin toggled in room
  | "marker_added"      // new session marker
  | "marker_deleted"    // session marker removed

export interface RoomEvent {
  type: RoomEventType
  data: unknown
  timestamp: string
}

// ─── Card CRUD Input Types ──────────────────────────────────────────

export interface CreateInterviewCardInput {
  preparation_id: string
  section_id: string
  section_label: string
  bucket: InterviewCardBucket
  short_title: string
  spoken_kuwaiti: string
  sort_order?: number
  source_question_id?: string
  formal_version?: string
  shorter_version?: string
  deeper_version?: string
  softer_version?: string
  entry_soft?: string
  entry_direct?: string
  entry_emotional?: string
  entry_provocative?: string
  transition_out?: string
  follow_ups?: CardFollowUp[]
  why_this_matters?: string
  when_to_ask?: string
  how_to_ask?: string
  emotional_tone?: string
  if_guest_avoids?: string
  if_guest_emotional?: string
  if_answer_weak?: string
  sensitivity_note?: string
  clip_potential?: boolean
  quote_potential?: boolean
  emotional_peak?: boolean
}

export interface UpdateInterviewCardInput {
  short_title?: string
  spoken_kuwaiti?: string
  formal_version?: string | null
  shorter_version?: string | null
  deeper_version?: string | null
  softer_version?: string | null
  entry_soft?: string | null
  entry_direct?: string | null
  entry_emotional?: string | null
  entry_provocative?: string | null
  transition_out?: string | null
  follow_ups?: CardFollowUp[]
  why_this_matters?: string | null
  when_to_ask?: string | null
  how_to_ask?: string | null
  emotional_tone?: string | null
  if_guest_avoids?: string | null
  if_guest_emotional?: string | null
  if_answer_weak?: string | null
  sensitivity_note?: string | null
  clip_potential?: boolean
  quote_potential?: boolean
  emotional_peak?: boolean
  is_pinned?: boolean
  sort_order?: number
  bucket?: InterviewCardBucket
  section_id?: string
  section_label?: string
}

export interface CreateCardMaterialInput {
  card_id: string
  type: CardMaterialType
  title: string
  content: string
  source_url?: string
  source_name?: string
  credibility?: CardMaterialCredibility
  sort_order?: number
}

// ─── Room Input Types ───────────────────────────────────────────────

export interface CreateRoomInput {
  preparation_id: string
  name: string
}

export interface UpdateRoomInput {
  status?: CollaborationRoomStatus
  phase?: string
  energy_level?: number
  active_card_id?: string | null
  host_notes?: string
  recording_paused_at?: string | null
  recording_elapsed_ms?: number
}

export interface CreateSessionMarkerInput {
  marker_type: SessionMarkerType
  label: string
  note?: string
}

export interface CreateRoomNoteInput {
  card_id: string
  content: string
  note_type?: CardNoteType
  priority?: NotePriority
}
