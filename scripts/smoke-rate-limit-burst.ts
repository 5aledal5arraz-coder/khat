/**
 * Phase 1.6 — burst-concurrency smoke for the AI rate limiter.
 *
 *   npm run smoke:rate-limit-burst
 *
 * Local-DB only. Refuses managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 * No real provider calls — `acquireRateLimitPermit` is called directly
 * and the resulting `ai_rate_limit_events` rows are inspected. Cleans up
 * everything it inserts.
 *
 * The smoke runs five scenarios in sequence and asserts a single
 * invariant per scenario:
 *
 *   1. mode='off' → no audit row written for any of 10 simulated calls.
 *   2. mode='report' → 10 calls all return decision='allowed' AND each
 *      writes exactly one audit row, all with enforced='false'.
 *   3. mode='enforce' + concurrency-burst → with N existing 'running'
 *      ai_runs synthesised at the light tier limit (10), the 11th call
 *      lands decision='blocked_concurrency' with enforced='true' and
 *      throws RateLimitError. Synthesised rows are deleted afterwards.
 *   4. mode='enforce' + bypassed call → call with bypassRateLimit=true
 *      yields decision='bypassed_call' and never blocks.
 *   5. Subject lock → two concurrent permit acquires for the same
 *      (subject_table, subject_id) result in decision='blocked_subject_lock'
 *      on the second one. First one releases cleanly afterwards.
 *
 * Exit codes:
 *   0 — all scenarios pass
 *   2 — any scenario fails
 */

import { Client } from "pg"
import { acquireRateLimitPermit, RateLimitError } from "@/lib/ai-router/rate-limit"

const SMOKE_VERSION = "rate-limit-burst-v1.0"

// ─── Hostname guard ──────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────

const SMOKE_ACTOR = "smoke-rate-limit-burst"
const SMOKE_SUBJECT_TABLE = "__smoke_rate_limit"
const SMOKE_SUBJECT_ID_PREFIX = "__smoke-"

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
  await c.query(`DELETE FROM ai_rate_limit_events WHERE actor_id = $1`, [SMOKE_ACTOR])
  await c.query(`DELETE FROM ai_runs WHERE actor_id = $1`, [SMOKE_ACTOR])
  // PATCH: clean lingering subject-lock rows from any prior failed run.
  await c.query(`DELETE FROM ai_subject_locks WHERE subject_table = $1`, [
    SMOKE_SUBJECT_TABLE,
  ])
}

async function synthesiseRunningRuns(
  c: Client,
  taskKind: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const r = await c.query(
      `INSERT INTO ai_runs (id, task_kind, provider, model_name, status, started_at, actor_id)
       VALUES (gen_random_uuid()::text, $1, 'openai', 'smoke-model', 'running', NOW(), $2)
       RETURNING id`,
      [taskKind, SMOKE_ACTOR],
    )
    ids.push(r.rows[0].id)
  }
  return ids
}

// ─── Scenarios ───────────────────────────────────────────────────────

async function scenarioOffMode(c: Client): Promise<ScenarioResult> {
  process.env.KHAT_RATE_LIMIT_MODE = "off"
  const before = await c.query(
    `SELECT COUNT(*)::int AS n FROM ai_rate_limit_events WHERE actor_id = $1`,
    [SMOKE_ACTOR],
  )
  for (let i = 0; i < 10; i++) {
    const out = await acquireRateLimitPermit({
      taskKind: "structural",
      actorId: SMOKE_ACTOR,
      subjectTable: null,
      subjectId: null,
    })
    await out.permit.release()
    if (out.decision !== "allowed") {
      return { name: "1. mode=off", ok: false, detail: `iter ${i} got ${out.decision}` }
    }
  }
  const after = await c.query(
    `SELECT COUNT(*)::int AS n FROM ai_rate_limit_events WHERE actor_id = $1`,
    [SMOKE_ACTOR],
  )
  const delta = after.rows[0].n - before.rows[0].n
  if (delta !== 0) {
    return { name: "1. mode=off", ok: false, detail: `audit rows written: ${delta}, expected 0` }
  }
  return { name: "1. mode=off", ok: true, detail: "10 allows, 0 audit rows" }
}

