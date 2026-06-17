-- Production-readiness fix sprint — add columns referenced by Phase 1.5 + 2.13.
-- Idempotent: each ALTER uses IF NOT EXISTS so the migration is safe to re-run.

-- ── khat_map_episode_candidates ─────────────────────────────────────
-- Phase 1.5: persist the batch engine's final_score (was discarded).

ALTER TABLE khat_map_episode_candidates
  ADD COLUMN IF NOT EXISTS composite_score real;

ALTER TABLE khat_map_episode_candidates
  ADD COLUMN IF NOT EXISTS composite_score_rationale text;

CREATE INDEX IF NOT EXISTS idx_khat_map_ep_cand_composite
  ON khat_map_episode_candidates (season_id, composite_score DESC NULLS LAST);

-- ── ai_runs ─────────────────────────────────────────────────────────
-- Phase 2.13: direct season pointer for cost / quality reporting per
-- season without joining through eir_id.

ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS season_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_runs_season_id_fkey'
  ) THEN
    ALTER TABLE ai_runs
      ADD CONSTRAINT ai_runs_season_id_fkey
        FOREIGN KEY (season_id) REFERENCES khat_map_seasons (id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_ai_runs_season
  ON ai_runs (season_id, started_at DESC);

-- ── Backfill ai_runs.season_id from eir's season_id where possible ──

UPDATE ai_runs r
SET season_id = e.season_id
FROM episode_intelligence_records e
WHERE r.eir_id = e.id
  AND r.season_id IS NULL
  AND e.season_id IS NOT NULL;
