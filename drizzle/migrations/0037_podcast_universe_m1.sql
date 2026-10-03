-- Podcast Universe M1 (docs/podcast-universe-plan-v1.md §B1). ADDITIVE ONLY:
-- seven new tables, no ALTER/DROP of any existing table. Idempotent (IF NOT
-- EXISTS / guarded FKs) because the migrator is a high-watermark, not a
-- membership check — re-running this file on a DB that already has it is a no-op.
CREATE TABLE IF NOT EXISTS "podcast_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"youtube_channel_id" text,
	"handle" text,
	"name" text NOT NULL,
	"country_code" text,
	"default_language" text,
	"registry_type" text NOT NULL,
	"registry_source" text NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"uploads_playlist_id" text,
	"subscriber_count" bigint,
	"reported_video_count" bigint,
	"last_crawled_at" timestamp with time zone,
	"last_successful_crawl_at" timestamp with time zone,
	"latest_known_video_id" text,
	"latest_known_published_at" timestamp with time zone,
	"crawl_status" text DEFAULT 'never' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_channels_platform" CHECK (platform = 'youtube'),
	CONSTRAINT "chk_podcast_channels_registry_type" CHECK (registry_type IN ('core_interview', 'context_coverage', 'candidate', 'rejected', 'dormant')),
	CONSTRAINT "chk_podcast_channels_registry_source" CHECK (registry_source IN ('khaled', 'marzouq', 'manual', 'youtube_search', 'index_expansion')),
	CONSTRAINT "chk_podcast_channels_verification" CHECK (verification_status IN ('pending', 'verified', 'rejected')),
	CONSTRAINT "chk_podcast_channels_crawl_status" CHECK (crawl_status IN ('never', 'running', 'complete', 'partial', 'failed')),
	CONSTRAINT "chk_podcast_channels_has_key" CHECK (youtube_channel_id IS NOT NULL OR handle IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid,
	"run_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"playlist_pages" integer DEFAULT 0 NOT NULL,
	"video_ids_seen" integer DEFAULT 0 NOT NULL,
	"episodes_inserted" integer DEFAULT 0 NOT NULL,
	"episodes_updated" integer DEFAULT 0 NOT NULL,
	"youtube_read_units" integer DEFAULT 0 NOT NULL,
	"youtube_search_calls" integer DEFAULT 0 NOT NULL,
	"ai_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"budget_limit_usd" numeric(12, 6),
	"cursor_state" jsonb,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_crawl_runs_type" CHECK (run_type IN ('initial', 'incremental', 'metadata_refresh', 'channel_verify', 'guest_extract')),
	CONSTRAINT "chk_podcast_crawl_runs_status" CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'budget_stopped'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"published_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"view_count" bigint,
	"view_count_checked_at" timestamp with time zone,
	"language" text,
	"duration_class" text NOT NULL,
	"availability_status" text DEFAULT 'public' NOT NULL,
	"guest_extraction_status" text DEFAULT 'pending' NOT NULL,
	"guest_extraction_note" text,
	"guest_extraction_run_id" uuid,
	"content_kind" text,
	"metadata_hash" text,
	"raw_metadata" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_episodes_duration_nonneg" CHECK (duration_seconds >= 0),
	CONSTRAINT "chk_podcast_episodes_duration_class" CHECK (duration_class IN ('core_longform', 'midform_context', 'short_clip')),
	CONSTRAINT "chk_podcast_episodes_availability" CHECK (availability_status IN ('public', 'unavailable', 'deleted', 'private', 'unknown')),
	CONSTRAINT "chk_podcast_episodes_extraction" CHECK (guest_extraction_status IN ('pending', 'running', 'succeeded', 'no_guest', 'skipped', 'failed')),
	CONSTRAINT "chk_podcast_episodes_content_kind" CHECK (content_kind IS NULL OR content_kind IN ('guest_interview', 'panel', 'solo_host', 'narrated_story', 'documentary', 'other', 'unclear'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_guest_appearances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"is_primary_guest" boolean DEFAULT false NOT NULL,
	"role_text" text,
	"extraction_source" text NOT NULL,
	"extraction_confidence" numeric(4, 3) NOT NULL,
	"evidence_field" text NOT NULL,
	"evidence_text" text,
	"display_name" text,
	"nationality_claim_code" text,
	"nationality_claim_text" text,
	"gender_signal" text DEFAULT 'unknown' NOT NULL,
	"gender_evidence_text" text,
	"topic_hint" text,
	"verification_status" text DEFAULT 'extracted' NOT NULL,
	"ai_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_appearances_source" CHECK (extraction_source IN ('metadata_ai', 'metadata_rule', 'transcript', 'manual')),
	CONSTRAINT "chk_podcast_appearances_field" CHECK (evidence_field IN ('title', 'description', 'transcript', 'manual')),
	CONSTRAINT "chk_podcast_appearances_gender" CHECK (gender_signal IN ('male', 'female', 'unknown')),
	CONSTRAINT "chk_podcast_appearances_status" CHECK (verification_status IN ('extracted', 'verified', 'review', 'rejected')),
	CONSTRAINT "chk_podcast_appearances_confidence" CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name_key" text NOT NULL,
	"identity_status" text DEFAULT 'unverified' NOT NULL,
	"nationality_code" text,
	"nationality_status" text DEFAULT 'unknown' NOT NULL,
	"nationality_basis" text DEFAULT 'none' NOT NULL,
	"gender_marker" text DEFAULT 'unknown' NOT NULL,
	"gender_status" text DEFAULT 'unknown' NOT NULL,
	"gender_basis" text DEFAULT 'none' NOT NULL,
	"life_status" text DEFAULT 'unknown' NOT NULL,
	"wikidata_id" text,
	"khat_guest_id" text,
	"khat_guest_candidate_id" text,
	"merged_into_person_id" uuid,
	"needs_identity_review" boolean DEFAULT false NOT NULL,
	"identity_notes" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_people_identity" CHECK (identity_status IN ('unverified', 'probable', 'verified', 'conflicted')),
	CONSTRAINT "chk_podcast_people_nat_status" CHECK (nationality_status IN ('unknown', 'probable', 'verified', 'conflicted')),
	CONSTRAINT "chk_podcast_people_nat_basis" CHECK (nationality_basis IN ('none', 'episode_metadata', 'khat_guest', 'manual')),
	CONSTRAINT "chk_podcast_people_gender_marker" CHECK (gender_marker IN ('male', 'female', 'unknown')),
	CONSTRAINT "chk_podcast_people_gender_status" CHECK (gender_status IN ('unknown', 'probable', 'verified', 'conflicted')),
	CONSTRAINT "chk_podcast_people_gender_basis" CHECK (gender_basis IN ('none', 'episode_metadata', 'khat_guest', 'manual')),
	CONSTRAINT "chk_podcast_people_life" CHECK (life_status IN ('alive', 'deceased', 'unknown')),
	CONSTRAINT "chk_podcast_people_verified_nat_basis" CHECK (nationality_status <> 'verified' OR nationality_basis IN ('khat_guest', 'manual')),
	CONSTRAINT "chk_podcast_people_verified_gender_basis" CHECK (gender_status <> 'verified' OR gender_basis IN ('khat_guest', 'manual'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_person_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_person_aliases_source" CHECK (source IN ('episode', 'manual', 'wikidata', 'khat_guest', 'verification'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_person_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_crawl_runs_channel_id_podcast_channels_id_fk') THEN
  ALTER TABLE "podcast_crawl_runs" ADD CONSTRAINT "podcast_crawl_runs_channel_id_podcast_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."podcast_channels"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_episodes_channel_id_podcast_channels_id_fk') THEN
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_channel_id_podcast_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."podcast_channels"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_guest_appearances_person_id_podcast_people_id_fk') THEN
  ALTER TABLE "podcast_guest_appearances" ADD CONSTRAINT "podcast_guest_appearances_person_id_podcast_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."podcast_people"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_guest_appearances_episode_id_podcast_episodes_id_fk') THEN
  ALTER TABLE "podcast_guest_appearances" ADD CONSTRAINT "podcast_guest_appearances_episode_id_podcast_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_people_khat_guest_id_guests_id_fk') THEN
  ALTER TABLE "podcast_people" ADD CONSTRAINT "podcast_people_khat_guest_id_guests_id_fk" FOREIGN KEY ("khat_guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_people_khat_guest_candidate_id_guest_candidates_id_fk') THEN
  ALTER TABLE "podcast_people" ADD CONSTRAINT "podcast_people_khat_guest_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("khat_guest_candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_person_aliases_person_id_podcast_people_id_fk') THEN
  ALTER TABLE "podcast_person_aliases" ADD CONSTRAINT "podcast_person_aliases_person_id_podcast_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."podcast_people"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'podcast_person_events_person_id_podcast_people_id_fk') THEN
  ALTER TABLE "podcast_person_events" ADD CONSTRAINT "podcast_person_events_person_id_podcast_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."podcast_people"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_channels_youtube_id" ON "podcast_channels" USING btree ("youtube_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_channels_handle" ON "podcast_channels" USING btree ("handle") WHERE handle IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_channels_registry_type" ON "podcast_channels" USING btree ("registry_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_channels_verification" ON "podcast_channels" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_crawl_runs_channel" ON "podcast_crawl_runs" USING btree ("channel_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_crawl_runs_created" ON "podcast_crawl_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_episodes_video_id" ON "podcast_episodes" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_episodes_channel_published" ON "podcast_episodes" USING btree ("channel_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_episodes_class_extraction" ON "podcast_episodes" USING btree ("duration_class","guest_extraction_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_episodes_published" ON "podcast_episodes" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_appearances_person_episode" ON "podcast_guest_appearances" USING btree ("person_id","episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_appearances_person" ON "podcast_guest_appearances" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_appearances_episode" ON "podcast_guest_appearances" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_appearances_verification" ON "podcast_guest_appearances" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_appearances_primary" ON "podcast_guest_appearances" USING btree ("is_primary_guest");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_people_name_key" ON "podcast_people" USING btree ("normalized_name_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_people_nationality" ON "podcast_people" USING btree ("nationality_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_people_nationality_gender" ON "podcast_people" USING btree ("nationality_code","gender_marker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_people_khat_guest" ON "podcast_people" USING btree ("khat_guest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_people_khat_candidate" ON "podcast_people" USING btree ("khat_guest_candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_people_needs_review" ON "podcast_people" USING btree ("needs_identity_review");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_person_aliases_normalized" ON "podcast_person_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_person_aliases_person_alias" ON "podcast_person_aliases" USING btree ("person_id","normalized_alias");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podcast_person_events_person" ON "podcast_person_events" USING btree ("person_id","created_at" DESC NULLS LAST);