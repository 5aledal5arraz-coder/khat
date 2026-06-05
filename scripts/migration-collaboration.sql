-- Migration: Add Live Collaboration Room tables (Interview Cards + Recording Room)
-- Run: npx tsx scripts/run-migration.ts scripts/migration-collaboration.sql

-- 1. Add cards_generated_at column to episode_preparations
ALTER TABLE episode_preparations ADD COLUMN IF NOT EXISTS cards_generated_at timestamptz;

-- 2. Create interview_cards table
CREATE TABLE IF NOT EXISTS interview_cards (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  preparation_id text NOT NULL REFERENCES episode_preparations(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  section_id text NOT NULL,
  section_label text NOT NULL,
  bucket text NOT NULL,
  short_title text NOT NULL,
  source_question_id text,
  spoken_kuwaiti text NOT NULL,
  formal_version text,
  shorter_version text,
  deeper_version text,
  softer_version text,
  entry_soft text,
  entry_direct text,
  entry_emotional text,
  entry_provocative text,
  transition_out text,
  follow_ups jsonb NOT NULL DEFAULT '[]',
  why_this_matters text,
  when_to_ask text,
  how_to_ask text,
  emotional_tone text,
  if_guest_avoids text,
  if_guest_emotional text,
  if_answer_weak text,
  sensitivity_note text,
  clip_potential boolean NOT NULL DEFAULT false,
  quote_potential boolean NOT NULL DEFAULT false,
  emotional_peak boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  ai_generated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create card_materials table
CREATE TABLE IF NOT EXISTS card_materials (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  card_id text NOT NULL REFERENCES interview_cards(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  source_url text,
  source_name text,
  credibility text NOT NULL DEFAULT 'unverified',
  sort_order integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  ai_generated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create collaboration_rooms table
CREATE TABLE IF NOT EXISTS collaboration_rooms (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  preparation_id text NOT NULL REFERENCES episode_preparations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  phase text NOT NULL DEFAULT 'opening',
  energy_level integer NOT NULL DEFAULT 3,
  active_card_id text REFERENCES interview_cards(id) ON DELETE SET NULL,
  host_notes text NOT NULL DEFAULT '',
  recording_started_at timestamptz,
  recording_ended_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Create room_participants table
CREATE TABLE IF NOT EXISTS room_participants (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  user_id text,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  is_online boolean NOT NULL DEFAULT false,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE(room_id, user_id)
);

-- 6. Create room_card_state table
CREATE TABLE IF NOT EXISTS room_card_state (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES interview_cards(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  is_pinned boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  completed_at timestamptz,
  UNIQUE(room_id, card_id)
);

-- 7. Create room_card_notes table
CREATE TABLE IF NOT EXISTS room_card_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES interview_cards(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'normal',
  priority text NOT NULL DEFAULT 'medium',
  is_seen_by_host boolean NOT NULL DEFAULT false,
  seen_by_host_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
