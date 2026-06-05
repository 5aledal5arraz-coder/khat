/**
 * Phase 2.1 (P2.1.a + P2.1.d) — EIR illegal-transition substrate.
 *
 *   npm run migrate:phase2-1-eir-trigger
 *
 * Forward (idempotent):
 *   1. Creates `eir_invalid_transition_attempts` audit table + 3 indexes
 *      (P2.1.a).
 *   2. Creates the PL/pgSQL trigger FUNCTION
 *      `khat_eir_check_transition()` (P2.1.a, REPORT-mode default).
 *   3. Attaches that function as
 *      `khat_eir_check_transition_trg BEFORE UPDATE OF phase ON
 *      episode_intelligence_records` (P2.1.d).
 *
 * Modes — read from `app.khat_eir_transition_mode` session setting:
 *   • 'report'  (default; missing setting → report) → log and allow.
 *   • 'enforce' → log and RAISE EXCEPTION.
 *
 * Optional actor attribution — read from
 * `app.khat_eir_transition_actor` session setting. Callers wanting to
 * attribute illegal attempts can `SET LOCAL app.khat_eir_transition_actor
 * = '<admin-id>'` before the UPDATE.
 *
 * Rollback:
 *   MIGRATE_PHASE2_1_REVERSE=1 npm run migrate:phase2-1-eir-trigger
 *
 * Reversing detaches the trigger, drops the function, and drops the
 * audit table (and its indexes). EIR table itself is untouched.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE2_1_REVERSE === "1"

async function main() {
  if (!db) {
    console.error(
      "[phase2-1-eir-trigger] db is null — DATABASE_URL not configured",
    )
    process.exit(1)
  }

  if (REVERSE) {
    console.log(
      "[phase2-1-eir-trigger] REVERSE: detaching trigger + dropping function + audit table…",
    )
    // P2.1.d — detach the trigger first; the function it points at
    // cannot be dropped while a trigger references it.
    await db.execute(sql`
      DROP TRIGGER IF EXISTS khat_eir_check_transition_trg
      ON episode_intelligence_records
    `)
    await db.execute(sql`DROP FUNCTION IF EXISTS khat_eir_check_transition()`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_eita_attempted_at`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_eita_eir_attempted`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_eita_mode_attempted`)
    await db.execute(
      sql`DROP TABLE IF EXISTS eir_invalid_transition_attempts`,
    )
    console.log("[phase2-1-eir-trigger] reverse complete")
    process.exit(0)
  }

  console.log(
    "[phase2-1-eir-trigger] forward: creating audit table + trigger function…",
  )

  // 1. Audit table.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS eir_invalid_transition_attempts (
      id                  text PRIMARY KEY,
      eir_id              text NOT NULL,
      from_phase          text,
      attempted_to_phase  text NOT NULL,
      actor               text,
      mode                text NOT NULL,
      attempted_at        timestamp with time zone NOT NULL DEFAULT now(),
      raw_sql             text
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_eita_attempted_at
    ON eir_invalid_transition_attempts (attempted_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_eita_eir_attempted
    ON eir_invalid_transition_attempts (eir_id, attempted_at)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_eita_mode_attempted
    ON eir_invalid_transition_attempts (mode, attempted_at)
  `)

  // 2. Trigger FUNCTION — created but NOT attached to any table.
  //
  // The legal-transition matrix is a literal encoded as a VALUES list.
  // It mirrors `lib/eir/transitions.ts` exactly: linear chain + the
  // single 'idea → guest_discovery' branch + universal archive escape.
  //
  // The function ships in REPORT mode. ENFORCE mode is opt-in per
  // session via `SET LOCAL app.khat_eir_transition_mode = 'enforce'`.
  //
  // Phases that don't change (NEW.phase IS NOT DISTINCT FROM OLD.phase)
  // bypass the check — needed because every UPDATE on this table fires
  // the (future) trigger, including non-phase updates like guest binding.
  //
  // Audit-row insert always happens BEFORE the RAISE so REPORT and
  // ENFORCE modes share the same audit shape; only the final action
  // differs.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION khat_eir_check_transition()
    RETURNS TRIGGER AS $$
    DECLARE
      v_allowed   boolean := false;
      v_mode      text;
      v_actor     text;
    BEGIN
      -- No phase change → nothing to check.
      IF NEW.phase IS NOT DISTINCT FROM OLD.phase THEN
        RETURN NEW;
      END IF;

      v_mode  := COALESCE(current_setting('app.khat_eir_transition_mode', true), 'report');
      v_actor := NULLIF(current_setting('app.khat_eir_transition_actor', true), '');

      -- Universal: any non-archived phase → archived.
      IF NEW.phase = 'archived'
         AND OLD.phase IS NOT NULL
         AND OLD.phase <> 'archived' THEN
        v_allowed := true;
      END IF;

      -- Linear forward chain + the single allowed branch.
      IF NOT v_allowed THEN
        v_allowed := (OLD.phase, NEW.phase) IN (
          ('idea',              'guest_assigned'),
          ('idea',              'guest_discovery'),
          ('guest_discovery',   'guest_assigned'),
          ('guest_assigned',    'approved'),
          ('approved',          'researching'),
          ('researching',       'prepared'),
          ('prepared',          'ready_to_record'),
          ('ready_to_record',   'recording'),
          ('recording',         'recorded'),
          ('recorded',          'producing'),
          ('producing',         'ready_to_publish'),
          ('ready_to_publish',  'published'),
          ('published',         'analyzing'),
          ('analyzing',         'learned'),
          ('learned',           'archived')
        );
      END IF;

      IF v_allowed THEN
        RETURN NEW;
      END IF;

      -- Illegal. Always log; raise only in enforce.
      INSERT INTO eir_invalid_transition_attempts (
        id, eir_id, from_phase, attempted_to_phase, actor, mode
      ) VALUES (
        gen_random_uuid()::text,
        NEW.id,
        OLD.phase,
        NEW.phase,
        v_actor,
        v_mode
      );

      IF v_mode = 'enforce' THEN
        RAISE EXCEPTION
          'Illegal EIR phase transition: % → % (mode=enforce, eir_id=%)',
          COALESCE(OLD.phase, '<null>'),
          NEW.phase,
          NEW.id
          USING ERRCODE = 'check_violation';
      END IF;

      -- Report mode: allow the UPDATE through.
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `)

  // 3. P2.1.d — attach the trigger to episode_intelligence_records.
  //
  // Fires BEFORE UPDATE OF phase only — even tighter than the function's
  // internal "no change → return" check. PG short-circuits the function
  // call entirely when the UPDATE statement doesn't touch the phase
  // column. Drops + recreates so re-running the migration is idempotent.
  //
  // REPORT mode default — the function reads `app.khat_eir_transition_mode`
  // session setting and falls back to 'report' when unset. ENFORCE is
  // opt-in per-session via `SET LOCAL app.khat_eir_transition_mode =
  // 'enforce'` or globally via `ALTER DATABASE … SET …`.
  await db.execute(sql`
    DROP TRIGGER IF EXISTS khat_eir_check_transition_trg
    ON episode_intelligence_records
  `)
  await db.execute(sql`
    CREATE TRIGGER khat_eir_check_transition_trg
      BEFORE UPDATE OF phase ON episode_intelligence_records
      FOR EACH ROW
      EXECUTE FUNCTION khat_eir_check_transition()
  `)

  // 4. Sanity check — function exists, table exists, trigger IS attached
  //    (P2.1.d contract: function + table + trigger all present).
  const check = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM pg_proc
        WHERE proname = 'khat_eir_check_transition')::int AS function_count,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_name = 'eir_invalid_transition_attempts')::int AS table_count,
      (SELECT count(*) FROM information_schema.triggers
        WHERE event_object_table = 'episode_intelligence_records'
          AND trigger_name LIKE 'khat_eir_%')::int AS trigger_count
  `)) as unknown as {
    rows: Array<{ function_count: number; table_count: number; trigger_count: number }>
  }
  const c = check.rows[0]
  console.log(
    `[phase2-1-eir-trigger] post-migrate state: ` +
      `function_count=${c.function_count} ` +
      `table_count=${c.table_count} ` +
      `trigger_count=${c.trigger_count}`,
  )
  if (c.function_count !== 1 || c.table_count !== 1 || c.trigger_count !== 1) {
    console.error(
      "[phase2-1-eir-trigger] POST-CHECK FAILED: expected " +
        "function_count=1, table_count=1, trigger_count=1",
    )
    process.exit(2)
  }
  console.log("[phase2-1-eir-trigger] forward migration complete")
  console.log(
    "[phase2-1-eir-trigger] trigger attached in REPORT mode (default). " +
      "ENFORCE is opt-in via 'SET LOCAL app.khat_eir_transition_mode = enforce'.",
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("[phase2-1-eir-trigger] migration failed:", err)
  process.exit(1)
})
