-- Podcast Universe — re-extraction REPLACES (noura 2026-10-03): appearance
-- status gains 'superseded'. Widens one CHECK on a Podcast Universe table;
-- no row rewritten. Idempotent: dropped IF EXISTS, then re-added.
ALTER TABLE "podcast_guest_appearances" DROP CONSTRAINT IF EXISTS "chk_podcast_appearances_status";--> statement-breakpoint
ALTER TABLE "podcast_guest_appearances" ADD CONSTRAINT "chk_podcast_appearances_status" CHECK (verification_status IN ('extracted', 'verified', 'review', 'rejected', 'superseded'));
