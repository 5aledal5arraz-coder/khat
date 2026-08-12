-- The guest testimonial gains a third form: a voice note.
--
-- `IF NOT EXISTS` on both, deliberately. The migrator compares a high-water
-- mark rather than checking membership, so a migration can be replayed against
-- a database that already has it — and a plain ADD COLUMN would abort the whole
-- run at that point, taking every later statement with it.
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "guest_audio_url" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "guest_audio_duration" integer;
