-- Podcast Universe M1 — application-side YouTube quota ledger (B4). Additive, idempotent.
CREATE TABLE IF NOT EXISTS "podcast_quota_usage" (
	"quota_day" text NOT NULL,
	"kind" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_podcast_quota_usage_kind" CHECK (kind IN ('read', 'search')),
	CONSTRAINT "chk_podcast_quota_usage_units" CHECK (units >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_podcast_quota_usage_day_kind" ON "podcast_quota_usage" USING btree ("quota_day","kind");