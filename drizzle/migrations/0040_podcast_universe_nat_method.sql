-- Podcast Universe M1 closeout (addendum 2026-10-03): HOW a verified nationality
-- was verified. ADDITIVE: one nullable column + three CHECKs on podcast_people,
-- no existing value rewritten (no row is verified today, so the new CHECKs hold).
-- Idempotent: ADD COLUMN IF NOT EXISTS; each CHECK dropped IF EXISTS then re-added.
ALTER TABLE "podcast_people" ADD COLUMN IF NOT EXISTS "nationality_verification_method" text;--> statement-breakpoint
ALTER TABLE "podcast_people" DROP CONSTRAINT IF EXISTS "chk_podcast_people_nat_method";--> statement-breakpoint
ALTER TABLE "podcast_people" ADD CONSTRAINT "chk_podcast_people_nat_method" CHECK (nationality_verification_method IS NULL OR nationality_verification_method IN ('source_evidence', 'existing_khat_record', 'manual_editorial'));--> statement-breakpoint
ALTER TABLE "podcast_people" DROP CONSTRAINT IF EXISTS "chk_podcast_people_verified_has_method";--> statement-breakpoint
ALTER TABLE "podcast_people" ADD CONSTRAINT "chk_podcast_people_verified_has_method" CHECK (nationality_status <> 'verified' OR nationality_verification_method IS NOT NULL);--> statement-breakpoint
ALTER TABLE "podcast_people" DROP CONSTRAINT IF EXISTS "chk_podcast_people_method_basis";--> statement-breakpoint
ALTER TABLE "podcast_people" ADD CONSTRAINT "chk_podcast_people_method_basis" CHECK (nationality_verification_method IS NULL
        OR (nationality_verification_method = 'manual_editorial' AND nationality_basis = 'manual')
        OR (nationality_verification_method = 'existing_khat_record' AND nationality_basis = 'khat_guest')
        OR (nationality_verification_method = 'source_evidence' AND nationality_basis IN ('manual', 'khat_guest')));