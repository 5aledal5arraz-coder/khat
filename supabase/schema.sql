-- KHAT Podcast Website Database Schema
-- Run this in your Supabase SQL Editor to create the tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Topics table (for filtering/categorization)
CREATE TABLE IF NOT EXISTS topics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guests table
CREATE TABLE IF NOT EXISTS guests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  bio TEXT,
  photo_url TEXT,
  external_links JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Episodes table
CREATE TABLE IF NOT EXISTS episodes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT,
  key_takeaways TEXT[],
  youtube_url TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  release_date DATE NOT NULL,
  season INTEGER,
  mood TEXT,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Episode-Topic junction table
CREATE TABLE IF NOT EXISTS episode_topics (
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (episode_id, topic_id)
);

-- Timestamps (chapters) table
CREATE TABLE IF NOT EXISTS timestamps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE NOT NULL,
  time_seconds INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT
);

-- Quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE NOT NULL,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  theme TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resources table (books/links mentioned)
CREATE TABLE IF NOT EXISTS resources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT -- 'book', 'article', 'link', etc.
);

-- Newsletter subscribers table
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sponsorship leads table
CREATE TABLE IF NOT EXISTS sponsorship_leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  -- Company Info
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  -- Campaign Details
  collaboration_types JSONB NOT NULL DEFAULT '[]',
  collaboration_other TEXT,
  -- Objectives
  main_goal TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  preferred_timeline TEXT,
  -- Budget
  budget_range TEXT NOT NULL,
  -- Additional
  additional_info TEXT,
  -- Meta
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guest applications table
CREATE TABLE IF NOT EXISTS guest_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  -- Step 1: Basic Info
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL,
  can_travel_to_kuwait TEXT,
  -- Step 2: Your Story
  story_idea TEXT NOT NULL,
  beyond_job_title TEXT NOT NULL,
  life_changing_moment TEXT NOT NULL,
  hope_people_understand TEXT NOT NULL,
  unasked_question TEXT NOT NULL,
  why_khat TEXT NOT NULL,
  -- Step 3: Recording & Appearance
  previous_podcast BOOLEAN NOT NULL DEFAULT false,
  previous_podcast_info TEXT,
  prefer_dialogue_or_story TEXT NOT NULL,
  topics_to_avoid TEXT,
  filming_concern TEXT NOT NULL DEFAULT 'no',
  agrees_to_publish BOOLEAN NOT NULL DEFAULT true,
  social_links TEXT,
  -- Meta
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_episodes_release_date ON episodes(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_guest_id ON episodes(guest_id);
CREATE INDEX IF NOT EXISTS idx_episodes_slug ON episodes(slug);
CREATE INDEX IF NOT EXISTS idx_guests_slug ON guests(slug);
CREATE INDEX IF NOT EXISTS idx_topics_slug ON topics(slug);
CREATE INDEX IF NOT EXISTS idx_timestamps_episode_id ON timestamps(episode_id);
CREATE INDEX IF NOT EXISTS idx_quotes_episode_id ON quotes(episode_id);
CREATE INDEX IF NOT EXISTS idx_quotes_guest_id ON quotes(guest_id);
CREATE INDEX IF NOT EXISTS idx_resources_episode_id ON resources(episode_id);

-- Enable Row Level Security (RLS)
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE timestamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsorship_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_applications ENABLE ROW LEVEL SECURITY;

-- Public read policies for content tables
CREATE POLICY "Topics are viewable by everyone" ON topics FOR SELECT USING (true);
CREATE POLICY "Guests are viewable by everyone" ON guests FOR SELECT USING (true);
CREATE POLICY "Episodes are viewable by everyone" ON episodes FOR SELECT USING (true);
CREATE POLICY "Episode topics are viewable by everyone" ON episode_topics FOR SELECT USING (true);
CREATE POLICY "Timestamps are viewable by everyone" ON timestamps FOR SELECT USING (true);
CREATE POLICY "Quotes are viewable by everyone" ON quotes FOR SELECT USING (true);
CREATE POLICY "Resources are viewable by everyone" ON resources FOR SELECT USING (true);

-- Insert policies for form submissions (anonymous users can insert)
CREATE POLICY "Anyone can subscribe to newsletter" ON newsletter_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can submit sponsorship inquiry" ON sponsorship_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can submit guest application" ON guest_applications FOR INSERT WITH CHECK (true);

-- Add moderation_reason column to Hibr content tables (for AI moderation)
ALTER TABLE IF EXISTS hibr_articles ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE IF EXISTS hibr_thoughts ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE IF EXISTS hibr_comments ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE IF EXISTS hibr_replies ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- Studio sessions table (YouTube episode analysis tool)
CREATE TABLE IF NOT EXISTS studio_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  youtube_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  video_title TEXT,
  channel_title TEXT,
  published_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  raw_youtube_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_sessions_video_id ON studio_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_status ON studio_sessions(status);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_created_at ON studio_sessions(created_at DESC);

ALTER TABLE studio_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio sessions are viewable by everyone" ON studio_sessions FOR SELECT USING (true);
CREATE POLICY "Studio sessions can be inserted by everyone" ON studio_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio sessions can be updated by everyone" ON studio_sessions FOR UPDATE USING (true);
CREATE POLICY "Studio sessions can be deleted by everyone" ON studio_sessions FOR DELETE USING (true);

-- Studio transcripts table (stores fetched/uploaded transcripts for each session)
CREATE TABLE IF NOT EXISTS studio_transcripts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL DEFAULT 'youtube_captions',
  language TEXT NOT NULL DEFAULT 'ar',
  transcript_raw TEXT NOT NULL DEFAULT '',
  transcript_clean TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_transcripts_session_id ON studio_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_transcripts_status ON studio_transcripts(status);

ALTER TABLE studio_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio transcripts are viewable by everyone" ON studio_transcripts FOR SELECT USING (true);
CREATE POLICY "Studio transcripts can be inserted by everyone" ON studio_transcripts FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio transcripts can be updated by everyone" ON studio_transcripts FOR UPDATE USING (true);
CREATE POLICY "Studio transcripts can be deleted by everyone" ON studio_transcripts FOR DELETE USING (true);

-- Studio AI outputs table (stores generated AI content for each session)
CREATE TABLE IF NOT EXISTS studio_ai_outputs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
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

ALTER TABLE studio_ai_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio AI outputs are viewable by everyone" ON studio_ai_outputs FOR SELECT USING (true);
CREATE POLICY "Studio AI outputs can be inserted by everyone" ON studio_ai_outputs FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio AI outputs can be updated by everyone" ON studio_ai_outputs FOR UPDATE USING (true);
CREATE POLICY "Studio AI outputs can be deleted by everyone" ON studio_ai_outputs FOR DELETE USING (true);

-- Studio chapters table (AI-generated YouTube chapters per session)
CREATE TABLE IF NOT EXISTS studio_chapters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  chapters JSONB NOT NULL DEFAULT '[]',
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_chapters_session_id ON studio_chapters(session_id);

ALTER TABLE studio_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio chapters are viewable by everyone" ON studio_chapters FOR SELECT USING (true);
CREATE POLICY "Studio chapters can be inserted by everyone" ON studio_chapters FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio chapters can be updated by everyone" ON studio_chapters FOR UPDATE USING (true);
CREATE POLICY "Studio chapters can be deleted by everyone" ON studio_chapters FOR DELETE USING (true);

-- Studio clips table (AI-generated viral clip suggestions per session)
CREATE TABLE IF NOT EXISTS studio_clips (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES studio_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  clips JSONB NOT NULL DEFAULT '[]',
  raw_openai_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_clips_session_id ON studio_clips(session_id);

ALTER TABLE studio_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio clips are viewable by everyone" ON studio_clips FOR SELECT USING (true);
CREATE POLICY "Studio clips can be inserted by everyone" ON studio_clips FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio clips can be updated by everyone" ON studio_clips FOR UPDATE USING (true);
CREATE POLICY "Studio clips can be deleted by everyone" ON studio_clips FOR DELETE USING (true);

-- Studio Website Packages table
CREATE TABLE IF NOT EXISTS studio_website_packages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
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

ALTER TABLE studio_website_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio website packages are viewable by everyone" ON studio_website_packages FOR SELECT USING (true);
CREATE POLICY "Studio website packages can be inserted by everyone" ON studio_website_packages FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio website packages can be updated by everyone" ON studio_website_packages FOR UPDATE USING (true);
CREATE POLICY "Studio website packages can be deleted by everyone" ON studio_website_packages FOR DELETE USING (true);

-- Sample data for testing (optional - comment out in production)
/*
-- Insert sample topics
INSERT INTO topics (name, slug) VALUES
  ('العلاقات', 'relationships'),
  ('تطوير الذات', 'self-growth'),
  ('المعنى والهدف', 'meaning'),
  ('الصحة النفسية', 'mental-health'),
  ('العمل والمهنة', 'career'),
  ('الثقافة', 'culture');

-- Insert sample guest
INSERT INTO guests (name, slug, bio, external_links) VALUES
  ('أحمد محمد', 'ahmed-mohamed', 'كاتب ومتحدث في مجال تطوير الذات', '{"twitter": "https://twitter.com/ahmed", "linkedin": "https://linkedin.com/in/ahmed"}');

-- Insert sample episode
INSERT INTO episodes (title, slug, summary, youtube_url, duration_minutes, release_date, season, guest_id)
SELECT
  'رحلة اكتشاف الذات',
  'discovering-self',
  'حوار عميق عن كيفية اكتشاف الذات والعيش بشكل أصيل',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  75,
  '2024-01-15',
  1,
  id
FROM guests WHERE slug = 'ahmed-mohamed';
*/
