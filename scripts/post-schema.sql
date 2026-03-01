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

-- Topics
DROP TRIGGER IF EXISTS trg_topics_config_updated_at ON topics_config;
CREATE TRIGGER trg_topics_config_updated_at
  BEFORE UPDATE ON topics_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Community
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hibr_articles_updated_at ON hibr_articles;
CREATE TRIGGER trg_hibr_articles_updated_at
  BEFORE UPDATE ON hibr_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hibr_drafts_updated_at ON hibr_drafts;
CREATE TRIGGER trg_hibr_drafts_updated_at
  BEFORE UPDATE ON hibr_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Studio
DROP TRIGGER IF EXISTS trg_studio_sessions_updated_at ON studio_sessions;
CREATE TRIGGER trg_studio_sessions_updated_at
  BEFORE UPDATE ON studio_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_studio_transcripts_updated_at ON studio_transcripts;
CREATE TRIGGER trg_studio_transcripts_updated_at
  BEFORE UPDATE ON studio_transcripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_studio_ai_outputs_updated_at ON studio_ai_outputs;
CREATE TRIGGER trg_studio_ai_outputs_updated_at
  BEFORE UPDATE ON studio_ai_outputs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_studio_chapters_updated_at ON studio_chapters;
CREATE TRIGGER trg_studio_chapters_updated_at
  BEFORE UPDATE ON studio_chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_studio_clips_updated_at ON studio_clips;
CREATE TRIGGER trg_studio_clips_updated_at
  BEFORE UPDATE ON studio_clips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_studio_website_packages_updated_at ON studio_website_packages;
CREATE TRIGGER trg_studio_website_packages_updated_at
  BEFORE UPDATE ON studio_website_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_studio_analyzers_updated_at ON studio_analyzers;
CREATE TRIGGER trg_studio_analyzers_updated_at
  BEFORE UPDATE ON studio_analyzers
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

-- Profiles role constraint
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT chk_profiles_role
    CHECK (role IN ('admin', 'editor', 'moderator', 'user'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Episode visibility constraint
DO $$ BEGIN
  ALTER TABLE episode_visibility ADD CONSTRAINT chk_episode_visibility
    CHECK (visibility IN ('hidden', 'deleted'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Moderation status constraints
DO $$ BEGIN
  ALTER TABLE hibr_articles ADD CONSTRAINT chk_hibr_articles_moderation
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hibr_thoughts ADD CONSTRAINT chk_hibr_thoughts_moderation
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged'));
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
      hero_summary, full_summary, takeaways, topics, resources, timestamps,
      updated_at)
    VALUES (
      p_episode_id,
      p_enrichment->>'hero_summary',
      p_enrichment->>'full_summary',
      CASE WHEN p_enrichment ? 'takeaways' THEN p_enrichment->'takeaways' ELSE '[]'::jsonb END,
      CASE WHEN p_enrichment ? 'topics' THEN p_enrichment->'topics' ELSE '[]'::jsonb END,
      CASE WHEN p_enrichment ? 'resources' THEN p_enrichment->'resources' ELSE '[]'::jsonb END,
      CASE WHEN p_enrichment ? 'timestamps' THEN p_enrichment->'timestamps' ELSE '[]'::jsonb END,
      NOW()
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      hero_summary = COALESCE(NULLIF(p_enrichment->>'hero_summary', ''), episode_enrichments.hero_summary),
      full_summary = COALESCE(NULLIF(p_enrichment->>'full_summary', ''), episode_enrichments.full_summary),
      takeaways = CASE WHEN p_enrichment ? 'takeaways' THEN p_enrichment->'takeaways' ELSE episode_enrichments.takeaways END,
      topics = CASE WHEN p_enrichment ? 'topics' THEN p_enrichment->'topics' ELSE episode_enrichments.topics END,
      resources = CASE WHEN p_enrichment ? 'resources' THEN p_enrichment->'resources' ELSE episode_enrichments.resources END,
      timestamps = CASE WHEN p_enrichment ? 'timestamps' THEN p_enrichment->'timestamps' ELSE episode_enrichments.timestamps END,
      updated_at = NOW();
  END IF;

  -- Insert push log entry
  IF p_log IS NOT NULL THEN
    INSERT INTO studio_push_log (session_id, episode_id, episode_title, pushed_fields, pushed_at)
    VALUES (
      (p_log->>'session_id')::uuid,
      p_episode_id,
      p_log->>'episode_title',
      ARRAY(SELECT jsonb_array_elements_text(p_log->'pushed_fields')),
      (p_log->>'pushed_at')::timestamptz
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

-- Indexes for newsletter queries
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_campaign_id ON newsletter_deliveries (campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_subscriber_id ON newsletter_deliveries (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_links_campaign_id ON newsletter_links (campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_clicks_link_id ON newsletter_clicks (link_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_clicks_delivery_id ON newsletter_clicks (delivery_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status ON newsletter_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_sent_at ON newsletter_campaigns (sent_at);
