-- 016: Core content tables (originally created in Supabase dashboard)
-- These tables were never in a migration file. Now needed for DO PostgreSQL.

-- Topics
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guests
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  bio TEXT,
  photo_url TEXT,
  external_links JSONB,
  testimonial TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Episodes
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  summary TEXT,
  key_takeaways JSONB,
  youtube_url TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  release_date DATE NOT NULL,
  episode_number INTEGER,
  season INTEGER,
  mood TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'published',
  featured BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  guest_id TEXT REFERENCES guests(id) ON DELETE SET NULL,
  guest_testimonial TEXT,
  guest_video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Episode ↔ Topic junction
CREATE TABLE IF NOT EXISTS episode_topics (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (episode_id, topic_id)
);

-- Timestamps (chapters within an episode)
CREATE TABLE IF NOT EXISTS timestamps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  time_seconds INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT
);

-- Quotes
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  guest_id TEXT REFERENCES guests(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  theme TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resources (links mentioned in episodes)
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT
);

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sponsorship leads
CREATE TABLE IF NOT EXISTS sponsorship_leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  collaboration_types TEXT[] DEFAULT '{}',
  collaboration_other TEXT,
  main_goal TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  preferred_timeline TEXT,
  budget_range TEXT NOT NULL,
  additional_info TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guest applications
CREATE TABLE IF NOT EXISTS guest_applications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL,
  can_travel_to_kuwait TEXT,
  story_idea TEXT NOT NULL,
  beyond_job_title TEXT NOT NULL,
  life_changing_moment TEXT NOT NULL,
  hope_people_understand TEXT NOT NULL,
  unasked_question TEXT NOT NULL,
  why_khat TEXT NOT NULL,
  previous_podcast BOOLEAN DEFAULT false,
  previous_podcast_info TEXT,
  prefer_dialogue_or_story TEXT NOT NULL,
  topics_to_avoid TEXT,
  filming_concern TEXT NOT NULL,
  agrees_to_publish BOOLEAN NOT NULL DEFAULT true,
  social_links TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_episodes_slug ON episodes(slug);
CREATE INDEX IF NOT EXISTS idx_episodes_release_date ON episodes(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_guest_id ON episodes(guest_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season);
CREATE INDEX IF NOT EXISTS idx_guests_slug ON guests(slug);
CREATE INDEX IF NOT EXISTS idx_topics_slug ON topics(slug);
CREATE INDEX IF NOT EXISTS idx_episode_topics_episode ON episode_topics(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_topics_topic ON episode_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_timestamps_episode ON timestamps(episode_id);
CREATE INDEX IF NOT EXISTS idx_quotes_episode ON quotes(episode_id);
CREATE INDEX IF NOT EXISTS idx_resources_episode ON resources(episode_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
