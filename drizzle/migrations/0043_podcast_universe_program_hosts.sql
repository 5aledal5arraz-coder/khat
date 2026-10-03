-- Podcast Universe — program-scoped hosts (noura 2026-10-03). ADDITIVE and
-- idempotent: one jsonb column with an empty-array default; no row rewritten.
ALTER TABLE "podcast_channels" ADD COLUMN IF NOT EXISTS "program_hosts" jsonb DEFAULT '[]'::jsonb NOT NULL;
