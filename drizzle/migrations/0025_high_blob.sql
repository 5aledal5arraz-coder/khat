-- «قريباً» on the homepage guest strip.
--
-- Purely additive: one column, defaulted, on a table that holds 0 rows in
-- production. Nothing is renamed and nothing is dropped.
--
-- `IF NOT EXISTS` because this project's migrator is a high-watermark on
-- created_at, not a membership check — a migration can be re-presented, so
-- every one of them has to be safe to run twice.
ALTER TABLE "homepage_thinkers" ADD COLUMN IF NOT EXISTS "is_upcoming" boolean DEFAULT false NOT NULL;
