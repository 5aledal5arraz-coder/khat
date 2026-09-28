-- Discovery → CRM links on guest_candidates (2026-09-28).
--
-- Additive only (two nullable text columns, no FK — guest_candidates stays a
-- standalone module). Reviewed after `db:generate`: no DROP of any kind.
-- Replayable like 0028/0030/0031/0033 — the migrator is a high-water mark,
-- not a membership check, so a re-run must not abort.
--   wikidata_qid  — dedupe key beside the folded name (confident matches only)
--   target_eir_id — the episode a discovery candidate was nominated for

ALTER TABLE "guest_candidates" ADD COLUMN IF NOT EXISTS "wikidata_qid" text;--> statement-breakpoint
ALTER TABLE "guest_candidates" ADD COLUMN IF NOT EXISTS "target_eir_id" text;
