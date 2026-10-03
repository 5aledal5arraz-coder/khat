-- Podcast Universe — budget reservation vs actual billable cost (2026-10-03).
-- ADDITIVE and idempotent: one numeric column defaulting to 0; no row rewritten.
ALTER TABLE "podcast_crawl_runs" ADD COLUMN IF NOT EXISTS "reserved_usd" numeric(12, 6) DEFAULT '0' NOT NULL;
