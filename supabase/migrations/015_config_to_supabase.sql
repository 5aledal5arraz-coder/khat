-- Migration 015: Config JSON files to Supabase tables
-- Migrates 16 JSON config files into proper database tables.
-- Tables home_quotes, emotional_paths, daily_reflections already exist (migration 009).
-- The update_updated_at_column() trigger function already exists (migration 009).

-- ============================================================
-- 1. episode_enrichments
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_enrichments (
  episode_id TEXT PRIMARY KEY,
  hero_summary TEXT,
  full_summary TEXT,
  takeaways JSONB DEFAULT '[]',
  topics JSONB DEFAULT '[]',
  resources JSONB DEFAULT '[]',
  timestamps JSONB DEFAULT '[]',
  why_this_conversation TEXT,
  before_you_watch JSONB,
  conversation_map JSONB,
  central_question TEXT,
  exclusive_clip JSONB,
  unsaid_reflections JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode enrichments"
  ON episode_enrichments FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode enrichments"
  ON episode_enrichments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_enrichments_updated_at
  BEFORE UPDATE ON episode_enrichments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. episode_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_overrides (
  episode_id TEXT PRIMARY KEY,
  original_title TEXT NOT NULL DEFAULT '',
  custom_title TEXT NOT NULL DEFAULT '',
  custom_description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode overrides"
  ON episode_overrides FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode overrides"
  ON episode_overrides FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_overrides_updated_at
  BEFORE UPDATE ON episode_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. episode_quotes_config
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_quotes_config (
  episode_id TEXT PRIMARY KEY,
  episode_title TEXT NOT NULL DEFAULT '',
  quotes JSONB NOT NULL DEFAULT '[]',
  transcript TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  generated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_quotes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published episode quotes config"
  ON episode_quotes_config FOR SELECT USING (status = 'published');

CREATE POLICY "Admins can manage episode quotes config"
  ON episode_quotes_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_quotes_config_updated_at
  BEFORE UPDATE ON episode_quotes_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. episode_sections
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_sections (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode sections"
  ON episode_sections FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode sections"
  ON episode_sections FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_sections_updated_at
  BEFORE UPDATE ON episode_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. episode_section_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_section_assignments (
  episode_id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES episode_sections(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_section_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode section assignments"
  ON episode_section_assignments FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode section assignments"
  ON episode_section_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_section_assignments_updated_at
  BEFORE UPDATE ON episode_section_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. episode_visibility
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_visibility (
  episode_id TEXT PRIMARY KEY,
  visibility TEXT NOT NULL CHECK (visibility IN ('hidden', 'deleted')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode visibility"
  ON episode_visibility FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode visibility"
  ON episode_visibility FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_visibility_updated_at
  BEFORE UPDATE ON episode_visibility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. episode_guest_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_guest_assignments (
  episode_id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_guest_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode guest assignments"
  ON episode_guest_assignments FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode guest assignments"
  ON episode_guest_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_guest_assignments_updated_at
  BEFORE UPDATE ON episode_guest_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. ad_slots
-- ============================================================
CREATE TABLE IF NOT EXISTS ad_slots (
  id TEXT PRIMARY KEY,
  position TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  schedule JSONB DEFAULT '{}',
  type TEXT NOT NULL DEFAULT 'banner' CHECK (type IN ('sponsored_card', 'banner')),
  sponsored_data JSONB DEFAULT '{}',
  banner_data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ad_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read enabled ad slots"
  ON ad_slots FOR SELECT USING (enabled = true);

CREATE POLICY "Admins can manage ad slots"
  ON ad_slots FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_ad_slots_updated_at
  BEFORE UPDATE ON ad_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. site_settings (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY DEFAULT 'main',
  metadata JSONB NOT NULL DEFAULT '{}',
  social_links JSONB NOT NULL DEFAULT '[]',
  seo JSONB NOT NULL DEFAULT '{}',
  feature_flags JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site settings"
  ON site_settings FOR SELECT USING (true);

CREATE POLICY "Admins can manage site settings"
  ON site_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 10. static_content (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS static_content (
  key TEXT PRIMARY KEY DEFAULT 'about',
  content JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE static_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read static content"
  ON static_content FOR SELECT USING (true);

CREATE POLICY "Admins can manage static content"
  ON static_content FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_static_content_updated_at
  BEFORE UPDATE ON static_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 11. teasers
-- ============================================================
CREATE TABLE IF NOT EXISTS teasers (
  id TEXT PRIMARY KEY,
  guest_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'اسأل الضيف',
  prompt TEXT NOT NULL DEFAULT 'اكتب سؤالك للضيف',
  video_filename TEXT NOT NULL,
  poster_image TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  publish_at TIMESTAMPTZ,
  expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE teasers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active teasers"
  ON teasers FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage teasers"
  ON teasers FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_teasers_updated_at
  BEFORE UPDATE ON teasers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 12. topics_config
-- ============================================================
CREATE TABLE IF NOT EXISTS topics_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE topics_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read topics config"
  ON topics_config FOR SELECT USING (true);

CREATE POLICY "Admins can manage topics config"
  ON topics_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_topics_config_updated_at
  BEFORE UPDATE ON topics_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 13. platform_analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_analytics (
  platform TEXT PRIMARY KEY,
  followers INTEGER NOT NULL DEFAULT 0,
  posts INTEGER NOT NULL DEFAULT 0,
  engagement TEXT NOT NULL DEFAULT '0%',
  url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read platform analytics"
  ON platform_analytics FOR SELECT USING (true);

CREATE POLICY "Admins can manage platform analytics"
  ON platform_analytics FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_platform_analytics_updated_at
  BEFORE UPDATE ON platform_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default platform rows
INSERT INTO platform_analytics (platform) VALUES
  ('youtube'), ('x'), ('tiktok'), ('instagram')
ON CONFLICT (platform) DO NOTHING;

-- ============================================================
-- 14. studio_push_log
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  episode_title TEXT NOT NULL DEFAULT '',
  pushed_fields JSONB NOT NULL DEFAULT '[]',
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_push_log_pushed_at ON studio_push_log(pushed_at DESC);

ALTER TABLE studio_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read studio push log"
  ON studio_push_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage studio push log"
  ON studio_push_log FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- 15. episode_knowledge + episode_knowledge_meta
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_knowledge (
  episode_id TEXT PRIMARY KEY,
  analysis JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode knowledge"
  ON episode_knowledge FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode knowledge"
  ON episode_knowledge FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_knowledge_updated_at
  BEFORE UPDATE ON episode_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS episode_knowledge_meta (
  key TEXT PRIMARY KEY DEFAULT 'meta',
  topic_taxonomy JSONB NOT NULL DEFAULT '[]',
  relationships JSONB NOT NULL DEFAULT '{}',
  analyzed_at TIMESTAMPTZ,
  season_1_count INTEGER NOT NULL DEFAULT 0,
  season_2_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE episode_knowledge_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read episode knowledge meta"
  ON episode_knowledge_meta FOR SELECT USING (true);

CREATE POLICY "Admins can manage episode knowledge meta"
  ON episode_knowledge_meta FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER update_episode_knowledge_meta_updated_at
  BEFORE UPDATE ON episode_knowledge_meta
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RPC: Atomic studio push (wraps 4 upserts in a transaction)
-- ============================================================
CREATE OR REPLACE FUNCTION push_episode_data(
  p_episode_id TEXT,
  p_override JSONB DEFAULT NULL,
  p_quotes JSONB DEFAULT NULL,
  p_enrichment JSONB DEFAULT NULL,
  p_push_log JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Episode override
  IF p_override IS NOT NULL THEN
    INSERT INTO episode_overrides (episode_id, original_title, custom_title, custom_description)
    VALUES (
      p_episode_id,
      COALESCE(p_override->>'original_title', ''),
      COALESCE(p_override->>'custom_title', ''),
      p_override->>'custom_description'
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      original_title = COALESCE(NULLIF(EXCLUDED.original_title, ''), episode_overrides.original_title),
      custom_title = COALESCE(NULLIF(EXCLUDED.custom_title, ''), episode_overrides.custom_title),
      custom_description = COALESCE(EXCLUDED.custom_description, episode_overrides.custom_description);
  END IF;

  -- 2. Episode quotes config
  IF p_quotes IS NOT NULL THEN
    INSERT INTO episode_quotes_config (episode_id, episode_title, quotes, status, generated_at, published_at)
    VALUES (
      p_episode_id,
      COALESCE(p_quotes->>'episode_title', ''),
      COALESCE(p_quotes->'quotes', '[]'::jsonb),
      COALESCE(p_quotes->>'status', 'published'),
      COALESCE((p_quotes->>'generated_at')::timestamptz, now()),
      COALESCE((p_quotes->>'published_at')::timestamptz, now())
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      episode_title = EXCLUDED.episode_title,
      quotes = EXCLUDED.quotes,
      status = EXCLUDED.status,
      generated_at = EXCLUDED.generated_at,
      published_at = EXCLUDED.published_at;
  END IF;

  -- 3. Episode enrichment
  IF p_enrichment IS NOT NULL THEN
    INSERT INTO episode_enrichments (
      episode_id, hero_summary, full_summary, takeaways, topics,
      resources, timestamps, why_this_conversation, before_you_watch,
      conversation_map, central_question, exclusive_clip, unsaid_reflections
    )
    VALUES (
      p_episode_id,
      p_enrichment->>'hero_summary',
      p_enrichment->>'full_summary',
      COALESCE(p_enrichment->'takeaways', '[]'::jsonb),
      COALESCE(p_enrichment->'topics', '[]'::jsonb),
      COALESCE(p_enrichment->'resources', '[]'::jsonb),
      COALESCE(p_enrichment->'timestamps', '[]'::jsonb),
      p_enrichment->>'why_this_conversation',
      p_enrichment->'before_you_watch',
      p_enrichment->'conversation_map',
      p_enrichment->>'central_question',
      p_enrichment->'exclusive_clip',
      COALESCE(p_enrichment->'unsaid_reflections', '[]'::jsonb)
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      hero_summary = COALESCE(EXCLUDED.hero_summary, episode_enrichments.hero_summary),
      full_summary = COALESCE(EXCLUDED.full_summary, episode_enrichments.full_summary),
      takeaways = CASE WHEN EXCLUDED.takeaways = '[]'::jsonb THEN episode_enrichments.takeaways ELSE EXCLUDED.takeaways END,
      topics = CASE WHEN EXCLUDED.topics = '[]'::jsonb THEN episode_enrichments.topics ELSE EXCLUDED.topics END,
      resources = CASE WHEN EXCLUDED.resources = '[]'::jsonb THEN episode_enrichments.resources ELSE EXCLUDED.resources END,
      timestamps = CASE WHEN EXCLUDED.timestamps = '[]'::jsonb THEN episode_enrichments.timestamps ELSE EXCLUDED.timestamps END,
      why_this_conversation = COALESCE(EXCLUDED.why_this_conversation, episode_enrichments.why_this_conversation),
      before_you_watch = COALESCE(EXCLUDED.before_you_watch, episode_enrichments.before_you_watch),
      conversation_map = COALESCE(EXCLUDED.conversation_map, episode_enrichments.conversation_map),
      central_question = COALESCE(EXCLUDED.central_question, episode_enrichments.central_question),
      exclusive_clip = COALESCE(EXCLUDED.exclusive_clip, episode_enrichments.exclusive_clip),
      unsaid_reflections = CASE WHEN EXCLUDED.unsaid_reflections = '[]'::jsonb THEN episode_enrichments.unsaid_reflections ELSE EXCLUDED.unsaid_reflections END;
  END IF;

  -- 4. Push log entry
  IF p_push_log IS NOT NULL THEN
    INSERT INTO studio_push_log (session_id, episode_id, episode_title, pushed_fields, pushed_at)
    VALUES (
      COALESCE(p_push_log->>'session_id', ''),
      p_episode_id,
      COALESCE(p_push_log->>'episode_title', ''),
      COALESCE(p_push_log->'pushed_fields', '[]'::jsonb),
      COALESCE((p_push_log->>'pushed_at')::timestamptz, now())
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
