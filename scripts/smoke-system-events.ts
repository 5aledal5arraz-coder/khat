/**
 * Phase 2.3 (P2.3.b) — local-DB smoke for the `system_events` emit path.
 *
 *   npm run smoke:system-events
 *
 * Local-DB only. Refuses managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 *
 * P2.3.b ships the EIR writer; jobs/router/rate-limit/sweeper writers
 * land in P2.3.c–P2.3.d. This smoke is the same file across sub-phases —
 * it grows by appending scenarios as each writer lands.
 *
 * P2.3.b scenarios:
 *
 *   1. createEpisodeIntelligenceRecord emits one row
 *      (from_phase=null, to_phase='idea').
 *   2. transitionEpisodePhase emits one row per legal move.
 *   3. Archive escape (any non-archived phase → archived) emits a
 *      normal info row.
 *   4. Idempotent no-op (transition to current phase) emits NOTHING.
 *
 * Fire-and-forget contract: the service does `void emitSystemEvent(...)`
 * so the INSERT may land slightly after the service call returns. The
 * smoke polls `system_events` with a short timeout per scenario rather
 * than assuming synchronicity.
 *
 * Self-cleaning. Tagged rows:
 *   • system_events.actor                    = 'smoke-system-events'
 *   • episode_intelligence_records.working_title LIKE 'smoke-system-events-%'
 *   • episode_intelligence_records.created_by = 'smoke-system-events'
 *   • eir_phase_transitions.actor_id          = 'smoke-system-events'
 *
 * Exit codes:
 *   0 — every scenario PASS
 *   2 — any scenario FAIL OR hostname guard refused
 */

import { Client } from "pg"
import {
  createEpisodeIntelligenceRecord,
  transitionEpisodePhase,
} from "@/lib/eir/service"
// P2.3.c — direct queue-call approach (operator §6 Q5 Option B):
// import the queue functions and the system-events builders/emit
// directly, then call them in sequence to mirror what worker.ts does
// in production without spawning a child process.
//
// NOTE: `claimNextJob` is intentionally NOT imported. The production
// `claimNextJob` is global-FIFO with `ORDER BY priority DESC,
// run_after ASC` — so on a non-empty queue it can return a real job
// (e.g. `market.scheduler`, `market.extract`) before our synthetic
// smoke row. We use a smoke-local claim-by-id helper instead (see
// `smokeClaimById` below) which mirrors the production UPDATE but
// scopes the SELECT to the exact id we just enqueued.
import {
  enqueueJob,
  completeJob,
  failJob,
  reclaimStaleJobs,
} from "@/lib/jobs/queue"
import { runAiRunsSweep } from "@/lib/jobs/handlers/ai-runs-sweeper"
// P2.3.d — direct rate-limit policy invocation. Mirrors P1.6's
// rate-limit-burst smoke pattern of mutating KHAT_RATE_LIMIT_MODE for
// the duration of the scenario and restoring it in finally.
import {
  acquireRateLimitPermit,
  RateLimitError,
} from "@/lib/ai-router/rate-limit"
import { emitSystemEvent } from "@/lib/system-events/emit"
import {
  buildJobsClaimedEvent,
  buildJobsSucceededEvent,
  buildJobsFailedEvent,
  buildJobsDeadEvent,
  buildJobsReclaimedEvent,
  buildScheduleCreatedEvent,
  buildAiRouterRejectedEvent,
} from "@/lib/system-events/builders"
// P2.3.e — read API. Scenario 14 exercises it against the corpus
// written by scenarios 1–13.
import {
  listEvents,
  countBySource,
  countBySourceSeverity,
  recentBySubject,
  topErrors,
} from "@/lib/system-events/queries"

const SMOKE_VERSION = "smoke-system-events-v4.0"
const SMOKE_ACTOR = "smoke-system-events"
const SMOKE_TITLE_PREFIX = "smoke-system-events-"
const SMOKE_JOB_TYPE_OK = "smoke-system-events-noop-ok"
const SMOKE_JOB_TYPE_FAIL = "smoke-system-events-noop-fail"
const SMOKE_JOB_TYPE_RECLAIM = "smoke-system-events-reclaim"
const SMOKE_AI_RUNS_ACTOR = "smoke-system-events-ai-runs"
const SMOKE_RATE_LIMIT_ACTOR = "smoke-system-events-rate-limit"

// ─── Hostname guard (mirrors prior P1+ smokes) ────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────

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

async function cleanupSmokeRows(c: Client): Promise<void> {
  // Delete in FK-safe order — system_events has no FKs, but the EIR
  // tables relate to each other.
  await c.query(`DELETE FROM system_events WHERE actor = $1`, [SMOKE_ACTOR])
  await c.query(
    `DELETE FROM eir_phase_transitions
       WHERE eir_id IN (
         SELECT id FROM episode_intelligence_records
         WHERE working_title LIKE $1
       )`,
    [`${SMOKE_TITLE_PREFIX}%`],
  )
  await c.query(
    `DELETE FROM episode_intelligence_records
       WHERE working_title LIKE $1`,
    [`${SMOKE_TITLE_PREFIX}%`],
  )
  // P2.3.c — jobs / ai_runs / ai_subject_locks markers.
  await c.query(`DELETE FROM jobs WHERE type LIKE $1`, [
    `${SMOKE_TITLE_PREFIX}%`,
  ])
  await c.query(`DELETE FROM ai_runs WHERE actor_id = $1`, [
    SMOKE_AI_RUNS_ACTOR,
  ])
  // P2.3.d — rate-limit synthetic ai_runs + audit log + system_events
  // rows tagged with the rate-limit smoke actor.
  await c.query(`DELETE FROM ai_runs WHERE actor_id = $1`, [
    SMOKE_RATE_LIMIT_ACTOR,
  ])
  await c.query(`DELETE FROM ai_rate_limit_events WHERE actor_id = $1`, [
    SMOKE_RATE_LIMIT_ACTOR,
  ])
  await c.query(`DELETE FROM system_events WHERE actor = $1`, [
    SMOKE_RATE_LIMIT_ACTOR,
  ])
}

async function countEventsBySource(
  c: Client,
  source: string,
  sinceMs: number,
): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM system_events
       WHERE source = $1
         AND event_at > NOW() - ($2 || ' milliseconds')::interval`,
    [source, String(sinceMs)],
  )
  return Number(r.rows[0]?.n ?? 0)
}

async function countEventsForJobSubject(
  c: Client,
  jobId: string,
): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM system_events
       WHERE subject_kind = 'job'
         AND subject_id = $1`,
    [jobId],
  )
  return Number(r.rows[0]?.n ?? 0)
}

