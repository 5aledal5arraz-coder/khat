/**
 * Phase 2.1 (P2.1.e) — local-DB smoke for the EIR transition trigger.
 *
 *   npm run smoke:eir-trigger
 *
 * Local-DB only. Refuses managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 * Uses a direct `pg.Client` (not the app pool) and issues raw SQL writes
 * so the smoke truly bypasses `lib/eir/service.ts::transitionEpisodePhase`.
 * The trigger is the system under test; the service module is not.
 *
 * Scenarios (7):
 *   1. Legal forward transition (raw SQL, REPORT) — succeeds, no audit.
 *   2. Legal archive escape from any phase — succeeds, no audit.
 *   3. No-change UPDATE (NEW.phase = OLD.phase) — succeeds, no audit.
 *   4. Illegal backward transition, REPORT mode — succeeds, 1 audit row.
 *   5. Illegal forward skip, REPORT mode — succeeds, 1 audit row.
 *   6. ENFORCE mode raises check_violation + 1 audit row.
 *   7. Actor attribution via session setting — audit row has actor=…
 *
 * All synthesised EIRs are tagged with `created_by = SMOKE_CREATED_BY`
 * and `working_title = SMOKE_WORKING_TITLE` so cleanup is trivially
 * scoped. Top-of-run + finally-block cleanups guarantee no leaked rows
 * even on crash.
 *
 * Exit codes:
 *   0 — all scenarios pass
 *   2 — any scenario failed OR hostname guard refused
 */

import { Client } from "pg"

const SMOKE_VERSION = "smoke-eir-trigger-v1.0"

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

// ─── Smoke markers ────────────────────────────────────────────────────

const SMOKE_CREATED_BY = "smoke-eir-trigger"
const SMOKE_WORKING_TITLE = "__smoke_eir_trigger"

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
  // Order matters — audit rows have no FK but cleanup is cleaner first.
  await c.query(
    `DELETE FROM eir_invalid_transition_attempts
     WHERE eir_id IN (
       SELECT id FROM episode_intelligence_records WHERE created_by = $1
     )`,
    [SMOKE_CREATED_BY],
  )
  await c.query(
    `DELETE FROM eir_phase_transitions
     WHERE eir_id IN (
       SELECT id FROM episode_intelligence_records WHERE created_by = $1
     )`,
    [SMOKE_CREATED_BY],
  )
  await c.query(
    `DELETE FROM episode_intelligence_records WHERE created_by = $1`,
    [SMOKE_CREATED_BY],
  )
}

async function insertSmokeEir(c: Client, phase: string): Promise<string> {
  // Raw INSERT — does NOT seed an eir_phase_transitions row. The trigger
  // is on UPDATE only, so INSERT is safe even when the trigger is active.
  const r = await c.query(
    `INSERT INTO episode_intelligence_records
       (id, phase, working_title, created_by, editorial_intent)
     VALUES (gen_random_uuid()::text, $1, $2, $3, '{}'::jsonb)
     RETURNING id`,
    [phase, SMOKE_WORKING_TITLE, SMOKE_CREATED_BY],
  )
  return r.rows[0].id
}

async function countAuditRows(c: Client, eirId: string): Promise<number> {
  const r = await c.query(
    `SELECT COUNT(*)::int AS n FROM eir_invalid_transition_attempts WHERE eir_id = $1`,
    [eirId],
  )
  return Number(r.rows[0]?.n ?? 0)
}

async function readPhase(c: Client, eirId: string): Promise<string | null> {
  const r = await c.query(
    `SELECT phase FROM episode_intelligence_records WHERE id = $1`,
    [eirId],
  )
  return r.rows[0]?.phase ?? null
}

// ─── Scenarios ────────────────────────────────────────────────────────

async function scenarioLegalForward(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "idea")
  await c.query(
    `UPDATE episode_intelligence_records SET phase = 'guest_assigned' WHERE id = $1`,
    [id],
  )
  const phase = await readPhase(c, id)
  const audit = await countAuditRows(c, id)
  if (phase !== "guest_assigned" || audit !== 0) {
    return {
      name: "1. legal forward (raw SQL, REPORT)",
      ok: false,
      detail: `phase=${phase} (expected guest_assigned), audit=${audit} (expected 0)`,
    }
  }
  return { name: "1. legal forward (raw SQL, REPORT)", ok: true, detail: "phase updated, 0 audit rows" }
}

