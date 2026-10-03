-- Podcast Universe M1 — review fixes (noura / yousef / rashid, 2026-10-03).
-- Touches ONLY the Podcast Universe tables created in 0037. Idempotent: every
-- constraint is dropped IF EXISTS and re-added, the index is IF NOT EXISTS.
--   • nationality/gender basis gains 'khat_candidate' (PROBABLE-grade only —
--     guest_candidates.country can be LLM-derived); VERIFIED basis CHECKs unchanged.
--   • podcast_person_events.person_id FK: CASCADE → RESTRICT (audit must not vanish).
--   • at most one active guest_extract run (partial unique index).
ALTER TABLE "podcast_people" DROP CONSTRAINT IF EXISTS "chk_podcast_people_nat_basis";--> statement-breakpoint
ALTER TABLE "podcast_people" ADD CONSTRAINT "chk_podcast_people_nat_basis" CHECK (nationality_basis IN ('none', 'episode_metadata', 'khat_candidate', 'khat_guest', 'manual'));--> statement-breakpoint
ALTER TABLE "podcast_people" DROP CONSTRAINT IF EXISTS "chk_podcast_people_gender_basis";--> statement-breakpoint
ALTER TABLE "podcast_people" ADD CONSTRAINT "chk_podcast_people_gender_basis" CHECK (gender_basis IN ('none', 'episode_metadata', 'khat_candidate', 'khat_guest', 'manual'));--> statement-breakpoint
ALTER TABLE "podcast_person_events" DROP CONSTRAINT IF EXISTS "podcast_person_events_person_id_podcast_people_id_fk";--> statement-breakpoint
ALTER TABLE "podcast_person_events" ADD CONSTRAINT "podcast_person_events_person_id_podcast_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."podcast_people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_crawl_runs_active_extract" ON "podcast_crawl_runs" USING btree ("run_type") WHERE run_type = 'guest_extract' AND status IN ('queued', 'running');
