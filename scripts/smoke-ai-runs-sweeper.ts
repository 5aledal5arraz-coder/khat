/**
 * Phase 2.1 (P2.1.c) — local-DB smoke for the stale-running sweeper.
 *
 *   npm run smoke:ai-runs-sweeper
 *
 * Local-DB only. Refuses managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 * No real provider calls — `runAiRunsSweep()` is invoked synchronously
 * and we inspect the affected rows directly. Self-cleaning.
 *
 * The smoke runs 6 scenarios in sequence and asserts a single invariant
 * per scenario:
 *
 *   1. Dry-run on a clean fixture finds zero of OUR rows.
 *   2. With 3 synthesised stale rows, dry-run reports `candidates ≥ 3`
 *      AND all 3 of OUR rows remain `status='running'`.
 *   3. --confirm flips all 3 of OUR rows to `timed_out, error_class=
 *      stale_sweep, error_message=…`.
 *   4. maxRows cap is honoured: with 5 stale rows + maxRows=2, exactly
 *      2 of OUR rows become `timed_out` and 3 stay `running`.
 *   5. An orphan ai_subject_locks row (>= 10 min old) gets deleted by
 *      the sweeper.
 *   6. Re-run after cleanup finds zero of OUR remaining rows / locks.
 *
 * Synthesised rows are tagged with `actor_id = SMOKE_ACTOR` so all
 * assertions and cleanups can be scoped to this smoke and ignore any
 * other stale rows that might exist on the operator's DB.
 *
 * Exit codes:
 *   0 — all scenarios pass
 *   2 — any scenario fails OR hostname guard refused
 */

import { Client } from "pg"
import {
  runAiRunsSweep,
  SWEEP_ERROR_CLASS,
} from "@/lib/jobs/handlers/ai-runs-sweeper"

const SMOKE_VERSION = "ai-runs-sweeper-smoke-v1.0"

// ─── Hostname guard (mirrors prior smokes) ────────────────────────────

const PRODUCTION_HOSTNAME_PATTERNS: RegExp[] = [
  /\.ondigitalocean\.com/i,
  /\.rds\.amazonaws\.com/i,
  /\.supabase\.co/i,
  /\.neon\.tech/i,
  /\.railway\.app/i,
  /\.heroku\.com/i,
  /\.azure\.com/i,
]

function isLocalConnection(s: string): { ok: boolean; reason?: string } {
  try {
    const url = new URL(s.replace(/^postgres(ql)?:\/\//, "http://"))
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return { ok: true }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) return { ok: false, reason: `hostname ${host} matches production pattern ${pat}.` }
    }
    return { ok: false, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return { ok: false, reason: `could not parse DATABASE_URL: ${(err as Error).message}` }
  }
}

// ─── Smoke markers + helpers ──────────────────────────────────────────

const SMOKE_ACTOR = "smoke-ai-runs-sweeper"
const SMOKE_SUBJECT_TABLE = "__smoke_sweeper"
const STALE_MIN = 20 // 20 minutes — comfortably past the 15-min default

interface ScenarioResult {
  name: string
  ok: boolean
  detail: string
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end().catch(() => {})
  }
}

async function deleteSmokeRows(c: Client): Promise<void> {
  await c.query(`DELETE FROM ai_runs WHERE actor_id = $1`, [SMOKE_ACTOR])
  await c.query(`DELETE FROM ai_subject_locks WHERE subject_table = $1`, [
    SMOKE_SUBJECT_TABLE,
  ])
}

async function synthesiseStaleRows(c: Client, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const r = await c.query(
      `INSERT INTO ai_runs (
         id, task_kind, provider, model_name, status, started_at, actor_id
       )
       VALUES (gen_random_uuid()::text, 'structural', 'openai', 'smoke-model',
               'running', NOW() - INTERVAL '${STALE_MIN} minutes', $1)
       RETURNING id`,
      [SMOKE_ACTOR],
    )
    ids.push(r.rows[0].id)
  }
  return ids
}

async function insertStaleSubjectLock(c: Client, subjectId: string): Promise<void> {
  await c.query(
    `INSERT INTO ai_subject_locks
       (id, subject_table, subject_id, acquired_at, owner_token)
     VALUES (gen_random_uuid()::text, $1, $2,
             NOW() - INTERVAL '15 minutes', 'smoke-token')`,
    [SMOKE_SUBJECT_TABLE, subjectId],
  )
}