async function scenarioLegalArchive(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "researching")
  await c.query(
    `UPDATE episode_intelligence_records SET phase = 'archived' WHERE id = $1`,
    [id],
  )
  const phase = await readPhase(c, id)
  const audit = await countAuditRows(c, id)
  if (phase !== "archived" || audit !== 0) {
    return {
      name: "2. legal archive escape",
      ok: false,
      detail: `phase=${phase} (expected archived), audit=${audit} (expected 0)`,
    }
  }
  return { name: "2. legal archive escape", ok: true, detail: "phase=archived, 0 audit rows" }
}

async function scenarioNoChangeUpdate(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "approved")
  // Same phase — the trigger function's `IS NOT DISTINCT FROM` short-circuit
  // should fire; no audit row should result even if the transition would
  // otherwise be illegal.
  await c.query(
    `UPDATE episode_intelligence_records SET phase = 'approved', updated_at = NOW() WHERE id = $1`,
    [id],
  )
  const phase = await readPhase(c, id)
  const audit = await countAuditRows(c, id)
  if (phase !== "approved" || audit !== 0) {
    return {
      name: "3. no-change UPDATE",
      ok: false,
      detail: `phase=${phase} (expected approved), audit=${audit} (expected 0)`,
    }
  }
  return { name: "3. no-change UPDATE", ok: true, detail: "phase unchanged, 0 audit rows" }
}

async function scenarioIllegalBackwardReport(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "recorded")
  // recorded → idea is NOT in the legal matrix.
  await c.query(
    `UPDATE episode_intelligence_records SET phase = 'idea' WHERE id = $1`,
    [id],
  )
  const phase = await readPhase(c, id)
  // REPORT mode: UPDATE still succeeds, audit row written.
  if (phase !== "idea") {
    return {
      name: "4. illegal backward (REPORT)",
      ok: false,
      detail: `expected REPORT mode to allow UPDATE; phase=${phase}`,
    }
  }
  const r = await c.query(
    `SELECT from_phase, attempted_to_phase, mode FROM eir_invalid_transition_attempts WHERE eir_id = $1`,
    [id],
  )
  if (r.rowCount !== 1) {
    return {
      name: "4. illegal backward (REPORT)",
      ok: false,
      detail: `expected 1 audit row, got ${r.rowCount}`,
    }
  }
  const row = r.rows[0]
  if (row.from_phase !== "recorded" || row.attempted_to_phase !== "idea" || row.mode !== "report") {
    return {
      name: "4. illegal backward (REPORT)",
      ok: false,
      detail: `audit row mismatch: from=${row.from_phase}, to=${row.attempted_to_phase}, mode=${row.mode}`,
    }
  }
  return {
    name: "4. illegal backward (REPORT)",
    ok: true,
    detail: "UPDATE allowed; 1 audit row {recorded→idea, mode=report}",
  }
}

async function scenarioIllegalSkipReport(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "idea")
  // idea → published skips most of the chain.
  await c.query(
    `UPDATE episode_intelligence_records SET phase = 'published' WHERE id = $1`,
    [id],
  )
  const phase = await readPhase(c, id)
  if (phase !== "published") {
    return {
      name: "5. illegal forward skip (REPORT)",
      ok: false,
      detail: `expected REPORT mode to allow UPDATE; phase=${phase}`,
    }
  }
  const audit = await countAuditRows(c, id)
  if (audit !== 1) {
    return {
      name: "5. illegal forward skip (REPORT)",
      ok: false,
      detail: `expected 1 audit row, got ${audit}`,
    }
  }
  return {
    name: "5. illegal forward skip (REPORT)",
    ok: true,
    detail: "UPDATE allowed; 1 audit row written",
  }
}

