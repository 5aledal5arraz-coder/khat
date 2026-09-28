-- Slow AI off the request path — per-job dedupe key for the Postgres queue.
--
-- Additive only (one nullable column + one partial unique index). Reviewed after
-- `db:generate`: no DROP of any kind. Written replayable like 0028/0030/0031 —
-- the migrator is a high-water mark, not a membership check, so a re-run must not
-- abort. At most ONE pending/running job may carry a given dedupe_key; terminal
-- rows keep theirs as history (see enqueueJobOnce in lib/jobs/queue.ts).

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_dedupe_inflight" ON "jobs" USING btree ("dedupe_key") WHERE status IN ('pending', 'running');