async function countSmokeRows(
  c: Client,
  predicate: { status?: string; errorClass?: string | null },
): Promise<number> {
  const parts: string[] = [`actor_id = $1`]
  const args: unknown[] = [SMOKE_ACTOR]
  if (predicate.status !== undefined) {
    args.push(predicate.status)
    parts.push(`status = $${args.length}`)
  }
  if (predicate.errorClass !== undefined) {
    if (predicate.errorClass === null) {
      parts.push(`error_class IS NULL`)
    } else {
      args.push(predicate.errorClass)
      parts.push(`error_class = $${args.length}`)
    }
  }
  const r = await c.query(
    `SELECT COUNT(*)::int AS n FROM ai_runs WHERE ${parts.join(" AND ")}`,
    args,
  )
  return Number(r.rows[0]?.n ?? 0)
}

async function countSmokeLocks(c: Client): Promise<number> {
  const r = await c.query(
    `SELECT COUNT(*)::int AS n FROM ai_subject_locks WHERE subject_table = $1`,
    [SMOKE_SUBJECT_TABLE],
  )
  return Number(r.rows[0]?.n ?? 0)
}

// ─── Scenarios ────────────────────────────────────────────────────────

async function scenarioCleanDryRun(c: Client): Promise<ScenarioResult> {
  // Pre-condition: zero smoke rows.
  const pre = await countSmokeRows(c, { status: "running" })
  if (pre !== 0) {
    return {
      name: "1. clean dry-run",
      ok: false,
      detail: `pre-condition failed: ${pre} smoke rows still present`,
    }
  }
  const r = await runAiRunsSweep({ dryRun: true })
  if (r.dry_run !== true) {
    return { name: "1. clean dry-run", ok: false, detail: "dry_run flag not true" }
  }
  // We can't assert global candidates=0 (other stale rows may exist),
  // but we can assert no smoke rows were touched.
  const post = await countSmokeRows(c, { status: "running" })
  if (post !== 0) {
    return {
      name: "1. clean dry-run",
      ok: false,
      detail: `dry-run wrote ${post} smoke rows (should be 0)`,
    }
  }
  return { name: "1. clean dry-run", ok: true, detail: "no mutation, no smoke rows" }
}

async function scenarioDryRunFindsCandidates(c: Client): Promise<ScenarioResult> {
  const ids = await synthesiseStaleRows(c, 3)
  if (ids.length !== 3) {
    return {
      name: "2. dry-run finds candidates",
      ok: false,
      detail: `synthesis failed: only ${ids.length} of 3 rows inserted`,
    }
  }
  const r = await runAiRunsSweep({ dryRun: true })
  if (r.ai_runs.candidates < 3) {
    return {
      name: "2. dry-run finds candidates",
      ok: false,
      detail: `expected candidates >= 3, got ${r.ai_runs.candidates}`,
    }
  }
  // Critical: dry-run must NOT mutate our synthesised rows.
  const stillRunning = await countSmokeRows(c, { status: "running" })
  if (stillRunning !== 3) {
    return {
      name: "2. dry-run finds candidates",
      ok: false,
      detail: `dry-run mutated rows: ${stillRunning} of 3 still running`,
    }
  }
  return {
    name: "2. dry-run finds candidates",
    ok: true,
    detail: `candidates>=3, 3/3 still running`,
  }
}

async function scenarioConfirmReclaims(c: Client): Promise<ScenarioResult> {
  // Continues from #2 — 3 synthesised rows already in place.
  const r = await runAiRunsSweep({ dryRun: false })
  if (r.dry_run !== false) {
    return { name: "3. --confirm reclaims", ok: false, detail: "dry_run flag should be false" }
  }
  const reclaimed = await countSmokeRows(c, {
    status: "timed_out",
    errorClass: SWEEP_ERROR_CLASS,
  })
  if (reclaimed !== 3) {
    return {
      name: "3. --confirm reclaims",
      ok: false,
      detail: `expected 3 rows timed_out with error_class=${SWEEP_ERROR_CLASS}, got ${reclaimed}`,
    }
  }
  const stillRunning = await countSmokeRows(c, { status: "running" })
  if (stillRunning !== 0) {
    return {
      name: "3. --confirm reclaims",
      ok: false,
      detail: `${stillRunning} smoke rows still running after --confirm`,
    }
  }
  // Cleanup before next scenario.
  await deleteSmokeRows(c)
  return { name: "3. --confirm reclaims", ok: true, detail: "3/3 reclaimed, 0 still running" }
}

