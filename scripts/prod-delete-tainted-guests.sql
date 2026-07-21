-- ============================================================================
-- prod-delete-tainted-guests.sql
-- ----------------------------------------------------------------------------
-- PURPOSE
--   Remove the 42 "tainted" guest rows that were auto-created by the studio /
--   discovery pipeline with NO real identity. Every one of them has
--   name = 'بدون اسم' and a junk slug derived from an episode title
--   (e.g. '007-بودكاست-خط', 'سالفة-05', 'قريبا-ترقبونا'). They are visible on
--   the public site and must go.
--
--   The single authoritative criterion is:   name = 'بدون اسم'
--   Locally this matched EXACTLY the 42 rows (verified against the
--   guests-full-backup-20260719.json snapshot — all 42 share this name).
--
-- SCOPE / SAFETY
--   * PRODUCTION script — run at DEPLOY TIME only, by hand, against the prod DB.
--   * REQUIRES Khaled's explicit approval before it is run on production.
--   * Runs inside ONE transaction (BEGIN … COMMIT). If any guard RAISEs, the
--     whole thing rolls back and nothing changes. Review the NOTICEs, then
--     COMMIT to persist — or run ROLLBACK instead to abort.
--   * This file is NOT part of the migration system. Do NOT wire it into
--     db:migrate. It is a one-shot manual cleanup.
--
-- BACKUP MODEL (why an in-DB restore is now fully possible)
--   Every row this script can touch is captured in an in-transaction `_bak_*`
--   table BEFORE the DELETE, all suffixed `_20260721`:
--     * the 42 full guest rows                     → _bak_guests_20260721
--     * the episode→guest link map (SET NULL side) → _bak_ep_guest_map_20260721
--     * ALL five CASCADE-deleted child tables      → _bak_<child>_20260721
--   So a full in-DB restore no longer depends on an external dump — the _bak
--   tables are the authoritative recovery source. A pre-run `pg_dump` is still
--   REQUIRED as an independent SECOND layer (belt-and-braces: it survives a
--   dropped _bak table, a wrong session, or operator error), never as the sole
--   source of the CASCADE child rows.
--
-- HOW TO RUN (prod, deploy time, after pg_dump + approval)
--     psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f scripts/prod-delete-tainted-guests.sql
--   The file ends at COMMIT. If you would rather inspect first, run it with the
--   final COMMIT commented out and a manual ROLLBACK; then re-run to commit.
--
-- HOW TO ROLL BACK
--   * BEFORE COMMIT:  just `ROLLBACK;` — nothing was persisted.
--   * AFTER COMMIT, within the same session window, restore fully from the in-DB
--     `_bak_*_20260721` tables — parents first, then children:
--         INSERT INTO guests SELECT * FROM _bak_guests_20260721;
--         UPDATE episodes e SET guest_id = b.guest_id
--           FROM _bak_ep_guest_map_20260721 b WHERE e.id = b.id;
--         INSERT INTO episode_guests          SELECT * FROM _bak_episode_guests_20260721;
--         INSERT INTO guest_identity_profiles SELECT * FROM _bak_guest_identity_profiles_20260721;
--         INSERT INTO guest_discovery_links   SELECT * FROM _bak_guest_discovery_links_20260721;
--         INSERT INTO guest_candidate_links   SELECT * FROM _bak_guest_candidate_links_20260721;
--         INSERT INTO guest_application_links SELECT * FROM _bak_guest_application_links_20260721;
--     The pre-run `pg_dump` remains the independent second-layer fallback.
--
-- GUEST-REFERENCING COLUMNS (authoritative, read from the live schema —
--   information_schema FK graph on guests.id — NOT guessed):
--
--   HARD FK, ON DELETE CASCADE  (child rows are DELETED with the guest):
--     1. episode_guests.guest_id
--     2. guest_application_links.guest_id
--     3. guest_candidate_links.guest_id
--     4. guest_discovery_links.guest_id
--     5. guest_identity_profiles.guest_id
--
--   HARD FK, ON DELETE SET NULL (column is NULLed, row kept):
--     6.  episodes.guest_id
--     7.  episode_intelligence_records.guest_id
--     8.  quotes.guest_id
--     9.  teasers.guest_id
--     10. guest_discovery_candidates.promoted_guest_id
--     11. khat_map_guest_candidates.linked_guest_id
--
--   SOFT reference, NO FK  (the ONLY column that can be left DANGLING —
--   nothing cascades or nulls it automatically → guarded explicitly below):
--     12. homepage_thinkers.guest_id
--
--   (An information_schema dump reports 13 rows for the hard FKs because two
--    multi-column constraints — guest_application_links & guest_candidate_links —
--    each list guest_id twice in the composite join. The distinct set is the
--    11 hard-FK columns + 1 soft column = 12 real columns above.)
--
-- ============================================================================

