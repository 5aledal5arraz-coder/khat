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