async function fetchEventsForJobSubject(
  c: Client,
  jobId: string,
): Promise<
  Array<{
    source: string
    event_type: string
    severity: string
    payload: Record<string, unknown>
  }>
> {
  const r = await c.query<{
    source: string
    event_type: string
    severity: string
    payload: Record<string, unknown>
  }>(
    `SELECT source, event_type, severity, payload
       FROM system_events
       WHERE subject_kind = 'job'
         AND subject_id = $1
       ORDER BY event_at ASC, id ASC`,
    [jobId],
  )
  return r.rows
}

async function waitForJobEventCount(
  c: Client,
  jobId: string,
  expected: number,
  timeoutMs = 2000,
): Promise<{ ok: boolean; actual: number }> {
  const start = Date.now()
  let actual = 0
  while (Date.now() - start < timeoutMs) {
    actual = await countEventsForJobSubject(c, jobId)
    if (actual >= expected) return { ok: actual === expected, actual }
    await new Promise((r) => setTimeout(r, 50))
  }
  actual = await countEventsForJobSubject(c, jobId)
  return { ok: actual === expected, actual }
}

/**
 * Smoke-local equivalent of `claimNextJob`, scoped to a single id.
 *
 * Mirrors the production UPDATE in `lib/jobs/queue.ts` `claimNextJob`
 * exactly (status='running', locked_by, locked_at=NOW, started_at=NOW,
 * attempts += 1, updated_at=NOW), but bypasses the global priority
 * SELECT. The smoke needs deterministic isolation — a real
 * `market.scheduler` or `market.extract` already queued in dev would
 * otherwise win the claim race.
 *
 * Returns a minimal row shape sufficient for the smoke (id, type,
 * priority, attempts, max_attempts) — the same fields the smoke
 * forwards into `buildJobsClaimedEvent`. Returns null if the row
 * doesn't exist or was already claimed.
 *
 * IMPORTANT: this helper is local to the smoke. The production
 * `claimNextJob` and queue.ts are untouched.
 */
async function smokeClaimById(
  c: Client,
  jobId: string,
  workerId: string,
): Promise<{
  id: string
  type: string
  priority: number
  attempts: number
  max_attempts: number
} | null> {
  const r = await c.query<{
    id: string
    type: string
    priority: number
    attempts: number
    max_attempts: number
  }>(
    `UPDATE jobs
        SET status = 'running',
            locked_by = $2,
            locked_at = NOW(),
            started_at = NOW(),
            attempts = attempts + 1,
            updated_at = NOW()
      WHERE id = $1
        AND status = 'pending'
      RETURNING id, type, priority, attempts, max_attempts`,
    [jobId, workerId],
  )
  return r.rows[0] ?? null
}