BEGIN;

-- ── Guard 0: confirm the criterion matches the expected 42 (no more, no less) ──
-- Protects against drift: a legitimate guest accidentally named 'بدون اسم', or
-- new tainted rows. If prod legitimately differs, review WHY before adjusting
-- the number here — do not blindly change it.
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM guests WHERE name = 'بدون اسم';
  RAISE NOTICE 'Guard 0: tainted guests matched by name=''بدون اسم'' = %', v_count;
  IF v_count <> 42 THEN
    RAISE EXCEPTION 'ABORT: expected 42 tainted guests, found %. Investigate before running.', v_count;
  END IF;
END $$;

-- ── Guard 1: backup tables must not already exist (never overwrite a backup) ──
-- Covers every _bak_*_20260721 table this script creates: the two parents plus
-- the five CASCADE-child backups. If ANY exists, abort — a prior run's backups
-- must never be silently clobbered.
DO $$
BEGIN
  IF to_regclass('public._bak_guests_20260721')                    IS NOT NULL
     OR to_regclass('public._bak_ep_guest_map_20260721')           IS NOT NULL
     OR to_regclass('public._bak_episode_guests_20260721')         IS NOT NULL
     OR to_regclass('public._bak_guest_identity_profiles_20260721') IS NOT NULL
     OR to_regclass('public._bak_guest_discovery_links_20260721')  IS NOT NULL
     OR to_regclass('public._bak_guest_candidate_links_20260721')  IS NOT NULL
     OR to_regclass('public._bak_guest_application_links_20260721') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: a _bak_*_20260721 table already exists — investigate before proceeding.';
  END IF;
END $$;

-- ── (أ) Backup: the 42 full guest rows + the episode→guest link map ──
CREATE TABLE _bak_guests_20260721 AS
  SELECT * FROM guests WHERE name = 'بدون اسم';

CREATE TABLE _bak_ep_guest_map_20260721 AS
  SELECT id, guest_id FROM episodes
  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);

-- Verify the backup captured exactly the 42 rows before we touch anything.
DO $$
DECLARE v_bak int;
BEGIN
  SELECT count(*) INTO v_bak FROM _bak_guests_20260721;
  RAISE NOTICE '(أ) backup _bak_guests_20260721 rows = % (expected 42)', v_bak;
  IF v_bak <> 42 THEN
    RAISE EXCEPTION 'ABORT: backup captured % rows, expected 42. Nothing deleted.', v_bak;
  END IF;
END $$;

-- ── (أ-2) Backup: the five CASCADE-deleted child tables ──
-- These rows are removed automatically when the guest is deleted (ON DELETE
-- CASCADE), so without an explicit snapshot they'd be unrecoverable in-DB. Each
-- child references guests.id via a `guest_id` column (verified against the live
-- schema / Drizzle definitions). Snapshot exactly the rows tied to the 42.
CREATE TABLE _bak_episode_guests_20260721 AS
  SELECT * FROM episode_guests
  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);

CREATE TABLE _bak_guest_identity_profiles_20260721 AS
  SELECT * FROM guest_identity_profiles
  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);

CREATE TABLE _bak_guest_discovery_links_20260721 AS
  SELECT * FROM guest_discovery_links
  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);

CREATE TABLE _bak_guest_candidate_links_20260721 AS
  SELECT * FROM guest_candidate_links
  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);

CREATE TABLE _bak_guest_application_links_20260721 AS
  SELECT * FROM guest_application_links
  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);

-- Report how many child rows each backup captured (informational — any count is
-- valid, including 0; the point is a complete in-DB snapshot before CASCADE).
DO $$
DECLARE
  v_eg  int; v_gip int; v_gdl int; v_gcl int; v_gal int;
