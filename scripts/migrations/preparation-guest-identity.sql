-- ===========================================================================
-- Preparation Studio — guest identity disambiguation columns
-- ===========================================================================
-- Adds three columns to `episode_preparations` to back the identity gate
-- introduced with the creation wizard. The app refuses to run research
-- unless `guest_identity` is non-null, so legacy rows (created before this
-- migration) must be force-demoted through the "re-identify" flow in the
-- admin UI before they can generate research.
--
-- All three columns are nullable for backward compat. The API layer
-- enforces "required at create time" for new rows.
-- ===========================================================================

ALTER TABLE episode_preparations
  ADD COLUMN IF NOT EXISTS guest_description text,
  ADD COLUMN IF NOT EXISTS guest_profile_link text,
  ADD COLUMN IF NOT EXISTS guest_identity jsonb;

-- Partial index — we look up rows that still need identity so the admin
-- UI can list "pending identity" drafts at a glance.
CREATE INDEX IF NOT EXISTS idx_episode_preparations_missing_identity
  ON episode_preparations (created_at DESC)
  WHERE guest_identity IS NULL;