async function scenarioMaxRowsCap(c: Client): Promise<ScenarioResult> {
  await deleteSmokeRows(c)
  const ids = await synthesiseStaleRows(c, 5)
  if (ids.length !== 5) {
    return {
      name: "4. maxRows cap",
      ok: false,
      detail: `synthesis failed: only ${ids.length} of 5 rows inserted`,
    }
  }
  const r = await runAiRunsSweep({ dryRun: false, maxRows: 2 })
  if (r.ai_runs.reclaimed > 2) {
    return {
      name: "4. maxRows cap",
      ok: false,
      detail: `expected reclaimed <= 2, got ${r.ai_runs.reclaimed}`,
    }
  }
  const smokeReclaimed = await countSmokeRows(c, {
    status: "timed_out",
    errorClass: SWEEP_ERROR_CLASS,
  })
  const smokeStillRunning = await countSmokeRows(c, { status: "running" })
  if (smokeReclaimed !== 2 || smokeStillRunning !== 3) {
    return {
      name: "4. maxRows cap",
      ok: false,
      detail: `expected 2 reclaimed + 3 running, got ${smokeReclaimed} + ${smokeStillRunning}`,
    }
  }
  await deleteSmokeRows(c)
  return {
    name: "4. maxRows cap",
    ok: true,
    detail: "2 reclaimed (cap honoured), 3 still running",
  }
}

async function scenarioOrphanSubjectLock(c: Client): Promise<ScenarioResult> {
  await deleteSmokeRows(c)
  const subjectId = `lock-test-${Date.now()}`
  await insertStaleSubjectLock(c, subjectId)
  const pre = await countSmokeLocks(c)
  if (pre !== 1) {
    return {
      name: "5. orphan subject lock",
      ok: false,
      detail: `pre-condition failed: ${pre} smoke locks (expected 1)`,
    }
  }
  const r = await runAiRunsSweep({ dryRun: false })
  if (r.ai_subject_locks.deleted < 1) {
    return {
      name: "5. orphan subject lock",
      ok: false,
      detail: `expected deleted >= 1, got ${r.ai_subject_locks.deleted}`,
    }
  }
  const post = await countSmokeLocks(c)
  if (post !== 0) {
    return {
      name: "5. orphan subject lock",
      ok: false,
      detail: `${post} smoke locks remain after sweep (expected 0)`,
    }
  }
  return { name: "5. orphan subject lock", ok: true, detail: "lock reclaimed; 0 remain" }
}

async function scenarioIdempotentReRun(c: Client): Promise<ScenarioResult> {
  // Continues from #5: zero smoke rows + zero smoke locks left.
  const r = await runAiRunsSweep({ dryRun: false })
  if (r.dry_run !== false) {
    return { name: "6. idempotent re-run", ok: false, detail: "dry_run flag should be false" }
  }
  const smokeLocks = await countSmokeLocks(c)
  const smokeRunning = await countSmokeRows(c, { status: "running" })
  const smokeReclaimed = await countSmokeRows(c, {
    status: "timed_out",
    errorClass: SWEEP_ERROR_CLASS,
  })
  if (smokeLocks !== 0 || smokeRunning !== 0 || smokeReclaimed !== 0) {
    return {
      name: "6. idempotent re-run",
      ok: false,
      detail: `expected 0/0/0 smoke locks/running/reclaimed, got ${smokeLocks}/${smokeRunning}/${smokeReclaimed}`,
    }
  }
  return { name: "6. idempotent re-run", ok: true, detail: "no smoke artifacts; no-op" }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[smoke-ai-runs-sweeper] ${SMOKE_VERSION}`)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[smoke-ai-runs-sweeper] DATABASE_URL is not set — refusing")
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[smoke-ai-runs-sweeper] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log("[smoke-ai-runs-sweeper] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

  const results: ScenarioResult[] = []
  try {
    await withClient(async (c) => {
      await deleteSmokeRows(c)
      results.push(await scenarioCleanDryRun(c))
      results.push(await scenarioDryRunFindsCandidates(c))
      results.push(await scenarioConfirmReclaims(c))
      results.push(await scenarioMaxRowsCap(c))
      results.push(await scenarioOrphanSubjectLock(c))
      results.push(await scenarioIdempotentReRun(c))
      await deleteSmokeRows(c)
    })
  } catch (err) {
    console.error("[smoke-ai-runs-sweeper] fatal:", err)
    // Best-effort cleanup even on fatal error.
    try {
      await withClient(async (c) => deleteSmokeRows(c))
    } catch {
      // ignore
    }
    process.exit(2)
  }

  console.log("")
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name} — ${r.detail}`)
  }
  console.log("")
  const failures = results.filter((r) => !r.ok)
  if (failures.length > 0) {
    console.error(
      `[smoke-ai-runs-sweeper] ${failures.length} scenario(s) failed.`,
    )
    process.exit(2)
  }
  console.log("[smoke-ai-runs-sweeper] all scenarios GREEN")
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-ai-runs-sweeper] fatal:", err)
  process.exit(2)
})
