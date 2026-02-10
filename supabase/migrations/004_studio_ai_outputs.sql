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