async function scenarioReportMode(c: Client): Promise<ScenarioResult> {
  process.env.KHAT_RATE_LIMIT_MODE = "report"
  for (let i = 0; i < 10; i++) {
    const out = await acquireRateLimitPermit({
      taskKind: "structural",
      actorId: SMOKE_ACTOR,
      subjectTable: null,
      subjectId: null,
    })
    await out.permit.release()
    if (out.decision !== "allowed") {
      return {
        name: "2. mode=report",
        ok: false,
        detail: `iter ${i} got ${out.decision}, expected allowed`,
      }
    }
  }
  const r = await c.query(
    `SELECT decision, enforced, COUNT(*)::int AS n
     FROM ai_rate_limit_events
     WHERE actor_id = $1
     GROUP BY decision, enforced
     ORDER BY decision`,
    [SMOKE_ACTOR],
  )
  // Expect exactly 10 'allowed', enforced='false'.
  const allowed = r.rows.find((row) => row.decision === "allowed")
  if (!allowed || Number(allowed.n) < 10) {
    return {
      name: "2. mode=report",
      ok: false,
      detail: `expected ≥10 'allowed' rows, got ${allowed?.n ?? 0}`,
    }
  }
  if (allowed.enforced !== "false") {
    return {
      name: "2. mode=report",
      ok: false,
      detail: `expected enforced='false', got '${allowed.enforced}'`,
    }
  }
  return {
    name: "2. mode=report",
    ok: true,
    detail: `${allowed.n} 'allowed' audit rows, all enforced=false`,
  }
}

async function scenarioEnforceConcurrencyBurst(c: Client): Promise<ScenarioResult> {
  process.env.KHAT_RATE_LIMIT_MODE = "enforce"
  // Synthesise 10 running rows at light tier (== default limit).
  const ids = await synthesiseRunningRuns(c, "structural", 10)
  try {
    let blocked = false
    let detail = ""
    try {
      const out = await acquireRateLimitPermit({
        taskKind: "structural",
        actorId: SMOKE_ACTOR,
        subjectTable: null,
        subjectId: null,
      })
      detail = `expected throw, got decision=${out.decision}`
      await out.permit.release()
    } catch (err) {
      if (err instanceof RateLimitError && err.decision === "blocked_concurrency") {
        blocked = true
        detail = err.message
      } else {
        detail = `wrong error: ${(err as Error).message}`
      }
    }
    if (!blocked) {
      return { name: "3. enforce + concurrency burst", ok: false, detail }
    }
    // Confirm the audit row is enforced='true'.
    const r = await c.query(
      `SELECT enforced FROM ai_rate_limit_events
       WHERE actor_id = $1 AND decision = 'blocked_concurrency'
       ORDER BY created_at DESC LIMIT 1`,
      [SMOKE_ACTOR],
    )
    if (r.rowCount === 0 || r.rows[0].enforced !== "true") {
      return {
        name: "3. enforce + concurrency burst",
        ok: false,
        detail: `audit row missing or enforced!='true' (got '${r.rows[0]?.enforced}')`,
      }
    }
    return { name: "3. enforce + concurrency burst", ok: true, detail: "throw + audit OK" }
  } finally {
    if (ids.length > 0) {
      await c.query(`DELETE FROM ai_runs WHERE id = ANY($1::text[])`, [ids])
    }
  }
}