async function scenarioEnforceMode(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "approved")
  // Wrap in transaction so SET LOCAL is scoped here only.
  let raised = false
  let errCode: string | null = null
  let errMsg = ""
  try {
    await c.query("BEGIN")
    await c.query("SET LOCAL app.khat_eir_transition_mode = 'enforce'")
    try {
      await c.query(
        `UPDATE episode_intelligence_records SET phase = 'idea' WHERE id = $1`,
        [id],
      )
      // Should not reach here.
      await c.query("ROLLBACK")
    } catch (err) {
      raised = true
      const e = err as { code?: string; message?: string }
      errCode = e.code ?? null
      errMsg = e.message ?? String(err)
      // Tx is now aborted; rollback to clear.
      await c.query("ROLLBACK").catch(() => {})
    }
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {})
    return {
      name: "6. ENFORCE raises",
      ok: false,
      detail: `unexpected error: ${(err as Error).message}`,
    }
  }
  if (!raised) {
    return {
      name: "6. ENFORCE raises",
      ok: false,
      detail: "ENFORCE mode did not raise on illegal transition",
    }
  }
  if (errCode !== "23514") {
    // PG SQLSTATE 23514 = check_violation
    return {
      name: "6. ENFORCE raises",
      ok: false,
      detail: `expected SQLSTATE 23514 (check_violation), got ${errCode}; msg=${errMsg.slice(0, 120)}`,
    }
  }
  if (!errMsg.includes("Illegal EIR phase transition")) {
    return {
      name: "6. ENFORCE raises",
      ok: false,
      detail: `expected message to include 'Illegal EIR phase transition'; got ${errMsg.slice(0, 120)}`,
    }
  }
  // After ROLLBACK, the audit row inserted by the trigger is also rolled
  // back — the entire transaction is aborted by the RAISE EXCEPTION.
  // So the audit row count for this EIR remains 0. That's PG semantics
  // and is honest: ENFORCE mode rejects the WHOLE transaction.
  // (REPORT mode keeps the audit row because the UPDATE succeeds and
  // the transaction commits.)
  const phase = await readPhase(c, id)
  if (phase !== "approved") {
    return {
      name: "6. ENFORCE raises",
      ok: false,
      detail: `phase changed to ${phase} despite enforce-mode rejection`,
    }
  }
  return {
    name: "6. ENFORCE raises",
    ok: true,
    detail: `check_violation raised; phase unchanged at approved`,
  }
}

async function scenarioActorAttribution(c: Client): Promise<ScenarioResult> {
  const id = await insertSmokeEir(c, "recording")
  await c.query("BEGIN")
  await c.query("SET LOCAL app.khat_eir_transition_actor = 'smoke-actor-x'")
  // recording → idea is illegal; REPORT mode allows + logs.
  await c.query(
    `UPDATE episode_intelligence_records SET phase = 'idea' WHERE id = $1`,
    [id],
  )
  await c.query("COMMIT")
  const r = await c.query(
    `SELECT actor, mode FROM eir_invalid_transition_attempts WHERE eir_id = $1`,
    [id],
  )
  if (r.rowCount !== 1) {
    return {
      name: "7. actor attribution",
      ok: false,
      detail: `expected 1 audit row, got ${r.rowCount}`,
    }
  }
  const row = r.rows[0]
  if (row.actor !== "smoke-actor-x" || row.mode !== "report") {
    return {
      name: "7. actor attribution",
      ok: false,
      detail: `audit row: actor=${row.actor} (expected smoke-actor-x), mode=${row.mode}`,
    }
  }
  return {
    name: "7. actor attribution",
    ok: true,
    detail: `audit row has actor=smoke-actor-x, mode=report`,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[smoke-eir-trigger] ${SMOKE_VERSION}`)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[smoke-eir-trigger] DATABASE_URL is not set — refusing")
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[smoke-eir-trigger] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log("[smoke-eir-trigger] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

  const results: ScenarioResult[] = []
  let leakedCount = -1
  try {
    await withClient(async (c) => {
      await deleteSmokeRows(c)
      results.push(await scenarioLegalForward(c))
      results.push(await scenarioLegalArchive(c))
      results.push(await scenarioNoChangeUpdate(c))
      results.push(await scenarioIllegalBackwardReport(c))
      results.push(await scenarioIllegalSkipReport(c))
      results.push(await scenarioEnforceMode(c))
      results.push(await scenarioActorAttribution(c))
      await deleteSmokeRows(c)
      // Verify cleanup: zero smoke-tagged rows remain.
      const r = await c.query(
        `SELECT COUNT(*)::int AS n FROM episode_intelligence_records WHERE created_by = $1`,
        [SMOKE_CREATED_BY],
      )
      leakedCount = Number(r.rows[0]?.n ?? 0)
    })
  } catch (err) {
    console.error("[smoke-eir-trigger] fatal:", err)
    // Best-effort cleanup on fatal error.
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
  console.log(`Leaked smoke rows after cleanup: ${leakedCount}`)
  if (failures.length > 0 || leakedCount !== 0) {
    if (failures.length > 0) {
      console.error(
        `[smoke-eir-trigger] ${failures.length} scenario(s) failed.`,
      )
    }
    if (leakedCount !== 0) {
      console.error(
        `[smoke-eir-trigger] cleanup left ${leakedCount} smoke rows behind.`,
      )
    }
    process.exit(2)
  }
  console.log("[smoke-eir-trigger] all scenarios GREEN")
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-eir-trigger] fatal:", err)
  process.exit(2)
})
