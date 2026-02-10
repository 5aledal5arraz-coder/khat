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

-- RLS policies (admin-only in production — tighten after auth is wired)
CREATE POLICY "Studio sessions are viewable by everyone" ON studio_sessions FOR SELECT USING (true);
CREATE POLICY "Studio sessions can be inserted by everyone" ON studio_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio sessions can be updated by everyone" ON studio_sessions FOR UPDATE USING (true);
CREATE POLICY "Studio sessions can be deleted by everyone" ON studio_sessions FOR DELETE USING (true);
