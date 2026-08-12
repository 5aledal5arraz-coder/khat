-- The episode page that exists before the episode does.
--
-- Everything here is ADDITIVE and written to be replayable: our migrator
-- compares a high-water mark rather than checking membership, so a migration
-- can be re-run against a database that already has it, and a plain CREATE
-- would abort the whole run at that point and take every later statement down
-- with it.

CREATE TABLE IF NOT EXISTS "upcoming_episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"slug" text NOT NULL,
	"guest_id" text,
	"title" text NOT NULL,
	"summary" text,
	"axes" jsonb DEFAULT '[]'::jsonb,
	"guest_message" text,
	"guest_message_audio_url" text,
	"guest_message_audio_duration" integer,
	"expected_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_episode_id" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "upcoming_episodes_eir_id_unique" UNIQUE("eir_id"),
	CONSTRAINT "upcoming_episodes_slug_unique" UNIQUE("slug")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_upcoming_episodes_status" ON "upcoming_episodes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upcoming_episodes_guest" ON "upcoming_episodes" USING btree ("guest_id");--> statement-breakpoint

-- Only three states are meaningful, and a typo in an admin action must not be
-- able to invent a fourth that no reader knows how to render.
DO $$ BEGIN
  ALTER TABLE "upcoming_episodes"
    ADD CONSTRAINT "upcoming_episodes_status_check"
    CHECK ("status" IN ('draft','published','withdrawn'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- FK installed here rather than in Drizzle, to keep the schema files free of a
-- circular import between `upcoming-episodes.ts` and `eir.ts` — the same
-- convention `episodes.eir_id` already follows.
--
-- RESTRICT, not CASCADE: deleting an EIR that has a public page out in the
-- world should fail and say so, not silently 404 a distributed link.
DO $$ BEGIN
  ALTER TABLE "upcoming_episodes"
    ADD CONSTRAINT "upcoming_episodes_eir_id_fk"
    FOREIGN KEY ("eir_id") REFERENCES "episode_intelligence_records"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ONE EPISODE PER EIR — and this one is worth having whether or not the feature
-- above ever ships.
--
-- `episodes.eir_id` has carried no constraint at all, while the two comparable
-- columns (`studio_projects`, `episode_performance_signals`) have had unique
-- indexes since the baseline. Without it, a transition that runs twice — or a
-- YouTube sync that lands between two halves of one — can attach two episode
-- rows to the same record, and nothing complains. It is what makes re-running
-- the transition safe.
--
-- PARTIAL, so the rows that legitimately carry NULL are untouched. Verified
-- zero duplicates on local and production before writing this.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_episodes_eir_id"
  ON "episodes" ("eir_id") WHERE "eir_id" IS NOT NULL;
