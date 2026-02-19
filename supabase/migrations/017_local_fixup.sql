-- 017: Fix-up migration for plain PostgreSQL (non-Supabase)
-- Creates tables that were missing because original migrations used
-- Supabase-specific features (uuid_generate_v4, RLS, auth schema).
-- Uses gen_random_uuid() which is built into PostgreSQL 13+.

-- ============================================================
-- Studio Sessions (from 002)
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

-- ============================================================
-- Home Quotes (from 009) — episode_id references episodes(id) as TEXT
-- ============================================================
CREATE TABLE IF NOT EXISTS home_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
-- Daily Reflections (from 009) — episode_id as TEXT
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- ============================================================
-- Trigger for updated_at (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers (use DROP IF EXISTS + CREATE to be idempotent)
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