BEGIN
  SELECT count(*) INTO v_eg  FROM _bak_episode_guests_20260721;
  SELECT count(*) INTO v_gip FROM _bak_guest_identity_profiles_20260721;
  SELECT count(*) INTO v_gdl FROM _bak_guest_discovery_links_20260721;
  SELECT count(*) INTO v_gcl FROM _bak_guest_candidate_links_20260721;
  SELECT count(*) INTO v_gal FROM _bak_guest_application_links_20260721;
  RAISE NOTICE '(أ-2) CASCADE-child backups: episode_guests=%, guest_identity_profiles=%, guest_discovery_links=%, guest_candidate_links=%, guest_application_links=%',
    v_eg, v_gip, v_gdl, v_gcl, v_gal;
END $$;

-- ── (ب) Zero-dangling-reference guard for the SOFT column (no FK) ──
-- homepage_thinkers.guest_id is the only guest-referencing column WITHOUT a
-- foreign key, so a DELETE will NOT cascade or null it — it would dangle.
-- If any of the 42 are featured there, ABORT and let a human re-point/remove
-- them first (a tainted 'بدون اسم' guest should never be a homepage thinker).
DO $$
DECLARE v_soft int;
BEGIN
  SELECT count(*) INTO v_soft FROM homepage_thinkers
   WHERE guest_id IN (SELECT id FROM _bak_guests_20260721);
  RAISE NOTICE '(ب) homepage_thinkers rows referencing a tainted guest = % (expected 0)', v_soft;
  IF v_soft > 0 THEN
    RAISE EXCEPTION 'ABORT: % homepage_thinkers row(s) reference a tainted guest (soft ref, no FK). Resolve these first or they will dangle.', v_soft;
  END IF;
END $$;

-- Snapshot pre-delete episode counts so the post-check compares against reality
-- (not a hard-coded number). Deleting guests must NEVER change the episode count
-- (episodes.guest_id is ON DELETE SET NULL — rows are kept, ids are nulled).
CREATE TEMP TABLE _precheck_counts AS
  SELECT (SELECT count(*) FROM episodes)                          AS episodes_total,
         (SELECT count(*) FROM episodes WHERE guest_id IS NOT NULL) AS episodes_linked;

-- ── (ج) Delete the 42 by the exact same criterion ──
-- Hard FKs handle the rest automatically: CASCADE children are deleted,
-- SET NULL columns are nulled. Only homepage_thinkers (guarded above) is soft.
DELETE FROM guests WHERE name = 'بدون اسم';

-- ── (د) Post-checks ──
DO $$
DECLARE
  v_remaining      int;
  v_eps_after      int;
  v_eps_before     int;
BEGIN
  SELECT count(*) INTO v_remaining FROM guests WHERE name = 'بدون اسم';
  RAISE NOTICE '(د) tainted guests remaining after delete = % (expected 0)', v_remaining;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: % tainted guests still present. Rolling back.', v_remaining;
  END IF;

  SELECT episodes_total INTO v_eps_before FROM _precheck_counts;
  SELECT count(*)       INTO v_eps_after  FROM episodes;
  RAISE NOTICE '(د) episodes total before=% after=% (must be identical; task baseline = 66)', v_eps_before, v_eps_after;
  IF v_eps_after <> v_eps_before THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: episodes total changed (% -> %). Rolling back.', v_eps_before, v_eps_after;
  END IF;
END $$;

-- ── (د-2) Confirm CASCADE fully cleared the child rows for the 42 ──
-- No live child row may still reference a backed-up (now-deleted) guest id.
DO $$
DECLARE v_orphans int;
BEGIN
  SELECT
      (SELECT count(*) FROM episode_guests          WHERE guest_id IN (SELECT id FROM _bak_guests_20260721))
    + (SELECT count(*) FROM guest_identity_profiles WHERE guest_id IN (SELECT id FROM _bak_guests_20260721))
    + (SELECT count(*) FROM guest_discovery_links   WHERE guest_id IN (SELECT id FROM _bak_guests_20260721))
    + (SELECT count(*) FROM guest_candidate_links   WHERE guest_id IN (SELECT id FROM _bak_guests_20260721))
    + (SELECT count(*) FROM guest_application_links  WHERE guest_id IN (SELECT id FROM _bak_guests_20260721))
    INTO v_orphans;
  RAISE NOTICE '(د-2) child rows still referencing a deleted guest = % (expected 0)', v_orphans;
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: % orphaned child row(s) survived the CASCADE. Rolling back.', v_orphans;
  END IF;
END $$;

-- All guards and post-checks passed. Review the NOTICEs above, then keep the
-- COMMIT to persist. To abort instead, replace COMMIT with: ROLLBACK;
COMMIT;
-- ROLLBACK;  -- <- use this line instead of COMMIT to abort without changes
