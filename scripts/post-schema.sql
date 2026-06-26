-- post-schema.sql
-- Run AFTER drizzle-kit push to add triggers, RPC functions, and constraints
-- that Drizzle schema definitions cannot express.
--
-- Usage: DATABASE_URL="<url>" npx tsx scripts/run-migration.ts scripts/post-schema.sql

-- ============================================================
-- 1. Auto-update updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Attach trigger to all tables with updated_at
-- ============================================================

-- Episodes
DROP TRIGGER IF EXISTS trg_episodes_updated_at ON episodes;
CREATE TRIGGER trg_episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_episode_enrichments_updated_at ON episode_enrichments;
CREATE TRIGGER trg_episode_enrichments_updated_at
  BEFORE UPDATE ON episode_enrichments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Studio
DROP TRIGGER IF EXISTS trg_studio_sessions_updated_at ON studio_sessions;
CREATE TRIGGER trg_studio_sessions_updated_at
  BEFORE UPDATE ON studio_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Content
DROP TRIGGER IF EXISTS trg_home_quotes_updated_at ON home_quotes;
CREATE TRIGGER trg_home_quotes_updated_at
  BEFORE UPDATE ON home_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_daily_reflections_updated_at ON daily_reflections;
CREATE TRIGGER trg_daily_reflections_updated_at
  BEFORE UPDATE ON daily_reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_teasers_updated_at ON teasers;
CREATE TRIGGER trg_teasers_updated_at
  BEFORE UPDATE ON teasers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- System
DROP TRIGGER IF EXISTS trg_config_store_updated_at ON config_store;
CREATE TRIGGER trg_config_store_updated_at
  BEFORE UPDATE ON config_store
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON site_settings;
CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_static_content_updated_at ON static_content;
CREATE TRIGGER trg_static_content_updated_at
  BEFORE UPDATE ON static_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_personalization_profiles_updated_at ON personalization_profiles;
CREATE TRIGGER trg_personalization_profiles_updated_at
  BEFORE UPDATE ON personalization_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_watch_history_updated_at ON watch_history;
CREATE TRIGGER trg_watch_history_updated_at
  BEFORE UPDATE ON watch_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_platform_analytics_updated_at ON platform_analytics;
CREATE TRIGGER trg_platform_analytics_updated_at
  BEFORE UPDATE ON platform_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. CHECK constraints
-- ============================================================