async function countEventsForSubject(c: Client, subjectId: string): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM system_events
       WHERE subject_kind = 'episode_intelligence_record'
         AND subject_id = $1`,
    [subjectId],
  )
  return Number(r.rows[0]?.n ?? 0)
}

async function fetchEventsForSubject(
  c: Client,
  subjectId: string,
): Promise<
  Array<{
    source: string
    event_type: string
    severity: string
    actor: string | null
    payload: Record<string, unknown>
    event_at: Date
  }>
> {
  const r = await c.query<{
    source: string
    event_type: string
    severity: string
    actor: string | null
    payload: Record<string, unknown>
    event_at: Date
  }>(
    `SELECT source, event_type, severity, actor, payload, event_at
       FROM system_events
       WHERE subject_kind = 'episode_intelligence_record'
         AND subject_id = $1
       ORDER BY event_at ASC, id ASC`,
    [subjectId],
  )
  return r.rows
}

/**
 * Poll system_events until the expected row count appears or the
 * timeout elapses. Required because the service emits fire-and-forget
 * (`void emitSystemEvent(...)`); the INSERT lands shortly after the
 * service call returns.
 */
async function waitForEventCount(
  c: Client,
  subjectId: string,
  expected: number,
  timeoutMs = 2000,
): Promise<{ ok: boolean; actual: number }> {
  const start = Date.now()
  let actual = 0
  while (Date.now() - start < timeoutMs) {
    actual = await countEventsForSubject(c, subjectId)
    if (actual >= expected) return { ok: actual === expected, actual }
    await new Promise((r) => setTimeout(r, 50))
  }
  // One final read.
  actual = await countEventsForSubject(c, subjectId)
  return { ok: actual === expected, actual }
}

/**
 * Assert that no MORE events arrived during the grace window. Used by
 * the no-op scenario.
 */
async function assertNoNewEvents(
  c: Client,
  subjectId: string,
  baseline: number,
  graceMs = 500,
): Promise<{ ok: boolean; final: number }> {
  await new Promise((r) => setTimeout(r, graceMs))
  const final = await countEventsForSubject(c, subjectId)
  return { ok: final === baseline, final }
}

// ─── Scenarios ────────────────────────────────────────────────────────

async function scenarioCreateEmit(c: Client): Promise<{ result: ScenarioResult; eirId: string | null }> {
  const title = `${SMOKE_TITLE_PREFIX}1-${Date.now()}`
  let eir
  try {
    eir = await createEpisodeIntelligenceRecord({
      working_title: title,
      created_by: SMOKE_ACTOR,
    })
  } catch (err) {
    return {
      result: {
        name: "1. createEpisodeIntelligenceRecord emits one row",
        ok: false,
        detail: `service threw: ${(err as Error).message}`,
      },
      eirId: null,
    }
  }
  const wait = await waitForEventCount(c, eir.id, 1)
  if (!wait.ok) {
    return {
      result: {
        name: "1. createEpisodeIntelligenceRecord emits one row",
        ok: false,
        detail: `expected 1 event after create, saw ${wait.actual}`,
      },
      eirId: eir.id,
    }
  }
  const rows = await fetchEventsForSubject(c, eir.id)
  const r0 = rows[0]
  if (
    r0.source !== "eir" ||
    r0.event_type !== "transition" ||
    r0.severity !== "info" ||
    r0.actor !== SMOKE_ACTOR ||
    r0.payload.from_phase !== null ||
    r0.payload.to_phase !== "idea"
  ) {
    return {
      result: {
        name: "1. createEpisodeIntelligenceRecord emits one row",
        ok: false,
        detail: `event shape wrong: ${JSON.stringify(r0)}`,
      },
      eirId: eir.id,
    }
  }
  return {
    result: {
      name: "1. createEpisodeIntelligenceRecord emits one row",
      ok: true,
      detail: `event(from_phase=null, to_phase='idea', actor='${SMOKE_ACTOR}') OK`,
    },
    eirId: eir.id,
  }
}

async function scenarioLegalTransitionEmit(
  c: Client,
  eirId: string,
): Promise<ScenarioResult> {
  try {
    await transitionEpisodePhase({
      eir_id: eirId,
      to_phase: "guest_assigned",
      actor_id: SMOKE_ACTOR,
      reason: "smoke",
    })
  } catch (err) {
    return {
      name: "2. transitionEpisodePhase emits one row per legal move",
      ok: false,
      detail: `service threw: ${(err as Error).message}`,
    }
  }
  const wait = await waitForEventCount(c, eirId, 2)
  if (!wait.ok) {
    return {
      name: "2. transitionEpisodePhase emits one row per legal move",
      ok: false,
      detail: `expected 2 events after legal transition, saw ${wait.actual}`,
    }
  }
  const rows = await fetchEventsForSubject(c, eirId)
  const r1 = rows[1]
  if (
    r1.payload.from_phase !== "idea" ||
    r1.payload.to_phase !== "guest_assigned" ||
    r1.actor !== SMOKE_ACTOR ||
    r1.severity !== "info"
  ) {
    return {
      name: "2. transitionEpisodePhase emits one row per legal move",
      ok: false,
      detail: `event 2 shape wrong: ${JSON.stringify(r1)}`,
    }
  }
  return {
    name: "2. transitionEpisodePhase emits one row per legal move",
    ok: true,
    detail: "event(idea → guest_assigned) OK",
  }
}

async function scenarioArchiveEmit(
  c: Client,
  eirId: string,
): Promise<ScenarioResult> {
  try {
    await transitionEpisodePhase({
      eir_id: eirId,
      to_phase: "archived",
      actor_id: SMOKE_ACTOR,
      reason: "smoke-archive",
    })
  } catch (err) {
    return {
      name: "3. archive escape emits a normal info row",
      ok: false,
      detail: `service threw: ${(err as Error).message}`,
    }
  }
  const wait = await waitForEventCount(c, eirId, 3)
  if (!wait.ok) {
    return {
      name: "3. archive escape emits a normal info row",
      ok: false,
      detail: `expected 3 events after archive, saw ${wait.actual}`,
    }
  }
  const rows = await fetchEventsForSubject(c, eirId)
  const r2 = rows[2]
  if (
    r2.payload.from_phase !== "guest_assigned" ||
    r2.payload.to_phase !== "archived" ||
    r2.severity !== "info"
  ) {
    return {
      name: "3. archive escape emits a normal info row",
      ok: false,
      detail: `event 3 shape wrong: ${JSON.stringify(r2)}`,
    }
  }
  return {
    name: "3. archive escape emits a normal info row",
    ok: true,
    detail: "event(guest_assigned → archived) OK",
  }
}

async function scenarioNoOpEmitsNothing(
  c: Client,
  eirId: string,
): Promise<ScenarioResult> {
  // Already archived from scenario 3. Re-transition to archived = no-op.
  const baseline = await countEventsForSubject(c, eirId)
  if (baseline !== 3) {
    return {
      name: "4. idempotent no-op does NOT emit",
      ok: false,
      detail: `baseline wrong: expected 3, saw ${baseline}`,
    }
  }
  try {
    await transitionEpisodePhase({
      eir_id: eirId,
      to_phase: "archived",
      actor_id: SMOKE_ACTOR,
      reason: "smoke-noop",
    })
  } catch (err) {
    return {
      name: "4. idempotent no-op does NOT emit",
      ok: false,
      detail: `service threw on no-op: ${(err as Error).message}`,
    }
  }
  const check = await assertNoNewEvents(c, eirId, baseline)
  if (!check.ok) {
    return {
      name: "4. idempotent no-op does NOT emit",
      ok: false,
      detail: `no-op emitted: count went ${baseline} → ${check.final}`,
    }
  }
  return {
    name: "4. idempotent no-op does NOT emit",
    ok: true,
    detail: "count stable at 3",
  }
}

// ─── P2.3.c scenarios — jobs / sweeper / schedule ────────────────────
//
// Per operator §6 Q5 Option B: direct queue-call approach. We call
// claimNextJob / completeJob / failJob / reclaimStaleJobs directly and
// invoke the builders + emit ourselves, mirroring what worker.ts does
// in production. This validates: (a) queue signatures return the new
// shapes, (b) builders produce valid input, (c) emit lands in the
// table. It does NOT validate that worker.ts actually calls them in
// the right places — that's manual operator validation via `npm run
// worker` + `npm run jobs:inspect`.

async function scenarioJobsClaimAndSucceed(c: Client): Promise<ScenarioResult> {
  // Enqueue a noop job, claim it BY ID (bypassing global FIFO so the
  // smoke is isolated from real queue contents), mark succeeded, emit
  // both events.
  let jobId: string
  try {
    const j = await enqueueJob(SMOKE_JOB_TYPE_OK, { smoke: true })
    jobId = j.id
  } catch (err) {
    return {
      name: "5. jobs lifecycle: claim + succeed",
      ok: false,
      detail: `enqueueJob threw: ${(err as Error).message}`,
    }
  }
  const claimed = await smokeClaimById(c, jobId, SMOKE_ACTOR)
  if (!claimed) {
    return {
      name: "5. jobs lifecycle: claim + succeed",
      ok: false,
      detail: `smokeClaimById returned null for ${jobId}`,
    }
  }
  void emitSystemEvent(
    buildJobsClaimedEvent({
      job_id: claimed.id,
      job_type: claimed.type,
      priority: claimed.priority,
      attempts: claimed.attempts,
      max_attempts: claimed.max_attempts,
      actor: SMOKE_ACTOR,
    }),
  )
  await completeJob(claimed.id, { smoke_result: true })
  void emitSystemEvent(
    buildJobsSucceededEvent({
      job_id: claimed.id,
      job_type: claimed.type,
      duration_ms: 1, // pure number — not validating wall-clock here
      actor: SMOKE_ACTOR,
    }),
  )
  const wait = await waitForJobEventCount(c, jobId, 2)
  if (!wait.ok) {
    return {
      name: "5. jobs lifecycle: claim + succeed",
      ok: false,
      detail: `expected 2 events for job ${jobId}, saw ${wait.actual}`,
    }
  }
  const rows = await fetchEventsForJobSubject(c, jobId)
  if (
    rows[0].event_type !== "claimed" ||
    rows[0].severity !== "info" ||
    rows[1].event_type !== "succeeded" ||
    rows[1].severity !== "info"
  ) {
    return {
      name: "5. jobs lifecycle: claim + succeed",
      ok: false,
      detail: `event sequence wrong: ${JSON.stringify(rows.map((r) => r.event_type))}`,
    }
  }
  return {
    name: "5. jobs lifecycle: claim + succeed",
    ok: true,
    detail: "events(claimed → succeeded) OK",
  }
}

