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
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guest applications table
CREATE TABLE IF NOT EXISTS guest_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT,
  links TEXT,
  bio TEXT,
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
