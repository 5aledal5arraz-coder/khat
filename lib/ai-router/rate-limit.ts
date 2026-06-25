/**
 * Phase 1.6 — AI rate-limit policy + permit orchestrator.
 *
 * Single entry point: `acquireRateLimitPermit()`. The AI Router calls
 * this BEFORE inserting the `ai_runs` row. The function:
 *
 *   1. Reads mode from `KHAT_RATE_LIMIT_MODE` (off | report | enforce)
 *   2. Resolves tier from task_kind via TASK_TIER
 *   3. Applies bypass rules (call flag → actor allowlist → session bypass)
 *   4. If not bypassed:
 *        a. Acquires `pg_advisory_xact_lock(hashtext('khat-rate-limit'))`
 *           inside a short transaction (serialises permit eval).
 *        b. Optionally acquires a session-level subject lock
 *           `pg_try_advisory_lock(hashtext('khat-subj:<table>:<id>'))`
 *           — held across the AI call. Returned in `permit.release()`.
 *        c. Counts running ai_runs of this tier → concurrency check.
 *        d. Sums today's cost_usd of this tier → daily-cost check.
 *   5. Writes one `ai_rate_limit_events` row with the decision.
 *   6. In `enforce` mode, throws `RateLimitError` on blocked decisions
 *      and releases any held subject lock first.
 *
 * The subject lock survives the rate-limit transaction by using a
 * session-level advisory lock. Callers MUST invoke `permit.release()`
 * once the AI call finishes (the router does this in its finally).
 *
 * No Redis. All state lives in Postgres.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import type { AiTaskKind } from "@/lib/db/schema/ai-runs"
import type {
  RateLimitDecision,
  RateLimitMode,
  RateLimitTier,
} from "@/lib/db/schema/ai-rate-limit-events"
// Phase 2.3.d — unified event log mirror. Fire-and-forget per emit
// contract; failures cannot break the permit eval path. Emits on
// `blocked_*` decisions only — rejects-only policy (operator §13 Q2 of
// P2.3.a). Both REPORT and ENFORCE modes emit, per operator §10 Q1 of
// P2.3.d, so the dashboard sees would-be-blocks too.
import { emitSystemEvent } from "@/lib/system-events/emit"
import { buildRateLimitRejectedEvent } from "@/lib/system-events/builders"
// DB-backed runtime overrides for mode + per-tier caps (admin Settings hub).
// Imported lazily-at-call inside acquireRateLimitPermit; the module cycle with
// runtime-config is safe because all usage is function-scoped, not top-level.
import { getEffectiveMode, getEffectiveLimits } from "./runtime-config"

// ─── Tier mapping ────────────────────────────────────────────────────

/**
 * Two-tier policy. Light tasks run cheap models with high concurrency;
 * expensive tasks consume the editorial-grade model with tighter caps.
 */
export const TASK_TIER: Record<AiTaskKind, RateLimitTier> = {
  structural: "light",
  verification: "light",
  analysis: "light",
  editorial: "expensive",
  discovery: "expensive",
  research: "expensive",
}

// ─── Limits ──────────────────────────────────────────────────────────

export interface TierLimits {
  maxConcurrent: number
  maxDailyCostUsd: number
}

export const DEFAULT_LIMITS: Record<RateLimitTier, TierLimits> = {
  light: { maxConcurrent: 10, maxDailyCostUsd: 5 },
  expensive: { maxConcurrent: 3, maxDailyCostUsd: 25 },
}

/**
 * Read tier limits from env-var overrides; fall back to defaults.
 *
 *   KHAT_RATE_LIMIT_LIGHT_CONCURRENT=N        (default 10)
 *   KHAT_RATE_LIMIT_LIGHT_DAILY_USD=N         (default 5)
 *   KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT=N    (default 3)
 *   KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD=N     (default 25)
 *
 * Invalid values (NaN, ≤0) fall back to the default for that field.
 */
export function readLimits(): Record<RateLimitTier, TierLimits> {
  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  return {
    light: {
      maxConcurrent: Math.floor(
        num(process.env.KHAT_RATE_LIMIT_LIGHT_CONCURRENT, DEFAULT_LIMITS.light.maxConcurrent),
      ),
      maxDailyCostUsd: num(
        process.env.KHAT_RATE_LIMIT_LIGHT_DAILY_USD,
        DEFAULT_LIMITS.light.maxDailyCostUsd,
      ),
    },
    expensive: {
      maxConcurrent: Math.floor(
        num(
          process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT,
          DEFAULT_LIMITS.expensive.maxConcurrent,
        ),
      ),
      maxDailyCostUsd: num(
        process.env.KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD,
        DEFAULT_LIMITS.expensive.maxDailyCostUsd,
      ),
    },
  }
}