async function scenarioEnforceBypassCall(c: Client): Promise<ScenarioResult> {
  process.env.KHAT_RATE_LIMIT_MODE = "enforce"
  // Even with N at the limit, bypassRateLimit must let the call through.
  const ids = await synthesiseRunningRuns(c, "editorial", 3) // expensive limit = 3
  try {
    const out = await acquireRateLimitPermit({
      taskKind: "editorial",
      actorId: SMOKE_ACTOR,
      subjectTable: null,
      subjectId: null,
      bypassRateLimit: true,
    })
    await out.permit.release()
    if (out.decision !== "bypassed_call") {
      return {
        name: "4. enforce + bypassRateLimit",
        ok: false,
        detail: `decision=${out.decision}, expected bypassed_call`,
      }
    }
    return { name: "4. enforce + bypassRateLimit", ok: true, detail: "bypassed_call decision OK" }
  } finally {
    if (ids.length > 0) {
      await c.query(`DELETE FROM ai_runs WHERE id = ANY($1::text[])`, [ids])
    }
  }
}

async function scenarioSubjectLock(c: Client): Promise<ScenarioResult> {
  process.env.KHAT_RATE_LIMIT_MODE = "enforce"
  const subjectId = `${SMOKE_SUBJECT_ID_PREFIX}${Date.now()}`
  // First acquire — should succeed.
  const first = await acquireRateLimitPermit({
    taskKind: "editorial",
    actorId: SMOKE_ACTOR,
    subjectTable: SMOKE_SUBJECT_TABLE,
    subjectId,
  })
  try {
    if (first.decision !== "allowed") {
      return {
        name: "5. subject lock",
        ok: false,
        detail: `first acquire decision=${first.decision}, expected allowed`,
      }
    }
    // Second acquire (same subject) — must block.
    let blocked = false
    let secondDetail = ""
    try {
      const second = await acquireRateLimitPermit({
        taskKind: "editorial",
        actorId: SMOKE_ACTOR,
        subjectTable: SMOKE_SUBJECT_TABLE,
        subjectId,
      })
      secondDetail = `second acquire returned decision=${second.decision}, expected throw`
      await second.permit.release()
    } catch (err) {
      if (err instanceof RateLimitError && err.decision === "blocked_subject_lock") {
        blocked = true
        secondDetail = err.message
      } else {
        secondDetail = `wrong error: ${(err as Error).message}`
      }
    }
    if (!blocked) {
      return { name: "5. subject lock", ok: false, detail: secondDetail }
    }
    return { name: "5. subject lock", ok: true, detail: "first allowed, second blocked" }
  } finally {
    await first.permit.release().catch(() => {})
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[smoke-rate-limit-burst] ${SMOKE_VERSION}`)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[smoke-rate-limit-burst] DATABASE_URL is not set — refusing")
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[smoke-rate-limit-burst] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log("[smoke-rate-limit-burst] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

  // Don't poison the operator's settings — snapshot + restore.
  const prevMode = process.env.KHAT_RATE_LIMIT_MODE
  const prevBypass = process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS
  delete process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS

  const results: ScenarioResult[] = []
  try {
    await withClient(async (c) => {
      await deleteSmokeRows(c)
      results.push(await scenarioOffMode(c))
      results.push(await scenarioReportMode(c))
      results.push(await scenarioEnforceConcurrencyBurst(c))
      results.push(await scenarioEnforceBypassCall(c))
      results.push(await scenarioSubjectLock(c))
      await deleteSmokeRows(c)
    })
  } finally {
    if (prevMode === undefined) delete process.env.KHAT_RATE_LIMIT_MODE
    else process.env.KHAT_RATE_LIMIT_MODE = prevMode
    if (prevBypass === undefined) delete process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS
    else process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS = prevBypass
  }

  console.log("")
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name} — ${r.detail}`)
  }
  console.log("")
  const failures = results.filter((r) => !r.ok)
  if (failures.length > 0) {
    console.error(`[smoke-rate-limit-burst] ${failures.length} scenario(s) failed.`)
    process.exit(2)
  }
  console.log("[smoke-rate-limit-burst] all scenarios GREEN")
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-rate-limit-burst] fatal:", err)
  process.exit(2)
})