-- Khat Brain wizard stage enum guard (Phase A/B redesign).
DO $$ BEGIN
  ALTER TABLE khat_map_seasons
    ADD CONSTRAINT chk_khat_map_seasons_wizard_stage
    CHECK (wizard_stage IN ('setup', 'topics', 'topics_locked', 'guests', 'complete'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 4. push_episode_data() RPC function (used by Studio push)
-- ============================================================
CREATE OR REPLACE FUNCTION push_episode_data(
  p_episode_id text,
  p_override jsonb,
  p_quotes jsonb,
  p_enrichment jsonb,
  p_log jsonb
) RETURNS void AS $$
BEGIN
  -- Upsert episode override
  IF p_override IS NOT NULL THEN
    INSERT INTO episode_overrides (episode_id, original_title, custom_title, custom_description)
    VALUES (
      p_episode_id,
      p_override->>'original_title',
      p_override->>'custom_title',
      p_override->>'custom_description'
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      original_title = COALESCE(EXCLUDED.original_title, episode_overrides.original_title),
      custom_title = COALESCE(EXCLUDED.custom_title, episode_overrides.custom_title),
      custom_description = COALESCE(EXCLUDED.custom_description, episode_overrides.custom_description);
  END IF;

  -- Upsert episode quotes config
  IF p_quotes IS NOT NULL THEN
    INSERT INTO episode_quotes_config (episode_id, episode_title, quotes, status, generated_at, published_at)
    VALUES (
      p_episode_id,
      p_quotes->>'episode_title',
      p_quotes->'quotes',
      COALESCE(p_quotes->>'status', 'draft'),
      p_quotes->>'generated_at',
      p_quotes->>'published_at'
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      episode_title = COALESCE(EXCLUDED.episode_title, episode_quotes_config.episode_title),
      quotes = EXCLUDED.quotes,
      status = COALESCE(EXCLUDED.status, episode_quotes_config.status),
      generated_at = COALESCE(EXCLUDED.generated_at, episode_quotes_config.generated_at),
      published_at = COALESCE(EXCLUDED.published_at, episode_quotes_config.published_at);
  END IF;

  -- Upsert episode enrichment (merge fields)
  IF p_enrichment IS NOT NULL THEN
    INSERT INTO episode_enrichments (episode_id,
      hero_summary, full_summary, takeaways, resources, timestamps,
      updated_at)
    VALUES (
      p_episode_id,
      p_enrichment->>'hero_summary',
      p_enrichment->>'full_summary',
      CASE WHEN p_enrichment ? 'takeaways' THEN p_enrichment->'takeaways' ELSE '[]'::jsonb END,
      CASE WHEN p_enrichment ? 'resources' THEN p_enrichment->'resources' ELSE '[]'::jsonb END,
      CASE WHEN p_enrichment ? 'timestamps' THEN p_enrichment->'timestamps' ELSE '[]'::jsonb END,
      NOW()
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      hero_summary = COALESCE(NULLIF(p_enrichment->>'hero_summary', ''), episode_enrichments.hero_summary),
      full_summary = COALESCE(NULLIF(p_enrichment->>'full_summary', ''), episode_enrichments.full_summary),
      takeaways = CASE WHEN p_enrichment ? 'takeaways' THEN p_enrichment->'takeaways' ELSE episode_enrichments.takeaways END,
      resources = CASE WHEN p_enrichment ? 'resources' THEN p_enrichment->'resources' ELSE episode_enrichments.resources END,
      timestamps = CASE WHEN p_enrichment ? 'timestamps' THEN p_enrichment->'timestamps' ELSE episode_enrichments.timestamps END,
      updated_at = NOW();
  END IF;

  -- Insert push log entry — Phase 4 consolidation moved push_log into
  -- studio_analysis_records (kind='push_log'). The legacy studio_push_log
  -- table is dropped, so this RPC writes the same shape via the
  -- consolidated table. Append-only history: a fresh row per push (no
  -- ON CONFLICT).
  IF p_log IS NOT NULL THEN
    INSERT INTO studio_analysis_records (
      id, studio_session_id, kind, status, data, published_at, generated_at
    ) VALUES (
      gen_random_uuid()::text,
      p_log->>'session_id',
      'push_log',
      'ready',
      jsonb_build_object(
        'episode_id', p_episode_id,
        'episode_title', p_log->>'episode_title',
        'pushed_fields', p_log->'pushed_fields',
        'pushed_at', p_log->>'pushed_at'
      ),
      (p_log->>'pushed_at')::timestamptz,
      NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Trusted Partners
-- ============================================================

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_trusted_partners_updated_at ON trusted_partners;
CREATE TRIGGER trg_trusted_partners_updated_at
  BEFORE UPDATE ON trusted_partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trusted_partners_display_order ON trusted_partners (display_order);
CREATE INDEX IF NOT EXISTS idx_trusted_partners_is_active ON trusted_partners (is_active);

-- Description length constraint
DO $$ BEGIN
  ALTER TABLE trusted_partners ADD CONSTRAINT chk_trusted_partners_description_length
    CHECK (char_length(description) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 6. Newsletter Campaigns & Tracking
-- ============================================================

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_newsletter_campaigns_updated_at ON newsletter_campaigns;
CREATE TRIGGER trg_newsletter_campaigns_updated_at
  BEFORE UPDATE ON newsletter_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Campaign status constraint
DO $$ BEGIN
  ALTER TABLE newsletter_campaigns ADD CONSTRAINT chk_newsletter_campaigns_status
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Campaign type constraint
DO $$ BEGIN
  ALTER TABLE newsletter_campaigns ADD CONSTRAINT chk_newsletter_campaigns_type
    CHECK (type IN ('one_off', 'monthly'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Delivery status constraint
DO $$ BEGIN
  ALTER TABLE newsletter_deliveries ADD CONSTRAINT chk_newsletter_deliveries_status
    CHECK (status IN ('queued', 'sent', 'failed', 'delivered', 'opened', 'clicked', 'bounced', 'complained'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Delivery lifecycle columns, populated by the Resend webhook
-- (drizzle/migrations/0001 also adds these; idempotent here so every deploy
-- has them even if the migration baseline differs).
ALTER TABLE newsletter_deliveries ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE newsletter_deliveries ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE newsletter_deliveries ADD COLUMN IF NOT EXISTS bounce_type text;
ALTER TABLE newsletter_deliveries ADD COLUMN IF NOT EXISTS complained_at timestamptz;

-- Subscriber status constraint (the Resend webhook writes bounced/complained).
DO $$ BEGIN
  ALTER TABLE newsletter_subscribers ADD CONSTRAINT chk_newsletter_subscribers_status
    CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- At most ONE campaign may be 'sending' at a time. This partial unique index is
-- the atomic guard against the concurrent-send race (two requests both passing
-- the in-app check and creating duplicate sends to the whole list).
CREATE UNIQUE INDEX IF NOT EXISTS uq_newsletter_one_sending
  ON newsletter_campaigns (status) WHERE status = 'sending';

-- Indexes for newsletter queries
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_campaign_id ON newsletter_deliveries (campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_subscriber_id ON newsletter_deliveries (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_links_campaign_id ON newsletter_links (campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_clicks_link_id ON newsletter_clicks (link_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_clicks_delivery_id ON newsletter_clicks (delivery_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status ON newsletter_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_sent_at ON newsletter_campaigns (sent_at);

-- ============================================================
-- 7. Admin Auth Tables
-- ============================================================

-- updated_at trigger for admin_users
DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Admin role constraint
DO $$ BEGIN
  ALTER TABLE admin_users ADD CONSTRAINT chk_admin_users_role
    CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enforce exactly one OWNER at the database level (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_single_owner
  ON admin_users (role) WHERE role = 'OWNER';

-- Prevent OWNER deletion
CREATE OR REPLACE FUNCTION prevent_owner_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot delete the OWNER account';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_owner_deletion ON admin_users;
CREATE TRIGGER trg_prevent_owner_deletion
  BEFORE DELETE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION prevent_owner_deletion();

-- Prevent OWNER role change
CREATE OR REPLACE FUNCTION prevent_owner_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'OWNER' AND NEW.role != 'OWNER' THEN
    RAISE EXCEPTION 'Cannot change the OWNER role';
  END IF;
  IF NEW.role = 'OWNER' AND OLD.role != 'OWNER' THEN
    RAISE EXCEPTION 'Cannot promote to OWNER';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_owner_role_change ON admin_users;
CREATE TRIGGER trg_prevent_owner_role_change
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION prevent_owner_role_change();

-- Prevent OWNER disable
CREATE OR REPLACE FUNCTION prevent_owner_disable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'OWNER' AND NEW.is_active = false THEN
    RAISE EXCEPTION 'Cannot disable the OWNER account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_owner_disable ON admin_users;
CREATE TRIGGER trg_prevent_owner_disable
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION prevent_owner_disable();

-- Session lookup indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON admin_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs (created_at);

-- ============================================================
-- 8. Podcast Platform Links & Episode Audio
-- ============================================================

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_podcast_platform_links_updated_at ON podcast_platform_links;
CREATE TRIGGER trg_podcast_platform_links_updated_at
  BEFORE UPDATE ON podcast_platform_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_podcast_platform_links_sort_order ON podcast_platform_links (sort_order);

-- RSS guid index on episodes (for sync lookups)
CREATE INDEX IF NOT EXISTS idx_episodes_rss_guid ON episodes (rss_guid) WHERE rss_guid IS NOT NULL;

-- ============================================================
-- 9. Performance Indexes for Common Queries
-- ============================================================

-- Episodes: homepage/listing queries (status + date sorting)
CREATE INDEX IF NOT EXISTS idx_episodes_release_date ON episodes (release_date DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_guest_id ON episodes (guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_slug ON episodes (slug);
-- Note: episodes table uses youtube_url, not video_id (video_id is on studio_sessions)

-- Episode enrichments: lookup by episode
CREATE INDEX IF NOT EXISTS idx_episode_enrichments_episode_id ON episode_enrichments (episode_id);

-- Episode overrides: lookup by episode
CREATE INDEX IF NOT EXISTS idx_episode_overrides_episode_id ON episode_overrides (episode_id);

-- Episode quotes config: lookup by episode + status
CREATE INDEX IF NOT EXISTS idx_episode_quotes_config_episode_id ON episode_quotes_config (episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_quotes_config_status ON episode_quotes_config (status);

-- Studio sessions: listing and lookup
CREATE INDEX IF NOT EXISTS idx_studio_sessions_video_id ON studio_sessions (video_id) WHERE video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studio_sessions_created_at ON studio_sessions (created_at DESC);

-- Guests: name search and slug lookup
CREATE INDEX IF NOT EXISTS idx_guests_slug ON guests (slug);
CREATE INDEX IF NOT EXISTS idx_guests_name ON guests (name);

-- Newsletter subscribers: email lookup
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers (email);
-- Newsletter subscribers: active-recipient selection on every campaign send
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers (status);

-- Home quotes: episode lookup
CREATE INDEX IF NOT EXISTS idx_home_quotes_episode_id ON home_quotes (episode_id);

-- Daily reflections: episode lookup
CREATE INDEX IF NOT EXISTS idx_daily_reflections_episode_id ON daily_reflections (episode_id);

-- Watch history: visitor + episode lookup
CREATE INDEX IF NOT EXISTS idx_watch_history_visitor_id ON watch_history (visitor_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_episode_id ON watch_history (episode_id);

-- Sponsorship AI indexes
CREATE INDEX IF NOT EXISTS idx_sponsorship_analysis_lead_id ON sponsorship_analysis(lead_id);
CREATE INDEX IF NOT EXISTS idx_sponsorship_proposals_lead_id ON sponsorship_proposals(lead_id);

-- Guest Prep Forms
DROP TRIGGER IF EXISTS trg_guest_prep_forms_updated_at ON guest_prep_forms;
CREATE TRIGGER trg_guest_prep_forms_updated_at
  BEFORE UPDATE ON guest_prep_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_guest_prep_forms_application_id ON guest_prep_forms (application_id);
CREATE INDEX IF NOT EXISTS idx_guest_prep_forms_token_hash ON guest_prep_forms (token_hash);

-- Guest Application AI indexes
CREATE INDEX IF NOT EXISTS idx_guest_application_analysis_app_id ON guest_application_analysis(application_id);
CREATE INDEX IF NOT EXISTS idx_guest_application_concepts_app_id ON guest_application_concepts(application_id);
CREATE INDEX IF NOT EXISTS idx_guest_application_concepts_analysis_id ON guest_application_concepts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_guest_application_responses_app_id ON guest_application_responses(application_id);

-- ============================================================
-- 11. Guest Candidates module (independent — no FK to guests/episodes)
-- ============================================================

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_guest_candidates_updated_at ON guest_candidates;
CREATE TRIGGER trg_guest_candidates_updated_at
  BEFORE UPDATE ON guest_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_guest_candidate_social_links_updated_at ON guest_candidate_social_links;
CREATE TRIGGER trg_guest_candidate_social_links_updated_at
  BEFORE UPDATE ON guest_candidate_social_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_guest_candidate_outreach_messages_updated_at ON guest_candidate_outreach_messages;
CREATE TRIGGER trg_guest_candidate_outreach_messages_updated_at
  BEFORE UPDATE ON guest_candidate_outreach_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prep_form_templates_updated_at ON prep_form_templates;
CREATE TRIGGER trg_prep_form_templates_updated_at
  BEFORE UPDATE ON prep_form_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prep_form_links_updated_at ON prep_form_links;
CREATE TRIGGER trg_prep_form_links_updated_at
  BEFORE UPDATE ON prep_form_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prep_form_responses_updated_at ON prep_form_responses;
CREATE TRIGGER trg_prep_form_responses_updated_at
  BEFORE UPDATE ON prep_form_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes (lookup, filter, search)
CREATE INDEX IF NOT EXISTS idx_guest_candidates_status ON guest_candidates (status);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_category ON guest_candidates (category);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_priority ON guest_candidates (priority_level);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_created_at ON guest_candidates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_updated_at ON guest_candidates (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_archived_at ON guest_candidates (archived_at);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_deleted_at ON guest_candidates (deleted_at);
CREATE INDEX IF NOT EXISTS idx_guest_candidates_full_name ON guest_candidates (full_name);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_social_links_candidate_id ON guest_candidate_social_links (candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_status_history_candidate_id ON guest_candidate_status_history (candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_status_history_created_at ON guest_candidate_status_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_ai_runs_candidate_id ON guest_candidate_ai_runs (candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_ai_runs_run_type ON guest_candidate_ai_runs (run_type);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_outreach_messages_candidate_id ON guest_candidate_outreach_messages (candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_outreach_messages_created_at ON guest_candidate_outreach_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prep_form_templates_is_active ON prep_form_templates (is_active);

CREATE INDEX IF NOT EXISTS idx_prep_form_links_candidate_id ON prep_form_links (candidate_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_links_template_id ON prep_form_links (template_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_links_token ON prep_form_links (token);
CREATE INDEX IF NOT EXISTS idx_prep_form_links_status ON prep_form_links (status);

CREATE INDEX IF NOT EXISTS idx_prep_form_responses_candidate_id ON prep_form_responses (candidate_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_responses_prep_link_id ON prep_form_responses (prep_link_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_responses_submitted_at ON prep_form_responses (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_prep_form_response_analysis_candidate_id ON prep_form_response_analysis (candidate_id);
CREATE INDEX IF NOT EXISTS idx_prep_form_response_analysis_response_id ON prep_form_response_analysis (response_id);

CREATE INDEX IF NOT EXISTS idx_guest_candidate_notifications_candidate_id ON guest_candidate_notifications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_notifications_type ON guest_candidate_notifications (notification_type);
CREATE INDEX IF NOT EXISTS idx_guest_candidate_notifications_created_at ON guest_candidate_notifications (created_at DESC);

-- Status validity check (canonical status flow)
ALTER TABLE guest_candidates DROP CONSTRAINT IF EXISTS guest_candidates_status_check;
ALTER TABLE guest_candidates ADD CONSTRAINT guest_candidates_status_check
  CHECK (status IN (
    'new', 'researching', 'analyzed', 'shortlisted', 'contacted',
    'waiting_response', 'accepted', 'declined', 'prep_sent',
    'prep_in_progress', 'prep_completed', 'archived', 'rejected'
  ));

ALTER TABLE guest_candidates DROP CONSTRAINT IF EXISTS guest_candidates_priority_check;
ALTER TABLE guest_candidates ADD CONSTRAINT guest_candidates_priority_check
  CHECK (priority_level IN ('low', 'medium', 'high'));

ALTER TABLE prep_form_links DROP CONSTRAINT IF EXISTS prep_form_links_status_check;
ALTER TABLE prep_form_links ADD CONSTRAINT prep_form_links_status_check
  CHECK (status IN ('draft', 'sent', 'opened', 'in_progress', 'completed', 'expired', 'cancelled'));

-- ============================================================
-- 12. Live Collaboration Room (Interview Cards + Recording Room)
-- ============================================================

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_interview_cards_updated_at ON interview_cards;
CREATE TRIGGER trg_interview_cards_updated_at
  BEFORE UPDATE ON interview_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_collaboration_rooms_updated_at ON collaboration_rooms;
CREATE TRIGGER trg_collaboration_rooms_updated_at
  BEFORE UPDATE ON collaboration_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes: interview_cards
CREATE INDEX IF NOT EXISTS idx_interview_cards_prep ON interview_cards (preparation_id);
CREATE INDEX IF NOT EXISTS idx_interview_cards_prep_sort ON interview_cards (preparation_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_interview_cards_source_question ON interview_cards (source_question_id) WHERE source_question_id IS NOT NULL;

-- Indexes: card_materials
CREATE INDEX IF NOT EXISTS idx_card_materials_card ON card_materials (card_id);

-- Indexes: collaboration_rooms
CREATE INDEX IF NOT EXISTS idx_collaboration_rooms_prep ON collaboration_rooms (preparation_id);

-- Unique partial index: only one non-ended room per preparation
CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_rooms_active_prep
  ON collaboration_rooms (preparation_id) WHERE status != 'ended';

-- Indexes: room_participants
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_online ON room_participants (room_id) WHERE is_online = true;

-- Indexes: room_card_state
CREATE INDEX IF NOT EXISTS idx_room_card_state_room ON room_card_state (room_id);

-- Indexes: room_card_notes
CREATE INDEX IF NOT EXISTS idx_room_card_notes_room_card ON room_card_notes (room_id, card_id);
CREATE INDEX IF NOT EXISTS idx_room_card_notes_unseen ON room_card_notes (room_id) WHERE is_seen_by_host = false;

-- CHECK constraints: interview_cards.bucket
DO $$ BEGIN
  ALTER TABLE interview_cards ADD CONSTRAINT chk_interview_cards_bucket
    CHECK (bucket IN ('opening', 'deep', 'escalation', 'surprise', 'backup', 'recovery'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: collaboration_rooms.status
DO $$ BEGIN
  ALTER TABLE collaboration_rooms ADD CONSTRAINT chk_collaboration_rooms_status
    CHECK (status IN ('waiting', 'live', 'paused', 'ended'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: room_participants.role
DO $$ BEGIN
  ALTER TABLE room_participants ADD CONSTRAINT chk_room_participants_role
    CHECK (role IN ('host', 'director', 'photographer', 'editor', 'viewer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: room_card_state.status
DO $$ BEGIN
  ALTER TABLE room_card_state ADD CONSTRAINT chk_room_card_state_status
    CHECK (status IN ('pending', 'active', 'used', 'skipped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: room_card_notes.note_type
DO $$ BEGIN
  ALTER TABLE room_card_notes ADD CONSTRAINT chk_room_card_notes_note_type
    CHECK (note_type IN ('normal', 'urgent', 'tactical'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: room_session_markers.marker_type — unified quick-marker
-- taxonomy (lib/recording-v2/marker-types.ts), also validated in the app layer.
-- DROP+ADD (not the skip-if-exists pattern above) so re-applying this file
-- UPDATES the allowed set as the taxonomy evolves. Legacy values are kept so
-- existing production rows remain valid.
ALTER TABLE room_session_markers DROP CONSTRAINT IF EXISTS chk_room_session_markers_type;
DO $$ BEGIN
  ALTER TABLE room_session_markers ADD CONSTRAINT chk_room_session_markers_type
    CHECK (marker_type IN (
      -- canonical taxonomy
      'clip', 'quote', 'highlight', 'cut', 'retake', 'tech_issue',
      'break_start', 'break_end', 'chapter',
      -- system markers (not in the quick-tag UI)
      'energy_change',
      -- legacy values (pre-unification rows)
      'deep_moment', 'emotional', 'revisit', 'episode_started', 'break',
      'important', 'technical_issue', 'custom'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: room_card_notes.priority
DO $$ BEGIN
  ALTER TABLE room_card_notes ADD CONSTRAINT chk_room_card_notes_priority
    CHECK (priority IN ('low', 'medium', 'high'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: card_materials.credibility
DO $$ BEGIN
  ALTER TABLE card_materials ADD CONSTRAINT chk_card_materials_credibility
    CHECK (credibility IN ('verified', 'strong', 'weak', 'unverified'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraints: collaboration_rooms.energy_level (0-5)
DO $$ BEGIN
  ALTER TABLE collaboration_rooms ADD CONSTRAINT chk_collaboration_rooms_energy_level
    CHECK (energy_level >= 0 AND energy_level <= 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Khat Map — triggers, constraints, indexes
-- ============================================================

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_khat_map_seasons_updated_at ON khat_map_seasons;
CREATE TRIGGER trg_khat_map_seasons_updated_at
  BEFORE UPDATE ON khat_map_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_khat_map_episode_candidates_updated_at ON khat_map_episode_candidates;
CREATE TRIGGER trg_khat_map_episode_candidates_updated_at
  BEFORE UPDATE ON khat_map_episode_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_khat_map_guest_candidates_updated_at ON khat_map_guest_candidates;
CREATE TRIGGER trg_khat_map_guest_candidates_updated_at
  BEFORE UPDATE ON khat_map_guest_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_khat_map_rejected_patterns_updated_at ON khat_map_rejected_patterns;
CREATE TRIGGER trg_khat_map_rejected_patterns_updated_at
  BEFORE UPDATE ON khat_map_rejected_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_khat_map_accepted_patterns_updated_at ON khat_map_accepted_patterns;
CREATE TRIGGER trg_khat_map_accepted_patterns_updated_at
  BEFORE UPDATE ON khat_map_accepted_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_khat_map_topic_bank_updated_at ON khat_map_topic_bank;
CREATE TRIGGER trg_khat_map_topic_bank_updated_at
  BEFORE UPDATE ON khat_map_topic_bank
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Season status must be in the known set
DO $$ BEGIN
  ALTER TABLE khat_map_seasons ADD CONSTRAINT chk_khat_map_seasons_status
    CHECK (status IN ('planning', 'active', 'completed', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Episode candidate status must be in the known set
DO $$ BEGIN
  ALTER TABLE khat_map_episode_candidates ADD CONSTRAINT chk_khat_map_episode_candidates_status
    CHECK (status IN (
      'proposed', 'under_review', 'approved', 'rejected', 'postponed',
      'converted_to_preparation', 'converted_to_episode'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Episode candidate episode_type must be in the known set
DO $$ BEGIN
  ALTER TABLE khat_map_episode_candidates ADD CONSTRAINT chk_khat_map_episode_candidates_type
    CHECK (episode_type IN (
      'intellectual', 'social', 'psychological', 'personal_story', 'national',
      'historical', 'economic', 'controversial', 'inspirational',
      'mass_audience', 'signature_khat', 'invasion'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Guest candidate status must be in the known set
DO $$ BEGIN
  ALTER TABLE khat_map_guest_candidates ADD CONSTRAINT chk_khat_map_guest_candidates_status
    CHECK (status IN ('proposed', 'approved', 'rejected', 'converted_to_guest_candidate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Guest candidate gender must be in the known set (backfill-safe: default is 'unknown')
DO $$ BEGIN
  ALTER TABLE khat_map_guest_candidates ADD CONSTRAINT chk_khat_map_guest_candidates_gender
    CHECK (gender IN ('male', 'female', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Topic bank freshness must be in the known set
DO $$ BEGIN
  ALTER TABLE khat_map_topic_bank ADD CONSTRAINT chk_khat_map_topic_bank_freshness
    CHECK (freshness IN ('fresh', 'lightly_covered', 'recently_used', 'deeply_covered'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- At most one fingerprint row may be is_current = true
CREATE UNIQUE INDEX IF NOT EXISTS uq_khat_map_channel_fingerprint_current
  ON khat_map_channel_fingerprint (is_current) WHERE is_current = true;

-- Pattern uniqueness — same pattern_type + pattern_text should not duplicate
CREATE UNIQUE INDEX IF NOT EXISTS uq_khat_map_rejected_patterns_type_text
  ON khat_map_rejected_patterns (pattern_type, pattern_text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_khat_map_accepted_patterns_type_text
  ON khat_map_accepted_patterns (pattern_type, pattern_text);

-- Topic bank: angle_code must be unique when set (enforces one row per
-- canonical angle, so invasion.prisoners can't drift into duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS uq_khat_map_topic_bank_angle_code
  ON khat_map_topic_bank (angle_code) WHERE angle_code IS NOT NULL;

-- Listing indexes (season dashboards hit these constantly)
CREATE INDEX IF NOT EXISTS idx_khat_map_episode_candidates_season
  ON khat_map_episode_candidates (season_id, status);
CREATE INDEX IF NOT EXISTS idx_khat_map_guest_candidates_season
  ON khat_map_guest_candidates (season_id, status);
CREATE INDEX IF NOT EXISTS idx_khat_map_topic_bank_status_freshness
  ON khat_map_topic_bank (status, freshness);
CREATE INDEX IF NOT EXISTS idx_khat_map_user_feedback_target
  ON khat_map_user_feedback (target_type, target_id);

-- ─── Khat Map v2 — decisions / fingerprints / taste constraints ─────────────

-- Decision journal: kind + target controlled vocabularies
DO $$ BEGIN
  ALTER TABLE khat_map_season_decisions ADD CONSTRAINT chk_khat_map_season_decisions_kind
    CHECK (kind IN ('accept', 'reject', 'skip'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE khat_map_season_decisions ADD CONSTRAINT chk_khat_map_season_decisions_target
    CHECK (target IN ('pair', 'topic', 'guest'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fingerprint source must be in the known set
DO $$ BEGIN
  ALTER TABLE khat_map_topic_fingerprints ADD CONSTRAINT chk_khat_map_topic_fingerprints_source
    CHECK (source IN ('accepted', 'rejected', 'skipped', 'imported'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Taste profile scores must live in [0, 1]
DO $$ BEGIN
  ALTER TABLE khat_map_user_taste_profile ADD CONSTRAINT chk_khat_map_user_taste_profile_ranges
    CHECK (
      depth_score >= 0 AND depth_score <= 1
      AND controversy_tolerance >= 0 AND controversy_tolerance <= 1
      AND emotional_preference >= 0 AND emotional_preference <= 1
      AND kuwait_relevance_weight >= 0 AND kuwait_relevance_weight <= 1
      AND total_decisions >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- updated_at trigger for the taste profile (decisions + fingerprints are
-- append-only so no trigger needed on those)
DROP TRIGGER IF EXISTS trg_khat_map_user_taste_profile_updated_at ON khat_map_user_taste_profile;
CREATE TRIGGER trg_khat_map_user_taste_profile_updated_at
  BEFORE UPDATE ON khat_map_user_taste_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Hot-path indexes for the batch engine
CREATE INDEX IF NOT EXISTS idx_khat_map_season_decisions_season_active
  ON khat_map_season_decisions (season_id) WHERE undone_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_khat_map_season_decisions_season_created
  ON khat_map_season_decisions (season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_khat_map_topic_fingerprints_season_source
  ON khat_map_topic_fingerprints (season_id, source);

-- ─────────────────────────────────────────────────────────────────────
-- guest_discovery_links: one discovery candidate resolves to exactly one
-- guest. Historically this junction had no unique constraint (its siblings
-- guest_candidate_links / guest_application_links do), so re-promoting a
-- candidate created duplicate link rows. Dedup first (keep the newest row
-- per non-null candidate), then add the partial unique index. Both steps
-- are idempotent and safe to re-run on local or live.
DELETE FROM guest_discovery_links gdl
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY discovery_candidate_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM guest_discovery_links
  WHERE discovery_candidate_id IS NOT NULL
) dups
WHERE gdl.id = dups.id AND dups.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gdl_candidate
  ON guest_discovery_links (discovery_candidate_id)
  WHERE discovery_candidate_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Studio redesign (Goal 2) — episode knowledge-graph tables.
-- ADDITIVE + idempotent: multi-guest junction, semantic episode links,
-- and a topic taxonomy. Mirrors drizzle/migrations/0004_sturdy_slipstream.sql
-- so prod (db:migrate) and local (post-schema re-apply, not baselined) both
-- converge. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS episode_guests (
  id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  guest_id text NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'guest',
  appearance_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_guests_episode_guest ON episode_guests (episode_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_episode_guests_episode ON episode_guests (episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_guests_guest ON episode_guests (guest_id);

CREATE TABLE IF NOT EXISTS episode_relationships (
  id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  related_episode_id text NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related',
  score integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_rel ON episode_relationships (episode_id, related_episode_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_episode_rel_episode ON episode_relationships (episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_rel_related ON episode_relationships (related_episode_id);

CREATE TABLE IF NOT EXISTS topics (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topics_slug ON topics (slug);

CREATE TABLE IF NOT EXISTS episode_topics (
  id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_topics ON episode_topics (episode_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_episode_topics_episode ON episode_topics (episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_topics_topic ON episode_topics (topic_id);

-- Studio redesign (Goal 2) — public-facing synthesized guest knowledge.
-- Mirrors drizzle/migrations/0005_absurd_punisher.sql. Idempotent.
ALTER TABLE guest_identity_profiles ADD COLUMN IF NOT EXISTS public_knowledge jsonb;

-- Studio redesign (P6) — enrichment publish gate. Inert-first: default
-- 'published'. Mirrors drizzle/migrations/0006_*. Idempotent.
ALTER TABLE episode_enrichments ADD COLUMN IF NOT EXISTS publish_status text DEFAULT 'published';
ALTER TABLE episode_enrichments ADD COLUMN IF NOT EXISTS scheduled_for timestamp with time zone;

-- Season topic generator redesign — the 15-category balance axis. The precise
-- category lives here; topic_domain stays as a legacy compat shadow. Nullable;
-- legacy rows keep it null. Modeled in lib/db/schema/khat-map.ts. Idempotent.
ALTER TABLE khat_map_episode_candidates ADD COLUMN IF NOT EXISTS topic_category text;

-- Audience-first redesign — admin-internal "why it lands in the GCC" note shown
-- on the wizard card (never on public content). Modeled in schema. Idempotent.
ALTER TABLE khat_map_episode_candidates ADD COLUMN IF NOT EXISTS regional_note text;

-- Partnership redesign — richer application fields powering the AI evaluation
-- engine. Modeled in lib/db/schema/system.ts. Nullable; idempotent.
ALTER TABLE sponsorship_leads ADD COLUMN IF NOT EXISTS company_website text;
ALTER TABLE sponsorship_leads ADD COLUMN IF NOT EXISTS brand_values text;
ALTER TABLE sponsorship_leads ADD COLUMN IF NOT EXISTS campaign_goals text;
ALTER TABLE sponsorship_leads ADD COLUMN IF NOT EXISTS expectations text;
ALTER TABLE sponsorship_leads ADD COLUMN IF NOT EXISTS previous_partnerships text;

-- Partnership AI engine (Phase 2) — live research + full company evaluation
-- + structure/episode/pricing recommendations on the analysis row. Idempotent.
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS research_summary text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS research_sources jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS reputation text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS products_summary text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS market_position text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS audience_summary text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS fit_verdict text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS fit_reasoning text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS recommended_structure text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS recommended_episodes integer;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS pricing_strategy text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS recommended_action text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS action_rationale text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS researched_at timestamptz;
ALTER TABLE sponsorship_proposals ADD COLUMN IF NOT EXISTS reply_email text;

-- Per-company offer pages — editable proposal published at a secret link
-- (/offer/<token>) and sent to a specific company. Modeled in
-- lib/db/schema/sponsorship-ai.ts. Idempotent.
CREATE TABLE IF NOT EXISTS partnership_offers (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  title text,
  intro text,
  body text,
  packages jsonb DEFAULT '[]'::jsonb,
  validity_note text,
  contact_email text,
  password_hash text,
  published boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_offers_lead ON partnership_offers(lead_id);

-- ─── Partnership CRM (relationship spine) ───────────────────────────────────
-- Modeled in lib/db/schema/partnership-crm.ts + Director columns on the
-- existing analysis table. Idempotent; safe to re-run.
ALTER TABLE sponsorship_leads ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS win_probability integer;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS strategy_summary text;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS talking_points jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS likely_objections jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sponsorship_analysis ADD COLUMN IF NOT EXISTS negotiation_tactics jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS partner_activities (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  summary text NOT NULL,
  actor text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_activities_lead ON partner_activities(lead_id, created_at);

CREATE TABLE IF NOT EXISTS partner_notes (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  body text NOT NULL,
  author text,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_notes_lead ON partner_notes(lead_id);

CREATE TABLE IF NOT EXISTS partner_tasks (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  type text NOT NULL DEFAULT 'follow_up',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  created_by text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_tasks_lead ON partner_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_partner_tasks_due ON partner_tasks(status, due_at);

CREATE TABLE IF NOT EXISTS partner_meetings (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'call',
  scheduled_at timestamptz,
  duration_minutes integer,
  attendees text,
  agenda text,
  notes text,
  outcome text,
  status text NOT NULL DEFAULT 'scheduled',
  created_by text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_meetings_lead ON partner_meetings(lead_id);

CREATE TABLE IF NOT EXISTS partner_emails (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'outbound',
  to_email text,
  from_email text,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  created_by text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_emails_lead ON partner_emails(lead_id);

CREATE TABLE IF NOT EXISTS partner_contracts (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  title text,
  status text NOT NULL DEFAULT 'draft',
  value integer,
  currency text NOT NULL DEFAULT 'KWD',
  start_date timestamptz,
  end_date timestamptz,
  terms text,
  document_url text,
  signed_at timestamptz,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_contracts_lead ON partner_contracts(lead_id);

CREATE TABLE IF NOT EXISTS partner_campaigns (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES sponsorship_leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  episode_refs jsonb DEFAULT '[]'::jsonb,
  deliverables jsonb DEFAULT '[]'::jsonb,
  start_date timestamptz,
  end_date timestamptz,
  metrics jsonb DEFAULT '{}'::jsonb,
  roi_notes text,
  performance_summary text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_campaigns_lead ON partner_campaigns(lead_id);