// ─── Mode + bypass ───────────────────────────────────────────────────

/**
 * Read mode from `KHAT_RATE_LIMIT_MODE`. Anything but `off` / `enforce`
 * resolves to `report`, the default ship mode.
 */
export function readMode(): RateLimitMode {
  const v = (process.env.KHAT_RATE_LIMIT_MODE ?? "").trim().toLowerCase()
  if (v === "off") return "off"
  if (v === "enforce") return "enforce"
  return "report"
}

/**
 * Read the env-var actor allowlist. Comma-separated.
 *
 *   KHAT_RATE_LIMIT_BYPASS_ACTORS=retention,discovery-cron
 */
export function readActorAllowlist(): Set<string> {
  const raw = process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS ?? ""
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

// ─── Session bypass ──────────────────────────────────────────────────

/**
 * Process-level bypass token. Used by the eval CLI to disable rate
 * limiting for the duration of a benchmarking run without mutating
 * KHAT_RATE_LIMIT_MODE (which would also disable audit logging).
 *
 * Multiple concurrent session bypasses stack — counter-based so a
 * later release() doesn't accidentally end someone else's bypass.
 */
let _sessionBypassDepth = 0
let _sessionBypassLastReason: string | null = null

export function enableSessionBypass(reason: string): () => void {
  _sessionBypassDepth += 1
  _sessionBypassLastReason = reason
  let released = false
  return () => {
    if (released) return
    released = true
    _sessionBypassDepth = Math.max(0, _sessionBypassDepth - 1)
    if (_sessionBypassDepth === 0) _sessionBypassLastReason = null
  }
}

export function isSessionBypassActive(): { active: boolean; reason: string | null } {
  return {
    active: _sessionBypassDepth > 0,
    reason: _sessionBypassLastReason,
  }
}

// ─── Errors + types ──────────────────────────────────────────────────

export class RateLimitError extends Error {
  readonly decision: RateLimitDecision
  readonly detail: string
  constructor(decision: RateLimitDecision, detail: string) {
    super(`AI rate limit blocked: ${decision} — ${detail}`)
    this.name = "RateLimitError"
    this.decision = decision
    this.detail = detail
  }
}

export interface PermitRequest {
  taskKind: AiTaskKind
  actorId: string | null
  subjectTable: string | null
  subjectId: string | null
  bypassRateLimit?: boolean
}

export interface Permit {
  /** Caller must invoke once the AI call has completed (in finally). */
  release: () => Promise<void>
}

export interface PermitResult {
  decision: RateLimitDecision
  enforced: boolean
  tier: RateLimitTier
  permit: Permit
}

// ─── Subject-lock key + helpers ──────────────────────────────────────

function subjectLockKey(table: string, id: string): string {
  return `khat-rate-subj:${table}:${id}`
}

/**
 * Stale-row guard for `ai_subject_locks`. A lock row older than this
 * is presumed orphaned by a crashed process and pre-deleted on the
 * next acquire attempt. 10 minutes is well above any realistic
 * AI call latency (router default timeout is 120s).
 */
const SUBJECT_LOCK_STALE_MS = 10 * 60 * 1000

function randomToken(): string {
  // 16 hex chars from getRandomValues — enough to disambiguate
  // owners in the local DB. Avoids importing node:crypto to keep
  // this module isomorphic with the rest of lib/ai-router.
  const a = new Uint8Array(8)
  globalThis.crypto.getRandomValues(a)
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

const NULL_PERMIT: Permit = { release: async () => {} }

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Acquire a rate-limit permit for an upcoming AI call.
 *
 * Returns:
 *   - decision: what the policy thinks happened
 *   - enforced: true iff a blocked decision actually short-circuits
 *               the call (only in `enforce` mode for `blocked_*` decisions)
 *   - tier: which tier the call was classified under
 *   - permit: an object with `release()` — must be called in finally
 *
 * Throws `RateLimitError` only in `enforce` mode when a `blocked_*`
 * decision lands. REPORT mode never throws — it audits and returns.
 */
export async function acquireRateLimitPermit(
  req: PermitRequest,
): Promise<PermitResult> {
  if (!db) {
    // No DB — best-effort allow. The router's INSERT will fail anyway,
    // surfacing the real problem.
    return {
      decision: "allowed",
      enforced: false,
      tier: TASK_TIER[req.taskKind],
      permit: NULL_PERMIT,
    }
  }

  const mode = await getEffectiveMode()
  const tier = TASK_TIER[req.taskKind]

  // ─── 1. Mode = off → no audit, no enforcement ─────────────────────
  if (mode === "off") {
    return {
      decision: "allowed",
      enforced: false,
      tier,
      permit: NULL_PERMIT,
    }
  }

  // ─── 2. Bypass rules (logged for auditability) ────────────────────
  const bypassDecision = resolveBypass(req)
  if (bypassDecision) {
    await writeAuditEvent({
      mode,
      decision: bypassDecision,
      enforced: false,
      tier,
      taskKind: req.taskKind,
      actorId: req.actorId,
      subjectTable: req.subjectTable,
      subjectId: req.subjectId,
      currentConcurrency: null,
      concurrencyLimit: null,
      dailyCostSoFar: null,
      dailyCostLimit: null,
      metadata: { reason: bypassDecision },
    })
    return {
      decision: bypassDecision,
      enforced: false,
      tier,
      permit: NULL_PERMIT,
    }
  }

  // ─── 3. Evaluate permit under advisory lock ───────────────────────
  const limits = await getEffectiveLimits()
  const tierLimits = limits[tier]
  let subjectLockKeyHashHeld: string | null = null

  // 3a. Try to acquire the subject lock via the `ai_subject_locks` row
  //     table. We can't use pg_try_advisory_lock here because pool
  //     connection reuse makes session-scoped advisory locks reentrant —
  //     two sequential acquires from the same JS process can land on
  //     the same pg session, where pg_try_advisory_lock returns TRUE
  //     even though "another call" holds the lock. A row-with-unique-
  //     constraint enforces real exclusion across pool checkouts.
  //
  //     Stale-row guard: rows older than SUBJECT_LOCK_STALE_MS are
  //     considered orphaned (process crash mid-call) and pre-deleted
  //     so they don't block legitimate retries forever.
  let ownerToken: string | null = null
  if (req.subjectTable && req.subjectId) {
    ownerToken = randomToken()
    // Best-effort stale cleanup. Local-only contention; cheap.
    await db
      .execute(
        sql`DELETE FROM ai_subject_locks
            WHERE subject_table = ${req.subjectTable}
              AND subject_id    = ${req.subjectId}
              AND acquired_at   < NOW() - (INTERVAL '1 millisecond' * ${SUBJECT_LOCK_STALE_MS})`,
      )
      .catch(() => {})

    const acqRes = (await db
      .execute(sql`
        INSERT INTO ai_subject_locks (id, subject_table, subject_id, acquired_at, owner_token)
        VALUES (gen_random_uuid()::text, ${req.subjectTable}, ${req.subjectId}, NOW(), ${ownerToken})
        ON CONFLICT (subject_table, subject_id) DO NOTHING
        RETURNING owner_token
      `)
      .catch(() => ({ rows: [] as Array<{ owner_token: string }> }))) as unknown as {
      rows: Array<{ owner_token: string }>
    }
    const got = acqRes.rows.length > 0

    if (!got) {
      // Subject lock held by another in-flight call.
      const enforced = mode === "enforce"
      await writeAuditEvent({
        mode,
        decision: "blocked_subject_lock",
        enforced,
        tier,
        taskKind: req.taskKind,
        actorId: req.actorId,
        subjectTable: req.subjectTable,
        subjectId: req.subjectId,
        currentConcurrency: null,
        concurrencyLimit: tierLimits.maxConcurrent,
        dailyCostSoFar: null,
        dailyCostLimit: tierLimits.maxDailyCostUsd,
        metadata: { subject_lock_key: subjectLockKey(req.subjectTable, req.subjectId) },
      })
      // P2.3.d — mirror blocked_subject_lock to unified event log. Emits
      // in REPORT and ENFORCE both. Subject context goes into payload.
      void emitSystemEvent(
        buildRateLimitRejectedEvent({
          task_kind: req.taskKind,
          tier,
          decision: "blocked_subject_lock",
          mode,
          subject_table: req.subjectTable ?? null,
          subject_id: req.subjectId ?? null,
          actor: req.actorId ?? null,
        }),
      )
      if (enforced) {
        throw new RateLimitError(
          "blocked_subject_lock",
          `another AI call is already running for ${req.subjectTable}:${req.subjectId}`,
        )
      }
      // REPORT mode — allow through; no subject lock held.
      ownerToken = null
      return {
        decision: "blocked_subject_lock",
        enforced: false,
        tier,
        permit: NULL_PERMIT,
      }
    }
    subjectLockKeyHashHeld = subjectLockKey(req.subjectTable, req.subjectId)
  }

  // 3b. Permit eval: serialise via xact_lock so concurrent acquires
  //     don't race past the concurrency threshold. Quick — sub-ms.
  //
  //     Note on the array binding: Drizzle's sql template literal does
  //     NOT bind a JS array as a single text[] parameter — every value
  //     becomes its own placeholder. The working pattern in this
  //     codebase is `ANY(ARRAY[${sql.join(...)}]::text[])`. The earlier
  //     `ANY(${tierKinds}::text[])` form produced a malformed query and
  //     silently returned 0 rows, defeating the concurrency check.
  let decision: RateLimitDecision = "allowed"
  let currentConcurrency = 0
  let dailyCost = 0

  try {
    const evalRes = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('khat-rate-limit'))`,
      )

      // Concurrency: count running ai_runs of this tier.
      const tierKinds = Object.entries(TASK_TIER)
        .filter(([, t]) => t === tier)
        .map(([k]) => k)
      const kindsLiteral = sql.join(
        tierKinds.map((k) => sql`${k}`),
        sql`,`,
      )
      const concRes = (await tx.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM ai_runs
        WHERE status = 'running'
          AND task_kind = ANY(ARRAY[${kindsLiteral}]::text[])
      `)) as unknown as { rows: Array<{ n: number }> }
      const currentConc = concRes.rows[0]?.n ?? 0

      // Daily cost: sum cost_usd over today (UTC).
      const costRes = (await tx.execute(sql`
        SELECT COALESCE(SUM(cost_usd), 0)::float8 AS s
        FROM ai_runs
        WHERE task_kind = ANY(ARRAY[${kindsLiteral}]::text[])
          AND started_at >= date_trunc('day', NOW())
      `)) as unknown as { rows: Array<{ s: number }> }
      const sumCost = Number(costRes.rows[0]?.s ?? 0)

      let d: RateLimitDecision = "allowed"
      if (currentConc >= tierLimits.maxConcurrent) {
        d = "blocked_concurrency"
      } else if (sumCost >= tierLimits.maxDailyCostUsd) {
        d = "blocked_daily_cost"
      }
      return { decision: d, currentConc, sumCost }
    })
    decision = evalRes.decision
    currentConcurrency = evalRes.currentConc
    dailyCost = evalRes.sumCost
  } catch (err) {
    // Permit-eval failures must NOT block the AI call — the system
    // degrades to "allow". The router still INSERTs into ai_runs.
    if (subjectLockKeyHashHeld && ownerToken && req.subjectTable && req.subjectId) {
      await releaseSubjectLockRow(req.subjectTable, req.subjectId, ownerToken).catch(
        () => {},
      )
      subjectLockKeyHashHeld = null
      ownerToken = null
    }
    await writeAuditEvent({
      mode,
      decision: "allowed",
      enforced: false,
      tier,
      taskKind: req.taskKind,
      actorId: req.actorId,
      subjectTable: req.subjectTable,
      subjectId: req.subjectId,
      currentConcurrency: null,
      concurrencyLimit: tierLimits.maxConcurrent,
      dailyCostSoFar: null,
      dailyCostLimit: tierLimits.maxDailyCostUsd,
      metadata: { permit_eval_error: (err as Error).message ?? "unknown" },
    }).catch(() => {})
    return {
      decision: "allowed",
      enforced: false,
      tier,
      permit: NULL_PERMIT,
    }
  }

  const enforced = mode === "enforce" && decision.startsWith("blocked_")

  // ─── 4. Audit + outcome ────────────────────────────────────────────
  await writeAuditEvent({
    mode,
    decision,
    enforced,
    tier,
    taskKind: req.taskKind,
    actorId: req.actorId,
    subjectTable: req.subjectTable,
    subjectId: req.subjectId,
    currentConcurrency,
    concurrencyLimit: tierLimits.maxConcurrent,
    dailyCostSoFar: dailyCost,
    dailyCostLimit: tierLimits.maxDailyCostUsd,
    metadata: null,
  })

  // P2.3.d — mirror blocked_* decisions (concurrency / daily-cost) to
  // unified event log. Emits in REPORT and ENFORCE both. The `allowed`
  // path does NOT emit — rejects-only policy.
  if (decision !== "allowed" && decision.startsWith("blocked_")) {
    void emitSystemEvent(
      buildRateLimitRejectedEvent({
        task_kind: req.taskKind,
        tier,
        decision,
        mode,
        subject_table: req.subjectTable ?? null,
        subject_id: req.subjectId ?? null,
        actor: req.actorId ?? null,
      }),
    )
  }

  if (enforced) {
    if (subjectLockKeyHashHeld && ownerToken && req.subjectTable && req.subjectId) {
      await releaseSubjectLockRow(req.subjectTable, req.subjectId, ownerToken).catch(
        () => {},
      )
    }
    if (decision === "blocked_concurrency") {
      throw new RateLimitError(
        "blocked_concurrency",
        `${tier}-tier concurrency limit reached (${currentConcurrency}/${tierLimits.maxConcurrent})`,
      )
    }
    if (decision === "blocked_daily_cost") {
      throw new RateLimitError(
        "blocked_daily_cost",
        `${tier}-tier daily cost limit reached ($${dailyCost.toFixed(4)}/$${tierLimits.maxDailyCostUsd.toFixed(2)})`,
      )
    }
    // Shouldn't reach here, but fall-through is safe.
    throw new RateLimitError(decision, "blocked by policy")
  }

  // ─── 5. Build permit. Release frees the subject lock if held. ─────
  const heldTable = req.subjectTable
  const heldId = req.subjectId
  const heldToken = ownerToken
  const permit: Permit = {
    release: async () => {
      if (heldTable && heldId && heldToken) {
        await releaseSubjectLockRow(heldTable, heldId, heldToken).catch(() => {})
      }
    },
  }

  return { decision, enforced: false, tier, permit }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function resolveBypass(req: PermitRequest): RateLimitDecision | null {
  if (req.bypassRateLimit === true) return "bypassed_call"
  if (req.actorId) {
    const allow = readActorAllowlist()
    if (allow.has(req.actorId)) return "bypassed_actor"
  }
  const sess = isSessionBypassActive()
  if (sess.active) return "bypassed_session"
  return null
}

