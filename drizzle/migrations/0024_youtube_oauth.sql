-- YouTube Analytics: the channel owner's OAuth grant, and dated audience measurements.
--
-- HAND-WRITTEN, and deliberately so. `drizzle-kit generate` refused to run
-- non-interactively here because the 0023 snapshot still lists three tables the
-- schema no longer declares (visitor_events, visitor_profiles, watch_history) —
-- so drizzle saw 3 deletions beside 2 additions and wanted to ask "created, or
-- renamed?". Answered wrong, that question RENAMES a live table. All three were
-- verified ABSENT from both the local and the production database before this
-- file was written, so there is nothing to drop and nothing at risk; the
-- accompanying snapshot drops them from the ledger's picture instead.
--
-- Written to be idempotent (IF NOT EXISTS): the migrator is a high-watermark,
-- not a membership check, so a re-run must be harmless.

CREATE TABLE IF NOT EXISTS "youtube_oauth_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"granted_scopes" jsonb NOT NULL,
	"channel_id" text,
	"google_account_email" text,
	"connected_by" text,
	"connected_at" timestamp with time zone DEFAULT now(),
	"last_used_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_audience_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"report" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"data" jsonb NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
-- The page reads the newest snapshot per report, and only ever that.
CREATE INDEX IF NOT EXISTS "youtube_audience_snapshots_report_measured_idx"
	ON "youtube_audience_snapshots" ("report","measured_at");