async function scenarioJobsFailWithRetry(c: Client): Promise<ScenarioResult> {
  // Enqueue a job with maxAttempts=3, claim BY ID, fail with retry available.
  let jobId: string
  try {
    const j = await enqueueJob(SMOKE_JOB_TYPE_FAIL, {}, { maxAttempts: 3 })
    jobId = j.id
  } catch (err) {
    return {
      name: "6. jobs lifecycle: fail with retry",
      ok: false,
      detail: `enqueueJob threw: ${(err as Error).message}`,
    }
  }
  const claimed = await smokeClaimById(c, jobId, SMOKE_ACTOR)
  if (!claimed) {
    return {
      name: "6. jobs lifecycle: fail with retry",
      ok: false,
      detail: `smokeClaimById returned null for ${jobId}`,
    }
  }
  // After claim, attempts=1 (claimNextJob increments). max_attempts=3.
  const outcome = await failJob(claimed.id, "simulated transient error")
  if (outcome.status !== "pending") {
    return {
      name: "6. jobs lifecycle: fail with retry",
      ok: false,
      detail: `failJob returned ${outcome.status}, expected pending`,
    }
  }
  if (outcome.attempts !== claimed.attempts || outcome.max_attempts !== claimed.max_attempts) {
    return {
      name: "6. jobs lifecycle: fail with retry",
      ok: false,
      detail: `failJob counters wrong: ${JSON.stringify(outcome)}`,
    }
  }
  void emitSystemEvent(
    buildJobsFailedEvent({
      job_id: claimed.id,
      job_type: claimed.type,
      error_message: "simulated transient error",
      attempts: outcome.attempts,
      max_attempts: outcome.max_attempts,
      actor: SMOKE_ACTOR,
    }),
  )
  // We don't emit jobs.claimed here — scenario 5 already verified that.
  const wait = await waitForJobEventCount(c, jobId, 1)
  if (!wait.ok) {
    return {
      name: "6. jobs lifecycle: fail with retry",
      ok: false,
      detail: `expected 1 failed event, saw ${wait.actual}`,
    }
  }
  const rows = await fetchEventsForJobSubject(c, jobId)
  if (
    rows[0].event_type !== "failed" ||
    rows[0].severity !== "warn" ||
    rows[0].payload.will_retry !== true ||
    rows[0].payload.attempts !== outcome.attempts
  ) {
    return {
      name: "6. jobs lifecycle: fail with retry",
      ok: false,
      detail: `event shape wrong: ${JSON.stringify(rows[0])}`,
    }
  }
  return {
    name: "6. jobs lifecycle: fail with retry",
    ok: true,
    detail: `failJob returned ${outcome.status}, event(warn, will_retry=true) OK`,
  }
}

async function scenarioJobsFailToDead(c: Client): Promise<ScenarioResult> {
  // Enqueue a job with maxAttempts=1, claim BY ID (attempts→1, equals
  // max), fail → status='dead'.
  let jobId: string
  try {
    const j = await enqueueJob(SMOKE_JOB_TYPE_FAIL, {}, { maxAttempts: 1 })
    jobId = j.id
  } catch (err) {
    return {
      name: "7. jobs lifecycle: fail to dead",
      ok: false,
      detail: `enqueueJob threw: ${(err as Error).message}`,
    }
  }
  const claimed = await smokeClaimById(c, jobId, SMOKE_ACTOR)
  if (!claimed) {
    return {
      name: "7. jobs lifecycle: fail to dead",
      ok: false,
      detail: `smokeClaimById returned null for ${jobId}`,
    }
  }
  const outcome = await failJob(claimed.id, "fatal error")
  if (outcome.status !== "dead") {
    return {
      name: "7. jobs lifecycle: fail to dead",
      ok: false,
      detail: `failJob returned ${outcome.status}, expected dead`,
    }
  }
  void emitSystemEvent(
    buildJobsDeadEvent({
      job_id: claimed.id,
      job_type: claimed.type,
      error_message: "fatal error",
      attempts: outcome.attempts,
      actor: SMOKE_ACTOR,
    }),
  )
  const wait = await waitForJobEventCount(c, jobId, 1)
  if (!wait.ok) {
    return {
      name: "7. jobs lifecycle: fail to dead",
      ok: false,
      detail: `expected 1 dead event, saw ${wait.actual}`,
    }
  }
  const rows = await fetchEventsForJobSubject(c, jobId)
  if (rows[0].event_type !== "dead" || rows[0].severity !== "error") {
    return {
      name: "7. jobs lifecycle: fail to dead",
      ok: false,
      detail: `event shape wrong: ${JSON.stringify(rows[0])}`,
    }
  }
  // Confirm payload has no max_attempts key — dead is terminal.
  if ("max_attempts" in rows[0].payload) {
    return {
      name: "7. jobs lifecycle: fail to dead",
      ok: false,
      detail: "dead payload leaked max_attempts",
    }
  }
  return {
    name: "7. jobs lifecycle: fail to dead",
    ok: true,
    detail: "event(error, attempts only) OK",
  }
}

