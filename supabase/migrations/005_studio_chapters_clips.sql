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
