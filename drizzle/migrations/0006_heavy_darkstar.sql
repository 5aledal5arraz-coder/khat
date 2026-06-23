ALTER TABLE "episode_enrichments" ADD COLUMN "publish_status" text DEFAULT 'published';--> statement-breakpoint
ALTER TABLE "episode_enrichments" ADD COLUMN "scheduled_for" timestamp with time zone;