async function scenarioReclaimEmitsPerRow(c: Client): Promise<ScenarioResult> {
  // Insert a synthetic stale running job directly (bypassing the
  // worker) so reclaimStaleJobs has something to recover.
  let jobId: string
  try {
    const ins = await c.query<{ id: string }>(
      `INSERT INTO jobs (
         id, type, status, payload, priority, attempts, max_attempts,
         run_after, locked_by, locked_at, started_at, created_at, updated_at
       )
       VALUES (
         gen_random_uuid()::text, $1, 'running', '{}'::jsonb, 0, 1, 3,
         NOW(), 'smoke-prev-worker', NOW() - INTERVAL '20 minutes',
         NOW() - INTERVAL '20 minutes', NOW(), NOW()
       )
       RETURNING id`,
      [SMOKE_JOB_TYPE_RECLAIM],
    )
    jobId = ins.rows[0].id
  } catch (err) {
    return {
      name: "8. reclaim emits per-row event",
      ok: false,
      detail: `synth insert threw: ${(err as Error).message}`,
    }
  }
  // Lease window = 5 min. The synthetic row is 20 min old → reclaim.
  const LEASE_MS = 5 * 60 * 1000
  const reclaimed = await reclaimStaleJobs(LEASE_MS)
  const ours = reclaimed.find((r) => r.id === jobId)
  if (!ours) {
    return {
      name: "8. reclaim emits per-row event",
      ok: false,
      detail: `reclaimStaleJobs missed our row (got ${reclaimed.length} rows)`,
    }
  }
  if (ours.type !== SMOKE_JOB_TYPE_RECLAIM) {
    return {
      name: "8. reclaim emits per-row event",
      ok: false,
      detail: `type field wrong: ${ours.type}`,
    }
  }
  if (ours.previous_locked_by !== "smoke-prev-worker") {
    return {
      name: "8. reclaim emits per-row event",
      ok: false,
      detail: `previous_locked_by wrong: ${ours.previous_locked_by} (expected 'smoke-prev-worker' — CTE pre-update capture is broken)`,
    }
  }
  void emitSystemEvent(
    buildJobsReclaimedEvent({
      job_id: ours.id,
      job_type: ours.type,
      previous_locked_by: ours.previous_locked_by,
      lease_ms: LEASE_MS,
      actor: SMOKE_ACTOR,
    }),
  )
  const wait = await waitForJobEventCount(c, jobId, 1)
  if (!wait.ok) {
    return {
      name: "8. reclaim emits per-row event",
      ok: false,
      detail: `expected 1 reclaimed event, saw ${wait.actual}`,
    }
  }
  const rows = await fetchEventsForJobSubject(c, jobId)
  if (
    rows[0].event_type !== "reclaimed" ||
    rows[0].severity !== "warn" ||
    rows[0].payload.previous_locked_by !== "smoke-prev-worker" ||
    rows[0].payload.lease_ms !== LEASE_MS
  ) {
    return {
      name: "8. reclaim emits per-row event",
      ok: false,
      detail: `event shape wrong: ${JSON.stringify(rows[0])}`,
    }
  }
  return {
    name: "8. reclaim emits per-row event",
    ok: true,
    detail: "CTE pre-update capture + event(warn) OK",
  }
}

async function scenarioSweeperWetEmitsAndDryDoesNot(
  c: Client,
): Promise<ScenarioResult> {
  // Insert 2 synthetic stale ai_runs rows so the wet sweep has work.
  try {
    await c.query(
      `INSERT INTO ai_runs (
         id, task_kind, provider, model_name, status, started_at, actor_id
       )
       VALUES
         (gen_random_uuid()::text, 'structural', 'openai', 'smoke-model',
          'running', NOW() - INTERVAL '20 minutes', $1),
         (gen_random_uuid()::text, 'structural', 'openai', 'smoke-model',
          'running', NOW() - INTERVAL '20 minutes', $1)`,
      [SMOKE_AI_RUNS_ACTOR],
    )
  } catch (err) {
    return {
      name: "9. sweeper wet emits, dry does not",
      ok: false,
      detail: `synth insert threw: ${(err as Error).message}`,
    }
  }

  // Snapshot how many sweeper events have landed in the last hour
  // (could be other smokes' work — we measure deltas, not absolutes).
  const beforeWet = await countEventsBySource(c, "sweeper", 60 * 60 * 1000)

  // Wet sweep — should emit one sweeper.summary.
  try {
    await runAiRunsSweep({ dryRun: false, maxRows: 100 })
  } catch (err) {
    return {
      name: "9. sweeper wet emits, dry does not",
      ok: false,
      detail: `wet sweep threw: ${(err as Error).message}`,
    }
  }
  // Poll for the emit to land (fire-and-forget).
  let afterWet = beforeWet
  const wetStart = Date.now()
  while (Date.now() - wetStart < 2000) {
    afterWet = await countEventsBySource(c, "sweeper", 60 * 60 * 1000)
    if (afterWet > beforeWet) break
    await new Promise((r) => setTimeout(r, 50))
  }
  if (afterWet !== beforeWet + 1) {
    return {
      name: "9. sweeper wet emits, dry does not",
      ok: false,
      detail: `wet expected +1 sweeper event, got ${afterWet - beforeWet}`,
    }
  }

  // Dry sweep — must NOT emit. There may be no stale rows left after
  // the wet sweep, but the dry-run code path is exercised regardless.
  try {
    await runAiRunsSweep({ dryRun: true })
  } catch (err) {
    return {
      name: "9. sweeper wet emits, dry does not",
      ok: false,
      detail: `dry sweep threw: ${(err as Error).message}`,
    }
  }
  // Grace window: confirm no NEW sweeper events arrive.
  await new Promise((r) => setTimeout(r, 500))
  const afterDry = await countEventsBySource(c, "sweeper", 60 * 60 * 1000)
  if (afterDry !== afterWet) {
    return {
      name: "9. sweeper wet emits, dry does not",
      ok: false,
      detail: `dry emitted: ${afterDry - afterWet} new sweeper events`,
    }
  }

  return {
    name: "9. sweeper wet emits, dry does not",
    ok: true,
    detail: `wet=+1, dry=+0 (afterWet=${afterWet}, afterDry=${afterDry})`,
  }
}