async function releaseSubjectLockRow(
  table: string,
  id: string,
  ownerToken: string,
): Promise<void> {
  if (!db) return
  // Owner-token guarded delete: a stale-cleanup acquire by another
  // process can't accidentally release the wrong lock if the token
  // doesn't match.
  await db.execute(sql`
    DELETE FROM ai_subject_locks
    WHERE subject_table = ${table}
      AND subject_id    = ${id}
      AND owner_token   = ${ownerToken}
  `)
}

interface AuditInput {
  mode: RateLimitMode
  decision: RateLimitDecision
  enforced: boolean
  tier: RateLimitTier
  taskKind: AiTaskKind
  actorId: string | null
  subjectTable: string | null
  subjectId: string | null
  currentConcurrency: number | null
  concurrencyLimit: number | null
  dailyCostSoFar: number | null
  dailyCostLimit: number | null
  metadata: Record<string, unknown> | null
}

async function writeAuditEvent(e: AuditInput): Promise<void> {
  if (!db) return
  try {
    await db.execute(sql`
      INSERT INTO ai_rate_limit_events (
        id, created_at, mode, decision, enforced, tier, task_kind,
        actor_id, subject_table, subject_id,
        current_concurrency, concurrency_limit,
        daily_cost_so_far_usd, daily_cost_limit_usd, metadata
      ) VALUES (
        gen_random_uuid()::text,
        NOW(),
        ${e.mode},
        ${e.decision},
        ${e.enforced ? "true" : "false"},
        ${e.tier},
        ${e.taskKind},
        ${e.actorId},
        ${e.subjectTable},
        ${e.subjectId},
        ${e.currentConcurrency},
        ${e.concurrencyLimit},
        ${e.dailyCostSoFar},
        ${e.dailyCostLimit},
        ${e.metadata === null ? null : JSON.stringify(e.metadata)}::jsonb
      )
    `)
  } catch {
    // Audit failure must not break the AI call.
  }
}
