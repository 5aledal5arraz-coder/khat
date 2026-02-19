-- 018: Complete missing tables for live DO server
-- Adds tables from migrations 009, 011, 012, 013, 014, 017
-- Uses gen_random_uuid() and TEXT IDs (no Supabase-specific features)

-- ============================================================
-- Emotional Paths (from 009) — TEXT columns for ID compatibility
-- ============================================================
CREATE TABLE IF NOT EXISTS emotional_paths (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Heart',
  color TEXT NOT NULL DEFAULT '#6366f1',
  episode_ids TEXT[] DEFAULT '{}',
  quote_ids TEXT[] DEFAULT '{}',
  "order" INTEGER NOT NULL DEFAULT 0
);

-- Seed default paths
INSERT INTO emotional_paths (slug, title, subtitle, icon, color, "order") VALUES
  ('understanding-people', 'فهم الناس', 'حلقات عن العلاقات والتواصل والتعاطف', 'Users', '#6366f1', 1),
  ('motivation-work', 'الدافع والعمل', 'حلقات عن الطموح والإنجاز والمهنة', 'Rocket', '#f59e0b', 2),
  ('faith-meaning', 'الإيمان والمعنى', 'حلقات عن الروحانيات والهدف والقيم', 'Heart', '#10b981', 3),
  ('self-awareness', 'وعي الذات', 'حلقات عن النمو الشخصي والتأمل الذاتي', 'Eye', '#8b5cf6', 4)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Home Quotes (from 009) — TEXT id and episode_id
-- ============================================================
CREATE TABLE IF NOT EXISTS home_quotes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  text TEXT NOT NULL,
  attribution TEXT NOT NULL,
  episode_id TEXT,
  episode_slug TEXT,
  episode_title TEXT,
  theme TEXT,
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_quotes_status ON home_quotes(status);
CREATE INDEX IF NOT EXISTS idx_home_quotes_scheduled_date ON home_quotes(scheduled_date);

-- ============================================================
-- Daily Reflections (from 009) — TEXT id and episode_id
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reflections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date DATE NOT NULL,
  short_quote TEXT NOT NULL,
  reflection TEXT NOT NULL,
  thinking_question TEXT NOT NULL,
  attribution TEXT,
  episode_id TEXT,
  episode_slug TEXT,
  episode_title TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_reflections_date ON daily_reflections(date);
CREATE INDEX IF NOT EXISTS idx_daily_reflections_status ON daily_reflections(status);

-- Triggers for updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_home_quotes_updated_at') THEN
    CREATE TRIGGER update_home_quotes_updated_at
      BEFORE UPDATE ON home_quotes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_daily_reflections_updated_at') THEN
    CREATE TRIGGER update_daily_reflections_updated_at
      BEFORE UPDATE ON daily_reflections
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- Teaser Questions (from 011)
-- ============================================================
CREATE TABLE IF NOT EXISTS teaser_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teaser_id text NOT NULL,
  display_name text,
  question_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teaser_questions_teaser ON teaser_questions(teaser_id);
CREATE INDEX IF NOT EXISTS idx_teaser_questions_status ON teaser_questions(teaser_id, status);
CREATE INDEX IF NOT EXISTS idx_teaser_questions_created ON teaser_questions(created_at DESC);

-- ============================================================
-- Visitor Events (from 012 + 014)
-- ============================================================
CREATE TABLE IF NOT EXISTS visitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'episode_view', 'episode_watch',
    'watch_25', 'watch_50', 'watch_90',
    'quote_open', 'guest_open',
    'path_click', 'search_used', 'episode_saved',
    'save_item', 'quote_view', 'search'
  )),
  target_id text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ve_visitor ON visitor_events(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ve_type ON visitor_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ve_dedup ON visitor_events(visitor_id, event_type, target_id, created_at DESC);

-- ============================================================
-- Visitor Profiles (from 014)
-- ============================================================
CREATE TABLE IF NOT EXISTS visitor_profiles (
  visitor_id uuid PRIMARY KEY,
  interest_vector jsonb NOT NULL DEFAULT '{}',
  last_updated timestamptz DEFAULT now(),
  event_count_at_build int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vp_updated ON visitor_profiles(last_updated);

-- ============================================================
-- Episode Versions (from 013)
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  change_type text NOT NULL CHECK (change_type IN (
    'title_override','description_override','enrichment',
    'quotes','section_assignment','visibility',
    'guest_assignment','youtube_pack','conversation','full_snapshot'
  )),
  change_summary text,
  snapshot jsonb NOT NULL,
  created_by text DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ev_episode ON episode_versions(episode_id, created_at DESC);

-- ============================================================
-- Studio Sessions (from 002 + 007)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  youtube_url TEXT,
  video_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  video_title TEXT,
  channel_title TEXT,
  published_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  raw_youtube_response JSONB,
  source TEXT NOT NULL DEFAULT 'youtube',
  audio_filename TEXT,
  audio_file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_sessions_video_id ON studio_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_status ON studio_sessions(status);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_created_at ON studio_sessions(created_at DESC);

-- ============================================================
-- Studio Transcripts (from 003 + 010)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL DEFAULT 'youtube_captions',
  language TEXT NOT NULL DEFAULT 'ar',
  transcript_raw TEXT NOT NULL DEFAULT '',
  transcript_clean TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  error_message TEXT,
  transcript_article TEXT,
  summary JSONB,
  quotes_extracted JSONB,
  processing_status TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_transcripts_session_id ON studio_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_transcripts_status ON studio_transcripts(status);

-- ============================================================
-- Studio AI Outputs (from 004)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_ai_outputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'generating',
  title_best TEXT NOT NULL DEFAULT '',
  title_alternatives JSONB NOT NULL DEFAULT '[]',
  thumbnail_text_options JSONB NOT NULL DEFAULT '[]',
  youtube_description TEXT NOT NULL DEFAULT '',
  seo_keywords JSONB NOT NULL DEFAULT '[]',
  hashtags JSONB NOT NULL DEFAULT '[]',
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_ai_outputs_session_id ON studio_ai_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_ai_outputs_status ON studio_ai_outputs(status);

-- ============================================================
-- Studio Chapters (from 005)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_chapters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  chapters JSONB NOT NULL DEFAULT '[]',
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_chapters_session_id ON studio_chapters(session_id);

-- ============================================================
-- Studio Clips (from 005)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_clips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  clips JSONB NOT NULL DEFAULT '[]',
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_clips_session_id ON studio_clips(session_id);

-- ============================================================
-- Studio Website Packages (from 006)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_website_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  hero_summary TEXT,
  full_summary TEXT,
  takeaways TEXT[] NOT NULL DEFAULT '{}',
  quotes JSONB NOT NULL DEFAULT '[]',
  topics TEXT[] NOT NULL DEFAULT '{}',
  resources JSONB NOT NULL DEFAULT '[]',
  timestamps JSONB NOT NULL DEFAULT '[]',
  linked_episode_id TEXT,
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_website_packages_session_id ON studio_website_packages(session_id);

-- ============================================================
-- Studio Analyzers (from 008)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_analyzers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  data JSONB,
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_analyzers_session_id ON studio_analyzers(session_id);
