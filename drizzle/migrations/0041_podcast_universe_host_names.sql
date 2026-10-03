-- Podcast Universe — Addendum 2 (c): per-channel host names, filled manually.
-- ADDITIVE and idempotent: one column with an empty-array default; no row rewritten.
ALTER TABLE "podcast_channels" ADD COLUMN IF NOT EXISTS "host_names" text[] DEFAULT '{}'::text[] NOT NULL;
