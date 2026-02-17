-- Add AI-processed transcript outputs alongside existing raw + clean columns
ALTER TABLE studio_transcripts
  ADD COLUMN IF NOT EXISTS transcript_article TEXT,
  ADD COLUMN IF NOT EXISTS summary JSONB,
  ADD COLUMN IF NOT EXISTS quotes_extracted JSONB,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'idle';