async function scenarioScheduleCreatedEmit(
  c: Client,
): Promise<ScenarioResult> {
  // Direct builder + emit roundtrip. Integration with the actual
  // `ensure*Scheduler` bootstrap is operator-validated via `npm run
  // worker` + `npm run jobs:inspect` because the production
  // `market.scheduler` queue row may already exist and we don't want
  // to delete it from the smoke.
  const before = await countEventsBySource(c, "schedule", 60 * 60 * 1000)
  void emitSystemEvent(
    buildScheduleCreatedEvent({
      schedule_type: "smoke-system-events-fake-schedule",
      cadence: "1m",
      actor: SMOKE_ACTOR,
    }),
  )
  // Wait up to 2s for the fire-and-forget INSERT.
  let after = before
  const start = Date.now()
  while (Date.now() - start < 2000) {
    after = await countEventsBySource(c, "schedule", 60 * 60 * 1000)
    if (after > before) break
    await new Promise((r) => setTimeout(r, 50))
  }
  if (after !== before + 1) {
    return {
      name: "10. schedule.created emit roundtrip",
      ok: false,
      detail: `expected +1 schedule event, got ${after - before}`,
    }
  }
  // Verify the row's shape.
  const r = await c.query<{
    severity: string
    payload: Record<string, unknown>
  }>(
    `SELECT severity, payload
       FROM system_events
       WHERE source = 'schedule'
         AND event_type = 'created'
         AND actor = $1
       ORDER BY id DESC
       LIMIT 1`,
    [SMOKE_ACTOR],
  )
  const row = r.rows[0]
  if (
    !row ||
    row.severity !== "info" ||
    row.payload.schedule_type !== "smoke-system-events-fake-schedule" ||
    row.payload.cadence !== "1m"
  ) {
    return {
      name: "10. schedule.created emit roundtrip",
      ok: false,
      detail: `event shape wrong: ${JSON.stringify(row)}`,
    }
  }
  return {
    name: "10. schedule.created emit roundtrip",
    ok: true,
    detail: "event(info, schedule_type+cadence verbatim) OK",
  }
}

// ─── P2.3.d scenarios — rate-limit + ai-router rejects ───────────────
//
// Mutates KHAT_RATE_LIMIT_MODE and the expensive-tier concurrency env
// var for the duration of each scenario; restored in finally. Same
// pattern as P1.6's rate-limit-burst smoke (operator §10 Q5 OK).

/**
 * Insert N synthetic 'running' ai_runs of the expensive tier with the
 * rate-limit smoke marker. Used to saturate the concurrency threshold
 * so a subsequent `acquireRateLimitPermit` call hits blocked_concurrency.
 */
async function synthRateLimitRunningRows(
  c: Client,
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await c.query(
      `INSERT INTO ai_runs (
         id, task_kind, provider, model_name, status, started_at, actor_id
       )
       VALUES (gen_random_uuid()::text, 'editorial', 'openai', 'smoke-model',
               'running', NOW(), $1)`,
      [SMOKE_RATE_LIMIT_ACTOR],
    )
  }
}

interface EnvSnapshot {
  mode: string | undefined
  expensiveConcurrent: string | undefined
}

function snapshotRateLimitEnv(): EnvSnapshot {
  return {
    mode: process.env.KHAT_RATE_LIMIT_MODE,
    expensiveConcurrent: process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT,
  }
}

function restoreRateLimitEnv(snap: EnvSnapshot): void {
  if (snap.mode === undefined) delete process.env.KHAT_RATE_LIMIT_MODE
  else process.env.KHAT_RATE_LIMIT_MODE = snap.mode
  if (snap.expensiveConcurrent === undefined)
    delete process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT
  else process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT = snap.expensiveConcurrent
}

async function scenarioRateLimitReportBlock(
  c: Client,
): Promise<ScenarioResult> {
  const snap = snapshotRateLimitEnv()
  try {
    process.env.KHAT_RATE_LIMIT_MODE = "report"
    process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT = "3"

    // Fresh start — clear any prior rate-limit smoke rows.
    await c.query(`DELETE FROM ai_runs WHERE actor_id = $1`, [
      SMOKE_RATE_LIMIT_ACTOR,
    ])
    await c.query(`DELETE FROM system_events WHERE actor = $1`, [
      SMOKE_RATE_LIMIT_ACTOR,
    ])

    // Saturate the expensive tier at exactly the cap (3).
    await synthRateLimitRunningRows(c, 3)

    const before = await countEventsBySource(c, "rate-limit", 60 * 60 * 1000)
    // REPORT mode never throws on blocked_*. Returns the decision.
    const result = await acquireRateLimitPermit({
      taskKind: "editorial",
      actorId: SMOKE_RATE_LIMIT_ACTOR,
      subjectTable: null,
      subjectId: null,
      bypassRateLimit: false,
    })
    if (result.decision !== "blocked_concurrency") {
      return {
        name: "11. rate-limit REPORT block emits",
        ok: false,
        detail: `expected blocked_concurrency, got ${result.decision}`,
      }
    }
    if (result.enforced !== false) {
      return {
        name: "11. rate-limit REPORT block emits",
        ok: false,
        detail: "REPORT-mode result reported enforced=true",
      }
    }

    // Poll for the emit (fire-and-forget).
    let after = before
    const start = Date.now()
    while (Date.now() - start < 2000) {
      after = await countEventsBySource(c, "rate-limit", 60 * 60 * 1000)
      if (after > before) break
      await new Promise((r) => setTimeout(r, 50))
    }
    if (after !== before + 1) {
      return {
        name: "11. rate-limit REPORT block emits",
        ok: false,
        detail: `expected +1 rate-limit event, got ${after - before}`,
      }
    }
    // Verify the row shape.
    const r = await c.query<{
      severity: string
      payload: Record<string, unknown>
    }>(
      `SELECT severity, payload
         FROM system_events
         WHERE source = 'rate-limit'
           AND event_type = 'rejected'
           AND actor = $1
         ORDER BY id DESC
         LIMIT 1`,
      [SMOKE_RATE_LIMIT_ACTOR],
    )
    const row = r.rows[0]
    if (
      !row ||
      row.severity !== "warn" ||
      row.payload.decision !== "blocked_concurrency" ||
      row.payload.mode !== "report" ||
      row.payload.task_kind !== "editorial" ||
      row.payload.tier !== "expensive"
    ) {
      return {
        name: "11. rate-limit REPORT block emits",
        ok: false,
        detail: `event shape wrong: ${JSON.stringify(row)}`,
      }
    }
    return {
      name: "11. rate-limit REPORT block emits",
      ok: true,
      detail: "event(warn, decision=blocked_concurrency, mode=report) OK",
    }
  } catch (err) {
    return {
      name: "11. rate-limit REPORT block emits",
      ok: false,
      detail: `unexpected throw: ${(err as Error).message}`,
    }
  } finally {
    restoreRateLimitEnv(snap)
  }
}

