-- Allow studio sessions to be created from audio file uploads (not just YouTube)
-- Makes youtube_url and video_id nullable for audio sessions
-- Adds source column to distinguish between youtube and audio sessions

ALTER TABLE studio_sessions ALTER COLUMN youtube_url DROP NOT NULL;
ALTER TABLE studio_sessions ALTER COLUMN video_id DROP NOT NULL;

ALTER TABLE studio_sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'youtube';
ALTER TABLE studio_sessions ADD COLUMN audio_filename TEXT;
ALTER TABLE studio_sessions ADD COLUMN audio_file_size BIGINT;
