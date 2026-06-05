-- ===========================================================================
-- Guest Candidates Module — Standalone Schema
-- ===========================================================================
-- 10 tables for managing potential podcast guests independently from the
-- live `guests`, `episodes`, and `studio_*` tables. No foreign keys to those.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_candidates (
  id text PRIMARY KEY,

  -- Identity
  full_name text NOT NULL,
  display_name text,
  slug text UNIQUE,

  -- Profile
  primary_language text DEFAULT 'ar',
  category text,
  city text,
  country text,
  bio text,
  notes_internal text,

  -- Lifecycle
  status text NOT NULL DEFAULT 'new',
  source_type text DEFAULT 'manual',
  source_note text,
  priority_level text DEFAULT 'medium',

  -- AI Analysis (latest snapshot)
  ai_score_overall real,
  ai_fit_score real,
  ai_depth_score real,
  ai_reach_score real,
  ai_risk_score real,
  ai_summary text,
  ai_strengths jsonb DEFAULT '[]'::jsonb,
  ai_weaknesses jsonb DEFAULT '[]'::jsonb,
  ai_risk_notes text,
  ai_topics_json jsonb DEFAULT '[]'::jsonb,
  ai_reason_to_invite text,
  ai_conversation_angles_json jsonb DEFAULT '[]'::jsonb,
  ai_suggested_questions_json jsonb DEFAULT '{}'::jsonb,
  ai_model_used text,
  ai_generated_at timestamptz,

  -- Activity timestamps
  last_contacted_at timestamptz,
  prep_link_last_sent_at timestamptz,

  -- Soft delete + timestamps
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Social links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_candidate_social_links (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  label text,
  is_primary boolean DEFAULT false,
  confidence_score real,
  source text DEFAULT 'manual',
  verified_by_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Status history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_candidate_status_history (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by text,
  change_note text,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. AI runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_candidate_ai_runs (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  model_name text NOT NULL,
  input_snapshot_json jsonb,
  output_snapshot_json jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  error_message text
);

-- ---------------------------------------------------------------------------
-- 5. Outreach messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_candidate_outreach_messages (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  tone text NOT NULL,
  subject_line text,
  message_body text NOT NULL,
  generated_by_ai boolean DEFAULT true,
  edited_by_admin boolean DEFAULT false,
  version_number integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Prep form templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prep_form_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  schema_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Prep form links (token-based public access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prep_form_links (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES prep_form_templates(id) ON DELETE RESTRICT,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  expires_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  submitted_at timestamptz,
  sent_via text,
  location_note text,
  meeting_note text,
  admin_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. Prep form responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prep_form_responses (
  id text PRIMARY KEY,
  prep_link_id text NOT NULL REFERENCES prep_form_links(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  response_json jsonb NOT NULL,
  completion_percent real DEFAULT 0,
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. AI analysis of prep responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prep_form_response_analysis (
  id text PRIMARY KEY,
  response_id text NOT NULL REFERENCES prep_form_responses(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  ai_personality_summary text,
  ai_talking_points_json jsonb DEFAULT '[]'::jsonb,
  ai_sensitive_topics_json jsonb DEFAULT '[]'::jsonb,
  ai_preferred_angles_json jsonb DEFAULT '[]'::jsonb,
  ai_followup_questions_json jsonb DEFAULT '[]'::jsonb,
  ai_red_flags_json jsonb DEFAULT '[]'::jsonb,
  ai_practical_notes text,
  ai_opening_line text,
  ai_recommended_style text,
  model_name text,
  generated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 10. Notifications log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_candidate_notifications (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES guest_candidates(id) ON DELETE CASCADE,
  prep_link_id text REFERENCES prep_form_links(id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  delivery_channel text NOT NULL,
  recipient text,
  payload_json jsonb,
  delivered_at timestamptz,
  delivery_error text,
  created_at timestamptz DEFAULT now()
);

-- ===========================================================================
-- updated_at triggers (uses existing set_updated_at() function)
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_guest_candidates_updated_at ON guest_candidates;
CREATE TRIGGER trg_guest_candidates_updated_at
  BEFORE UPDATE ON guest_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_guest_candidate_social_links_updated_at ON guest_candidate_social_links;
CREATE TRIGGER trg_guest_candidate_social_links_updated_at
  BEFORE UPDATE ON guest_candidate_social_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_guest_candidate_outreach_messages_updated_at ON guest_candidate_outreach_messages;
CREATE TRIGGER trg_guest_candidate_outreach_messages_updated_at
  BEFORE UPDATE ON guest_candidate_outreach_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_prep_form_templates_updated_at ON prep_form_templates;
CREATE TRIGGER trg_prep_form_templates_updated_at
  BEFORE UPDATE ON prep_form_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_prep_form_links_updated_at ON prep_form_links;
CREATE TRIGGER trg_prep_form_links_updated_at
  BEFORE UPDATE ON prep_form_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_prep_form_responses_updated_at ON prep_form_responses;
CREATE TRIGGER trg_prep_form_responses_updated_at
  BEFORE UPDATE ON prep_form_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- Indexes
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_guest_candidates_status ON guest_candidates(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_guest_candidates_category ON guest_candidates(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_guest_candidates_priority ON guest_candidates(priority_level) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_guest_candidates_created_at ON guest_candidates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_updated_at ON guest_candidates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_archived_at ON guest_candidates(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_candidates_full_name ON guest_candidates(full_name);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_slug ON guest_candidates(slug);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_social_links_candidate_id ON guest_candidate_social_links(candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_social_links_platform ON guest_candidate_social_links(platform);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_status_history_candidate_id ON guest_candidate_status_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_status_history_created_at ON guest_candidate_status_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_ai_runs_candidate_id ON guest_candidate_ai_runs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_ai_runs_run_type ON guest_candidate_ai_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_ai_runs_status ON guest_candidate_ai_runs(status);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_outreach_messages_candidate_id ON guest_candidate_outreach_messages(candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_outreach_messages_channel ON guest_candidate_outreach_messages(channel_type);

CREATE INDEX IF NOT EXISTS idx_prep_form_templates_active ON prep_form_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prep_form_templates_default ON prep_form_templates(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_prep_form_links_candidate_id ON prep_form_links(candidate_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_links_template_id ON prep_form_links(template_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_links_token ON prep_form_links(token);
CREATE INDEX IF NOT EXISTS idx_prep_form_links_status ON prep_form_links(status);

CREATE INDEX IF NOT EXISTS idx_prep_form_responses_prep_link_id ON prep_form_responses(prep_link_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_responses_candidate_id ON prep_form_responses(candidate_id);

CREATE INDEX IF NOT EXISTS idx_prep_form_response_analysis_response_id ON prep_form_response_analysis(response_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_response_analysis_candidate_id ON prep_form_response_analysis(candidate_id);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_notifications_candidate_id ON guest_candidate_notifications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_notifications_prep_link_id ON guest_candidate_notifications(prep_link_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_notifications_type ON guest_candidate_notifications(notification_type);

-- ===========================================================================
-- CHECK constraints
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_candidates_status_check'
  ) THEN
    ALTER TABLE guest_candidates ADD CONSTRAINT guest_candidates_status_check
      CHECK (status IN ('new', 'researching', 'analyzed', 'shortlisted', 'contacted',
        'waiting_response', 'accepted', 'declined', 'prep_sent',
        'prep_in_progress', 'prep_completed', 'archived', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_candidates_priority_check'
  ) THEN
    ALTER TABLE guest_candidates ADD CONSTRAINT guest_candidates_priority_check
      CHECK (priority_level IN ('low', 'medium', 'high'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prep_form_links_status_check'
  ) THEN
    ALTER TABLE prep_form_links ADD CONSTRAINT prep_form_links_status_check
      CHECK (status IN ('draft', 'sent', 'opened', 'in_progress', 'completed', 'expired', 'cancelled'));
  END IF;
END $$;