async function scenarioRateLimitEnforceBlock(
  c: Client,
): Promise<ScenarioResult> {
  const snap = snapshotRateLimitEnv()
  try {
    process.env.KHAT_RATE_LIMIT_MODE = "enforce"
    process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT = "3"

    // Carry the 3 saturating rows from scenario 11 or reseed.
    const existing = await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ai_runs
         WHERE actor_id = $1 AND status = 'running'`,
      [SMOKE_RATE_LIMIT_ACTOR],
    )
    const need = 3 - Number(existing.rows[0]?.n ?? 0)
    if (need > 0) await synthRateLimitRunningRows(c, need)

    const before = await countEventsBySource(c, "rate-limit", 60 * 60 * 1000)
    let threw = false
    try {
      await acquireRateLimitPermit({
        taskKind: "editorial",
        actorId: SMOKE_RATE_LIMIT_ACTOR,
        subjectTable: null,
        subjectId: null,
        bypassRateLimit: false,
      })
    } catch (err) {
      if (err instanceof RateLimitError) {
        threw = true
      } else {
        return {
          name: "12. rate-limit ENFORCE block throws + emits",
          ok: false,
          detail: `wrong error type: ${(err as Error).message}`,
        }
      }
    }
    if (!threw) {
      return {
        name: "12. rate-limit ENFORCE block throws + emits",
        ok: false,
        detail: "ENFORCE mode failed to throw RateLimitError",
      }
    }

    // Poll for emit.
    let after = before
    const start = Date.now()
    while (Date.now() - start < 2000) {
      after = await countEventsBySource(c, "rate-limit", 60 * 60 * 1000)
      if (after > before) break
      await new Promise((r) => setTimeout(r, 50))
    }
    if (after !== before + 1) {
      return {
        name: "12. rate-limit ENFORCE block throws + emits",
        ok: false,
        detail: `expected +1 rate-limit event, got ${after - before}`,
      }
    }
    const r = await c.query<{ payload: Record<string, unknown> }>(
      `SELECT payload
         FROM system_events
         WHERE source = 'rate-limit'
           AND event_type = 'rejected'
           AND actor = $1
         ORDER BY id DESC
         LIMIT 1`,
      [SMOKE_RATE_LIMIT_ACTOR],
    )
    if (r.rows[0]?.payload.mode !== "enforce") {
      return {
        name: "12. rate-limit ENFORCE block throws + emits",
        ok: false,
        detail: `payload.mode=${r.rows[0]?.payload.mode}, expected 'enforce'`,
      }
    }
    return {
      name: "12. rate-limit ENFORCE block throws + emits",
      ok: true,
      detail: "RateLimitError thrown + event(mode=enforce) OK",
    }
  } catch (err) {
    return {
      name: "12. rate-limit ENFORCE block throws + emits",
      ok: false,
      detail: `unexpected throw: ${(err as Error).message}`,
    }
  } finally {
    restoreRateLimitEnv(snap)
    // Clear synthetic ai_runs so they don't bleed into later scenarios
    // or smoke runs.
    await c.query(`DELETE FROM ai_runs WHERE actor_id = $1`, [
      SMOKE_RATE_LIMIT_ACTOR,
    ])
  }
}

async function scenarioAiRouterRejectedEmit(
  c: Client,
): Promise<ScenarioResult> {
  // Direct builder + emit roundtrip (operator §10 Q6). Avoids spinning
  // up the real router + adapters, which would attempt provider calls.
  // Real router integration is operator-validated by observing
  // `ai-router.rejected` rows landing during normal ENFORCE-mode use.
  const before = await countEventsBySource(c, "ai-router", 60 * 60 * 1000)
  void emitSystemEvent(
    buildAiRouterRejectedEvent({
      task_kind: "editorial",
      reason: "smoke-simulated: expensive-tier concurrency limit reached (3/3)",
      actor_id: SMOKE_ACTOR,
      actor: SMOKE_ACTOR,
    }),
  )
  let after = before
  const start = Date.now()
  while (Date.now() - start < 2000) {
    after = await countEventsBySource(c, "ai-router", 60 * 60 * 1000)
    if (after > before) break
    await new Promise((r) => setTimeout(r, 50))
  }
  if (after !== before + 1) {
    return {
      name: "13. ai-router.rejected emit roundtrip",
      ok: false,
      detail: `expected +1 ai-router event, got ${after - before}`,
    }
  }
  const r = await c.query<{
    severity: string
    subject_kind: string | null
    payload: Record<string, unknown>
  }>(
    `SELECT severity, subject_kind, payload
       FROM system_events
       WHERE source = 'ai-router'
         AND event_type = 'rejected'
         AND actor = $1
       ORDER BY id DESC
       LIMIT 1`,
    [SMOKE_ACTOR],
  )
  const row = r.rows[0]
  if (
    !row ||
    row.severity !== "warn" ||
    row.subject_kind !== null ||
    row.payload.task_kind !== "editorial" ||
    typeof row.payload.reason !== "string"
  ) {
    return {
      name: "13. ai-router.rejected emit roundtrip",
      ok: false,
      detail: `event shape wrong: ${JSON.stringify(row)}`,
    }
  }
  return {
    name: "13. ai-router.rejected emit roundtrip",
    ok: true,
    detail: "event(warn, subjectless, task_kind+reason) OK",
  }
}

// ─── P2.3.e scenario — read API ──────────────────────────────────────

async function scenarioReadApiQueries(
  c: Client,
  eirId: string | null,
): Promise<ScenarioResult> {
  // Reach back 10 minutes to safely cover everything scenarios 1–13
  // wrote during this smoke run, regardless of clock skew.
  const since = new Date(Date.now() - 10 * 60 * 1000)

  // (a) listEvents — basic recent-events-first list with a small limit.
  let recent
  try {
    recent = await listEvents({ since, limit: 5 })
  } catch (err) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: `listEvents threw: ${(err as Error).message}`,
    }
  }
  if (recent.length === 0) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: "listEvents returned 0 — prior scenarios wrote nothing?",
    }
  }
  // Confirm ordering: each event_at >= the next.
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].event_at.getTime() > recent[i - 1].event_at.getTime()) {
      return {
        name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
        ok: false,
        detail: "listEvents ordering broken — not desc by event_at",
      }
    }
  }
  // Confirm row shape on the top result.
  const top = recent[0]
  if (
    typeof top.id !== "string" ||
    !top.event_at ||
    typeof top.source !== "string" ||
    typeof top.event_type !== "string" ||
    typeof top.severity !== "string" ||
    top.payload === null ||
    typeof top.payload !== "object"
  ) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: `top row shape wrong: ${JSON.stringify(top)}`,
    }
  }
  // bigint→string contract: id must NOT be a number.
  if (typeof top.id === "number") {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: "top.id leaked as Number — bigint coercion broken",
    }
  }

  // (b) listEvents with a source filter — confirm only matching rows.
  const eirOnly = await listEvents({ source: "eir", since, limit: 50 })
  for (const r of eirOnly) {
    if (r.source !== "eir") {
      return {
        name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
        ok: false,
        detail: `source filter leaked non-eir row: ${r.source}`,
      }
    }
  }

  // (c) listEvents with a severity filter — confirm only matching rows.
  const warnOnly = await listEvents({ severity: "warn", since, limit: 50 })
  for (const r of warnOnly) {
    if (r.severity !== "warn") {
      return {
        name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
        ok: false,
        detail: `severity filter leaked: ${r.severity}`,
      }
    }
  }

  // (d) countBySource — confirm at least the EIR source has events.
  const sources = await countBySource({ since })
  const eirCount = sources.find((s) => s.source === "eir")?.count ?? 0
  if (eirCount === 0) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: "countBySource missing 'eir' rows — writer regression?",
    }
  }

  // (e) countBySourceSeverity — confirm the matrix has at least one row.
  const matrix = await countBySourceSeverity({ since })
  if (matrix.length === 0) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: "countBySourceSeverity returned empty matrix",
    }
  }
  // Sanity bridge: sum-of-matrix == sum-of-by-source.
  const matrixTotal = matrix.reduce((a, r) => a + r.count, 0)
  const sourcesTotal = sources.reduce((a, r) => a + r.count, 0)
  if (matrixTotal !== sourcesTotal) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: `matrix total (${matrixTotal}) != sources total (${sourcesTotal})`,
    }
  }

  // (f) recentBySubject — pull the EIR from scenario 1 if available.
  if (eirId) {
    const subjectRows = await recentBySubject({
      subjectKind: "episode_intelligence_record",
      subjectId: eirId,
      limit: 10,
    })
    if (subjectRows.length === 0) {
      return {
        name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
        ok: false,
        detail: `recentBySubject returned 0 for EIR ${eirId}`,
      }
    }
    for (const r of subjectRows) {
      if (
        r.subject_kind !== "episode_intelligence_record" ||
        r.subject_id !== eirId
      ) {
        return {
          name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
          ok: false,
          detail: `recentBySubject leaked off-subject row: ${JSON.stringify({ kind: r.subject_kind, id: r.subject_id })}`,
        }
      }
    }
  }

  // (g) topErrors — should include warn + error rows only.
  const errs = await topErrors({ since, limit: 20 })
  for (const r of errs) {
    if (r.severity === "info") {
      return {
        name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
        ok: false,
        detail: `topErrors leaked info-severity row`,
      }
    }
  }

  // (h) Sanity: clamp behavior — limit=10000 should not blow up. Just
  // verify the call returns something sensible (≤ ceiling).
  const huge = await listEvents({ since, limit: 10_000 })
  if (huge.length > 500) {
    return {
      name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
      ok: false,
      detail: `limit clamp failed — got ${huge.length} rows > 500 ceiling`,
    }
  }

  void c // unused — DB is reached via the Drizzle pool inside queries.ts
  return {
    name: "14. read API: listEvents / countBy* / recentBySubject / topErrors",
    ok: true,
    detail: `recent=${recent.length} eirOnly=${eirOnly.length} warnOnly=${warnOnly.length} sources=${sources.length} matrix=${matrix.length} errs=${errs.length}`,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${SMOKE_VERSION}]`)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(`[${SMOKE_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[${SMOKE_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log(`[${SMOKE_VERSION}] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed`)
  }

  const results: ScenarioResult[] = []
  let createdEirId: string | null = null

  await withClient(async (c) => {
    // Defensive pre-cleanup — clear any orphan rows from prior failed runs.
    await cleanupSmokeRows(c)

    const s1 = await scenarioCreateEmit(c)
    results.push(s1.result)
    createdEirId = s1.eirId

    if (s1.result.ok && createdEirId) {
      results.push(await scenarioLegalTransitionEmit(c, createdEirId))
      // Scenarios 3 + 4 build on the EIR state established by 1 + 2.
      if (results[results.length - 1].ok) {
        results.push(await scenarioArchiveEmit(c, createdEirId))
        if (results[results.length - 1].ok) {
          results.push(await scenarioNoOpEmitsNothing(c, createdEirId))
        }
      }
    }

    // P2.3.c scenarios — independent of the EIR scenarios above. Each
    // is self-contained; we always run all of them so partial failures
    // are surfaced in the summary.
    results.push(await scenarioJobsClaimAndSucceed(c))
    results.push(await scenarioJobsFailWithRetry(c))
    results.push(await scenarioJobsFailToDead(c))
    results.push(await scenarioReclaimEmitsPerRow(c))
    results.push(await scenarioSweeperWetEmitsAndDryDoesNot(c))
    results.push(await scenarioScheduleCreatedEmit(c))

    // P2.3.d scenarios — rate-limit + ai-router rejects.
    results.push(await scenarioRateLimitReportBlock(c))
    results.push(await scenarioRateLimitEnforceBlock(c))
    results.push(await scenarioAiRouterRejectedEmit(c))

    // P2.3.e scenario — read API. Runs LAST so the prior 13 scenarios
    // have populated the corpus. Reads against events that are about
    // to be cleaned up by the teardown below, so this is the last
    // chance to validate.
    results.push(await scenarioReadApiQueries(c, createdEirId))

    // Mandatory teardown.
    await cleanupSmokeRows(c)
  })

  // ─── Summary ─────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log("")
  console.log("══════════════════════════════════════════════════════════════")
  console.log("system-events smoke summary")
  console.log("══════════════════════════════════════════════════════════════")
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"}  ${r.name}`)
    console.log(`     ${r.detail}`)
  }
  console.log("")
  console.log(`  Scenarios:  ${results.length}`)
  console.log(`  Passed:     ${passed}`)
  console.log(`  Failed:     ${failed}`)
  console.log("")
  if (failed > 0) {
    console.log("  SYSTEM-EVENTS SMOKE: FAIL")
    process.exit(2)
  }
  console.log("  SYSTEM-EVENTS SMOKE: PASS")
  process.exit(0)
}

main().catch(async (err) => {
  console.error(`[${SMOKE_VERSION}] fatal:`, err)
  // Best-effort cleanup on fatal path.
  try {
    await withClient(cleanupSmokeRows)
  } catch {
    // ignore — we're already in the error path
  }
  process.exit(2)
})
