-- «نسخة الضيف» — the guest's private per-episode link + the suggestions inbox.
--
-- Additive only (two new tables, their FKs, indexes and CHECKs). Reviewed after
-- `db:generate`: no DROP of any kind. Written replayable, like 0028/0030 — the
-- migrator is a high-water mark, not a membership check, so a re-run must not
-- abort. The CHECKs are repeated in scripts/post-schema.sql (canonical copy).

CREATE TABLE IF NOT EXISTS "guest_episode_links" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"guest_id" text,
	"guest_display_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"questionnaire" jsonb,
	"questionnaire_submitted_at" timestamp with time zone,
	"questionnaire_draft" jsonb,
	"questionnaire_draft_step" integer,
	"welcome_seen_at" timestamp with time zone,
	"published_view" jsonb,
	"published_ref_map" jsonb,
	"published_at" timestamp with time zone,
	"published_by" text,
	"published_source_prep_id" text,
	"published_source_prep_updated_at" timestamp with time zone,
	"published_schedule_at" timestamp with time zone,
	"sample_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"location_label" text,
	"address" text,
	"map_url" text,
	"house_photo" text,
	"show_schedule" boolean DEFAULT true NOT NULL,
	"location_updated_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_episode_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guest_episode_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"link_id" text NOT NULL,
	"eir_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_ref" text,
	"original_text" text,
	"suggestion_type" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"guest_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_links" ADD CONSTRAINT "guest_episode_links_eir_id_episode_intelligence_records_id_fk"
    FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_links" ADD CONSTRAINT "guest_episode_links_guest_id_guests_id_fk"
    FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_suggestions" ADD CONSTRAINT "guest_episode_suggestions_link_id_guest_episode_links_id_fk"
    FOREIGN KEY ("link_id") REFERENCES "public"."guest_episode_links"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_guest_episode_links_active" ON "guest_episode_links" USING btree ("eir_id",COALESCE("guest_id", '')) WHERE "guest_episode_links"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guest_episode_links_eir" ON "guest_episode_links" USING btree ("eir_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guest_episode_suggestions_link" ON "guest_episode_suggestions" USING btree ("link_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guest_episode_suggestions_eir" ON "guest_episode_suggestions" USING btree ("eir_id","status");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_links" ADD CONSTRAINT "chk_guest_episode_links_status"
    CHECK (status IN ('active', 'revoked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_suggestions" ADD CONSTRAINT "chk_guest_episode_suggestions_target_kind"
    CHECK (target_kind IN ('axis', 'question', 'general'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_suggestions" ADD CONSTRAINT "chk_guest_episode_suggestions_type"
    CHECK (suggestion_type IN ('edit', 'comment', 'new_question'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_suggestions" ADD CONSTRAINT "chk_guest_episode_suggestions_status"
    CHECK (status IN ('new', 'accepted', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guest_episode_suggestions" ADD CONSTRAINT "chk_guest_episode_suggestions_body_len"
    CHECK (char_length(body) BETWEEN 1 AND 1000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
