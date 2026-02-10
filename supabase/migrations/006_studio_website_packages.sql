-- Studio Website Packages table
-- Stores AI-generated website content packages (summary, takeaways, quotes, etc.)

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
