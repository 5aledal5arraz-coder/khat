-- Studio analyzer table (post-publish YouTube performance analysis per session)
CREATE TABLE IF NOT EXISTS studio_analyzers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
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

ALTER TABLE studio_analyzers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio analyzers are viewable by everyone" ON studio_analyzers FOR SELECT USING (true);
CREATE POLICY "Studio analyzers can be inserted by everyone" ON studio_analyzers FOR INSERT WITH CHECK (true);
CREATE POLICY "Studio analyzers can be updated by everyone" ON studio_analyzers FOR UPDATE USING (true);
CREATE POLICY "Studio analyzers can be deleted by everyone" ON studio_analyzers FOR DELETE USING (true);
