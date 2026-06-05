/**
 * Khat Brain Phase 1 — foundation migration.
 *
 * Adds the three new core tables:
 *   - episode_intelligence_records      (the editorial spine)
 *   - eir_phase_transitions             (append-only phase audit)
 *   - ai_runs                           (single AI telemetry log)
 *   - jobs                              (Postgres-backed background queue)
 *
 * And drops the confirmed-dead legacy table:
 *   - episode_guest_assignments
 *
 * Idempotent. Safe to re-run. Does NOT touch any existing data tables.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/migrate-khat-brain-foundation.ts
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Khat Brain Phase 1 — foundation migration\n")

  // ─── Drop confirmed-dead legacy ─────────────────────────────────────
  console.log("Drop legacy:")
  await exec(
    "drop episode_guest_assignments",
    `DROP TABLE IF EXISTS episode_guest_assignments CASCADE`,
  )

  // ─── episode_intelligence_records ───────────────────────────────────
  console.log("\nCreate EIR core:")
  await exec(
    "create episode_intelligence_records",
    `CREATE TABLE IF NOT EXISTS episode_intelligence_records (
       id text PRIMARY KEY,
       phase text NOT NULL DEFAULT 'idea',
       season_id text REFERENCES khat_map_seasons(id) ON DELETE SET NULL,
       working_title text NOT NULL,
       final_title text,
       topic_domain text,
       episode_type text,
       topic_angle_code text,
       guest_id text REFERENCES guests(id) ON DELETE SET NULL,
       editorial_intent jsonb NOT NULL DEFAULT '{}'::jsonb,
       risk_level text,
       effort_level text,
       created_by text,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       archived_at timestamptz
     )`,
  )

  await exec(
    "phase CHECK constraint",
    `DO $$ BEGIN
       ALTER TABLE episode_intelligence_records
         ADD CONSTRAINT chk_eir_phase CHECK (phase IN (
           'idea','guest_discovery','guest_assigned','approved',
           'researching','prepared','ready_to_record','recording',
           'recorded','producing','ready_to_publish','published',
           'analyzing','learned','archived'
         ));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  await exec(
    "EIR phase index",
    `CREATE INDEX IF NOT EXISTS idx_eir_phase ON episode_intelligence_records (phase)`,
  )
  await exec(
    "EIR season index",
    `CREATE INDEX IF NOT EXISTS idx_eir_season ON episode_intelligence_records (season_id)`,
  )
  await exec(
    "EIR guest index",
    `CREATE INDEX IF NOT EXISTS idx_eir_guest ON episode_intelligence_records (guest_id)`,
  )
  await exec(
    "EIR archived partial index",
    `CREATE INDEX IF NOT EXISTS idx_eir_active ON episode_intelligence_records (updated_at DESC)
       WHERE archived_at IS NULL`,
  )

  // updated_at trigger (re-uses the project-wide function)
  await exec(
    "EIR updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_eir_updated_at
         BEFORE UPDATE ON episode_intelligence_records
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  // ─── eir_phase_transitions ──────────────────────────────────────────
  await exec(
    "create eir_phase_transitions",
    `CREATE TABLE IF NOT EXISTS eir_phase_transitions (
       id text PRIMARY KEY,
       eir_id text NOT NULL REFERENCES episode_intelligence_records(id) ON DELETE CASCADE,
       from_phase text,
       to_phase text NOT NULL,
       actor_id text,
       reason text,
       metadata jsonb,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "EIR transitions by eir",
    `CREATE INDEX IF NOT EXISTS idx_eir_transitions_eir
       ON eir_phase_transitions (eir_id, created_at DESC)`,
  )

  // ─── ai_runs ────────────────────────────────────────────────────────
  console.log("\nCreate AI telemetry:")
  await exec(
    "create ai_runs",
    `CREATE TABLE IF NOT EXISTS ai_runs (
       id text PRIMARY KEY,
       eir_id text REFERENCES episode_intelligence_records(id) ON DELETE SET NULL,
       subject_table text,
       subject_id text,
       task_kind text NOT NULL,
       provider text NOT NULL,
       model_name text NOT NULL,
       prompt_hash text,
       input_snapshot jsonb,
       output_snapshot jsonb,
       status text NOT NULL DEFAULT 'running',
       started_at timestamptz NOT NULL DEFAULT now(),
       completed_at timestamptz,
       latency_ms integer,
       tokens_in integer,
       tokens_out integer,
       cost_usd real,
       error_class text,
       error_message text
     )`,
  )

  await exec(
    "ai_runs status CHECK",
    `DO $$ BEGIN
       ALTER TABLE ai_runs ADD CONSTRAINT chk_ai_runs_status
         CHECK (status IN ('running','succeeded','failed','timed_out','cancelled'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "ai_runs task_kind CHECK",
    `DO $$ BEGIN
       ALTER TABLE ai_runs ADD CONSTRAINT chk_ai_runs_task_kind
         CHECK (task_kind IN ('structural','editorial','discovery','verification','research','analysis'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "ai_runs provider CHECK",
    `DO $$ BEGIN
       ALTER TABLE ai_runs ADD CONSTRAINT chk_ai_runs_provider
         CHECK (provider IN ('openai','gemini','anthropic'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )
  await exec(
    "ai_runs by eir",
    `CREATE INDEX IF NOT EXISTS idx_ai_runs_eir
       ON ai_runs (eir_id, started_at DESC)`,
  )
  await exec(
    "ai_runs by status",
    `CREATE INDEX IF NOT EXISTS idx_ai_runs_status_started
       ON ai_runs (status, started_at DESC)`,
  )
  await exec(
    "ai_runs by subject",
    `CREATE INDEX IF NOT EXISTS idx_ai_runs_subject
       ON ai_runs (subject_table, subject_id)
       WHERE subject_table IS NOT NULL`,
  )

  // ─── jobs ───────────────────────────────────────────────────────────
  console.log("\nCreate job queue:")
  await exec(
    "create jobs",
    `CREATE TABLE IF NOT EXISTS jobs (
       id text PRIMARY KEY,
       type text NOT NULL,
       status text NOT NULL DEFAULT 'pending',
       payload jsonb NOT NULL DEFAULT '{}'::jsonb,
       result jsonb,
       error_message text,
       priority integer NOT NULL DEFAULT 0,
       attempts integer NOT NULL DEFAULT 0,
       max_attempts integer NOT NULL DEFAULT 3,
       run_after timestamptz NOT NULL DEFAULT now(),
       locked_by text,
       locked_at timestamptz,
       started_at timestamptz,
       completed_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await exec(
    "jobs status CHECK",
    `DO $$ BEGIN
       ALTER TABLE jobs ADD CONSTRAINT chk_jobs_status
         CHECK (status IN ('pending','running','succeeded','failed','dead','cancelled'));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  // Hot path: workers claim by (status='pending' AND run_after <= now())
  // ordered by priority DESC, run_after ASC. Partial index keeps this small.
  await exec(
    "jobs claim index",
    `CREATE INDEX IF NOT EXISTS idx_jobs_claim
       ON jobs (priority DESC, run_after ASC)
       WHERE status = 'pending'`,
  )
  await exec(
    "jobs status index",
    `CREATE INDEX IF NOT EXISTS idx_jobs_status_created
       ON jobs (status, created_at DESC)`,
  )
  await exec(
    "jobs type index",
    `CREATE INDEX IF NOT EXISTS idx_jobs_type
       ON jobs (type, status)`,
  )
  await exec(
    "jobs updated_at trigger",
    `DO $$ BEGIN
       CREATE TRIGGER trg_jobs_updated_at
         BEFORE UPDATE ON jobs
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  )

  // ─── Summary ────────────────────────────────────────────────────────
  console.log("\n✅ Khat Brain foundation migration complete.\n")

  for (const tbl of [
    "episode_intelligence_records",
    "eir_phase_transitions",
    "ai_runs",
    "jobs",
  ]) {
    const r = (await db!.execute(
      sql.raw(`SELECT count(*)::int AS c FROM ${tbl}`),
    )) as unknown as { rows: Array<{ c: number }> }
    console.log(`  ${tbl}: ${r.rows[0]?.c ?? 0} rows`)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error("❌ migration failed:", e)
  process.exit(1)
})
