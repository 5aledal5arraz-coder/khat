/**
 * Khat Brain — worker loop.
 *
 * Long-running process that polls the jobs table, claims pending work,
 * runs the registered handler, and writes results back. Designed to run
 * as a separate Node process via the `worker` npm script. Multiple
 * workers can run in parallel — claims use FOR UPDATE SKIP LOCKED.
 *
 * Configuration via env:
 *   WORKER_POLL_MS          default 2000  (claim cadence when idle)
 *   WORKER_LEASE_MS         default 300000 (5min — stale-claim reaper window)
 *   WORKER_ID               default randomly generated
 */

// Must be first — loads .env.local before ./queue pulls in @/lib/db and
// initializes the pg pool. No-op in production. See load-env.ts.
import "./load-env"
import { randomUUID } from "node:crypto"
import { validateEnv } from "@/lib/env"
import {
  claimNextJob,
  completeJob,
  failJob,
  reclaimStaleJobs,
} from "./queue"
import { getHandler, listRegisteredTypes } from "./registry"
import {
  ensureMarketScheduler,
  ensureAiRunsSweeperSchedule,
  ensurePartnerTaskReminderSchedule,
  ensureSourceFeedbackSchedule,
} from "./scheduler-bootstrap"
import { HandlerTimeoutError } from "./types"
import "./registered"
// Phase 2.3.c — unified event log writers. Fire-and-forget per emit
// contract; failures are caught inside emitSystemEvent and never
// propagate here.
import { emitSystemEvent } from "@/lib/system-events/emit"
import {
  buildJobsClaimedEvent,
  buildJobsSucceededEvent,
  buildJobsFailedEvent,
  buildJobsDeadEvent,
  buildJobsReclaimedEvent,
  buildScheduleCreatedEvent,
} from "@/lib/system-events/builders"

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000)
const LEASE_MS = Number(process.env.WORKER_LEASE_MS ?? 300_000)
const WORKER_ID = process.env.WORKER_ID ?? `worker-${randomUUID().slice(0, 8)}`

// ─── Retry backoff ───────────────────────────────────────────────────
// A failed job must NOT retry immediately — that burns all max_attempts in
// milliseconds during a transient upstream outage (rate-limit, 5xx, timeout).
// Exponential backoff with jitter, computed from the attempt number, capped.
const RETRY_BASE_MS = Number(process.env.WORKER_RETRY_BASE_MS ?? 10_000) // 10s
const RETRY_CAP_MS = Number(process.env.WORKER_RETRY_CAP_MS ?? 600_000) // 10min

/** Backoff for the NEXT attempt after `attempts` failures (attempts ≥ 1). */
function computeRetryAfter(attempts: number): Date {
  const exp = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1))
  const jitter = Math.floor(Math.random() * 0.25 * exp) // up to +25% to avoid thundering herds
  return new Date(Date.now() + exp + jitter)
}

// ─── A7 — per-handler timeout isolation ──────────────────────────────
//
// Without these the worker can be wedged indefinitely by a hung
// OpenAI / fetch call. The lease reaper recovers DEAD workers, not
// live-hung handlers. Each handler runs inside a Promise.race against
// a per-type timeout; on expiry the worker throws HandlerTimeoutError,
// which flows through the existing failJob path (and existing
// retry-vs-dead semantics) untouched.
//
// Default 5 minutes. Per-type overrides below are calibrated against
// observed p99 wall times of the slow handlers. Adjust here when a
// type's real-world latency profile shifts; no code change needed at
// the handler.
//
// Optional env override: WORKER_HANDLER_TIMEOUT_MS sets the default.
// Per-type overrides are NOT exposed via env to keep config in one
// place and reviewable in a single diff (operator §rules: "no hidden
// config sprawl").

const DEFAULT_HANDLER_TIMEOUT_MS = Number(
  process.env.WORKER_HANDLER_TIMEOUT_MS ?? 5 * 60_000,
)

const HANDLER_TIMEOUT_MS: Record<string, number> = {
  // ai-runs-sweeper: lightweight SELECT-and-update; never AI-bound.
  "ai-runs-sweeper": 60_000,
  // demo.echo: ~50ms in practice; very tight ceiling catches regressions.
  "demo.echo": 10_000,
  // market.scheduler / taste_decay just enqueue/decay — no AI calls.
  "market.scheduler": 60_000,
  "market.taste_decay": 60_000,
  // market.collect fetches from sources (network-bound, not AI).
  "market.collect": 5 * 60_000,
  // AI-bound handlers: extract fills theme/emotional_trigger via the AI
  // router; score/cluster run the editorial model over the backlog. These
  // need more than the 5-min default when a backlog has built up.
  // NOTE: keys MUST equal the registered handler types exactly. The earlier
  // "market.scoring"/"market.cluster" keys matched no handler (real types are
  // "market.score_signals"/"market.cluster_signals") and "market.extract" had
  // no entry at all, so all three silently ran on the 5-min default and timed
  // out on large backlogs → dead jobs.
  "market.extract": 15 * 60_000,
  "market.score_signals": 15 * 60_000,
  "market.cluster_signals": 10 * 60_000,
  // youtube.refresh_performance: YouTube Data API + DB updates per channel.
  "youtube.refresh_performance": 5 * 60_000,
  // discovery_v2.run: one job does propose + many Wikidata/enrichment HTTP
  // calls for up to ~30 names; generous budget for the network fan-out.
  "discovery_v2.run": 10 * 60_000,
  // original.generate_topics: AI-bound on full transcripts; allow generous budget.
  "original.generate_topics": 15 * 60_000,
  // newsletter.send_campaign: batched Resend sends; resumable across retries,
  // so a single run only needs to cover one pass over the queued recipients.
  "newsletter.send_campaign": 10 * 60_000,
  // partner.task_reminder: one SELECT + a handful of digest emails; lightweight.
  "partner.task_reminder": 60_000,
  // market.source_feedback: batch of SELECTs + small trust updates; lightweight.
  "market.source_feedback": 60_000,
}

function timeoutFor(jobType: string): number {
  return HANDLER_TIMEOUT_MS[jobType] ?? DEFAULT_HANDLER_TIMEOUT_MS
}

// Guard against the recurring "timeout key doesn't match a registered handler"
// bug (it has silently dead-lettered market.*, discovery.*, youtube.* and
// original.* handlers in the past). Handlers self-register at import time via
// "./registered", so by now the registry is fully populated. A stray key means
// a handler is silently running on the 5-min default instead of its intended
// budget — warn loudly so it's caught at boot, not in production.
function assertTimeoutKeysAreRegistered(): void {
  const registered = new Set(listRegisteredTypes())
  const stray = Object.keys(HANDLER_TIMEOUT_MS).filter((t) => !registered.has(t))
  if (stray.length > 0) {
    console.warn(
      `[${WORKER_ID}] HANDLER_TIMEOUT_MS has ${stray.length} key(s) with no registered handler: ${stray.join(", ")}. ` +
        `These are dead — the handlers they were meant to cap are running on the ${DEFAULT_HANDLER_TIMEOUT_MS / 60_000}-min default.`,
    )
  }
}

let stopping = false

async function processOne(): Promise<boolean> {
  const job = await claimNextJob(WORKER_ID)
  if (!job) return false

  console.log(
    `[${WORKER_ID}] running ${job.type} (id=${job.id} attempt=${job.attempts}/${job.max_attempts})`,
  )

  // P2.3.c — mirror claim to unified event log. Fire-and-forget.
  void emitSystemEvent(
    buildJobsClaimedEvent({
      job_id: job.id,
      job_type: job.type,
      priority: job.priority,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      actor: WORKER_ID,
    }),
  )

  // P2.3.c — capture wall-clock anchor for `duration_ms` on the
  // succeeded/failed paths. `started_at` is set by `claimNextJob` and
  // mirrors what landed in the row; fall back to `Date.now()` if the
  // claim row's started_at couldn't be parsed (defensive).
  const startedAtMs = job.started_at
    ? Date.parse(job.started_at) || Date.now()
    : Date.now()

  const handler = getHandler(job.type)
  if (!handler) {
    const message = `No handler registered for job type "${job.type}"`
    const outcome = await failJob(job.id, message)
    console.error(`[${WORKER_ID}] no handler for "${job.type}"`)
    if (outcome.status === "dead") {
      void emitSystemEvent(
        buildJobsDeadEvent({
          job_id: job.id,
          job_type: job.type,
          error_message: message,
          attempts: outcome.attempts,
          actor: WORKER_ID,
        }),
      )
    } else {
      void emitSystemEvent(
        buildJobsFailedEvent({
          job_id: job.id,
          job_type: job.type,
          error_message: message,
          attempts: outcome.attempts,
          max_attempts: outcome.max_attempts,
          actor: WORKER_ID,
        }),
      )
    }
    return true
  }

  // A7 — race the handler against a per-type timeout. The original
  // handler promise is kept in a separate variable so we can attach a
  // late `.catch()` (preventing an unhandled-rejection if it eventually
  // settles AFTER the race has already rejected with a timeout). We
  // also leave a tracer to log when an orphaned handler finally lands —
  // operator signal that the handler is slow-but-not-stuck.
  const handlerStart = Date.now()
  const timeoutMs = timeoutFor(job.type)
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const handlerPromise = handler(job.payload, {
    jobId: job.id,
    jobType: job.type,
    attempt: job.attempts,
    maxAttempts: job.max_attempts,
    workerId: WORKER_ID,
  })
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new HandlerTimeoutError({
          jobType: job.type,
          elapsedMs: Date.now() - handlerStart,
          timeoutMs,
        }),
      )
    }, timeoutMs)
  })
  // Detach a late tracer + suppression on the original handler promise.
  // After Promise.race resolves/rejects, this attaches but doesn't
  // block the loop. Two effects:
  //   1. Prevents Node from logging "UnhandledPromiseRejectionWarning"
  //      if the handler eventually throws AFTER the timeout fired.
  //   2. Logs (info) when the handler eventually does finish, so the
  //      operator can tell "handler is slow" from "handler is stuck".
  handlerPromise.then(
    () => {
      const elapsed = Date.now() - handlerStart
      if (elapsed > timeoutMs) {
        console.warn(
          `[${WORKER_ID}] late-arrived handler completion for ${job.id} ` +
            `(elapsed=${elapsed}ms, budget=${timeoutMs}ms) — result discarded`,
        )
      }
    },
    (err) => {
      const elapsed = Date.now() - handlerStart
      if (elapsed > timeoutMs) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[${WORKER_ID}] late-arrived handler rejection for ${job.id} ` +
            `(elapsed=${elapsed}ms, budget=${timeoutMs}ms): ${msg} — already failed via timeout`,
        )
      }
    },
  )

  try {
    const result = await Promise.race([handlerPromise, timeoutPromise])
    // Race won by the handler — clear the timer so it doesn't fire
    // after we've already moved on (would still be safe due to the
    // .race resolving, but cleaner to clear).
    if (timeoutHandle) clearTimeout(timeoutHandle)
    await completeJob(
      job.id,
      (result ?? null) as Record<string, unknown> | null,
    )
    console.log(`[${WORKER_ID}] succeeded ${job.id}`)
    void emitSystemEvent(
      buildJobsSucceededEvent({
        job_id: job.id,
        job_type: job.type,
        duration_ms: Date.now() - startedAtMs,
        actor: WORKER_ID,
      }),
    )
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    const isTimeout = err instanceof HandlerTimeoutError
    const message = err instanceof Error ? err.message : String(err)
    // Back off before the next attempt so transient failures don't exhaust
    // max_attempts instantly. failJob ignores run_after once the job is dead.
    const outcome = await failJob(job.id, message, computeRetryAfter(job.attempts))
    if (isTimeout) {
      console.error(
        `[${WORKER_ID}] TIMEOUT ${job.id}: ${message} — flowing through failJob (attempts=${outcome.attempts}/${outcome.max_attempts})`,
      )
    } else {
      console.error(`[${WORKER_ID}] failed ${job.id}: ${message}`)
    }
    if (outcome.status === "dead") {
      void emitSystemEvent(
        buildJobsDeadEvent({
          job_id: job.id,
          job_type: job.type,
          error_message: message,
          attempts: outcome.attempts,
          actor: WORKER_ID,
        }),
      )
    } else {
      void emitSystemEvent(
        buildJobsFailedEvent({
          job_id: job.id,
          job_type: job.type,
          error_message: message,
          attempts: outcome.attempts,
          max_attempts: outcome.max_attempts,
          actor: WORKER_ID,
        }),
      )
    }
  }
  return true
}

async function loop(): Promise<void> {
  let lastReclaimAt = 0
  let pollCount = 0
  while (!stopping) {
    try {
      // Periodically reap stale claims (workers that died mid-execution).
      if (Date.now() - lastReclaimAt > LEASE_MS) {
        const reclaimed = await reclaimStaleJobs(LEASE_MS)
        if (reclaimed.length > 0) {
          console.log(`[${WORKER_ID}] reclaimed ${reclaimed.length} stale job(s)`)
          // P2.3.c — emit one event per reclaimed row.
          for (const row of reclaimed) {
            void emitSystemEvent(
              buildJobsReclaimedEvent({
                job_id: row.id,
                job_type: row.type,
                previous_locked_by: row.previous_locked_by,
                lease_ms: LEASE_MS,
                actor: WORKER_ID,
              }),
            )
          }
        }
        lastReclaimAt = Date.now()
      }

      // Phase 2.1 (P2.1.f) — every 100th poll (~3 min at default cadence),
      // re-check that an `ai-runs-sweeper` tick is queued for the future.
      // Keeps the schedule alive without requiring the handler to
      // self-re-enqueue. Idempotent: no-op when a tick is already pending.
      pollCount += 1
      if (pollCount % 100 === 0) {
        ensureAiRunsSweeperSchedule()
          .then((r) => {
            if (r.status === "bootstrapped") {
              console.log(
                `[${WORKER_ID}] ai-runs-sweeper re-scheduled` +
                  (r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""),
              )
              // P2.3.c — periodic re-bootstrap is the rare "missed tick"
              // case. Emit per operator §6 Q4.
              const intervalMs = Number(
                process.env.KHAT_AI_RUNS_SWEEP_INTERVAL_MS ?? 30 * 60 * 1000,
              )
              const cadence = `${Math.round(intervalMs / 60_000)}m`
              void emitSystemEvent(
                buildScheduleCreatedEvent({
                  schedule_type: "ai-runs-sweeper",
                  cadence,
                  actor: WORKER_ID,
                }),
              )
            }
          })
          .catch((err) =>
            console.error(
              `[${WORKER_ID}] ai-runs-sweeper re-schedule failed:`,
              err,
            ),
          )
      }

      const didWork = await processOne()
      if (!didWork) {
        await sleep(POLL_MS)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[${WORKER_ID}] loop error:`, msg)
      await sleep(POLL_MS)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown(reason: string): void {
  if (stopping) return
  stopping = true
  console.log(`[${WORKER_ID}] shutting down (${reason})`)
  // Give the in-flight job a moment to wrap up; we don't force-kill.
  setTimeout(() => process.exit(0), 1500)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

console.log(`[${WORKER_ID}] starting (poll=${POLL_MS}ms lease=${LEASE_MS}ms)`)

// Fail hard on missing REQUIRED config (e.g. DATABASE_URL) — a worker without a
// database is useless, so crash loudly at boot rather than on the first claim.
validateEnv()

assertTimeoutKeysAreRegistered()

// Phase 2.2 — eager startup reclaim. If a predecessor worker crashed
// mid-job, its `locked_at` is already older than LEASE_MS by the time
// PM2 restarts us (restart_delay >= 2s, crash gap typically much
// larger). Calling reclaimStaleJobs here returns those rows to
// `pending` immediately so we don't have to wait for the in-loop
// reaper to fire (which only runs once every LEASE_MS = 5 min).
reclaimStaleJobs(LEASE_MS)
  .then((reclaimed) => {
    if (reclaimed.length > 0) {
      console.log(`[${WORKER_ID}] startup: reclaimed ${reclaimed.length} stale job(s)`)
      // P2.3.c — emit one event per reclaimed row.
      for (const row of reclaimed) {
        void emitSystemEvent(
          buildJobsReclaimedEvent({
            job_id: row.id,
            job_type: row.type,
            previous_locked_by: row.previous_locked_by,
            lease_ms: LEASE_MS,
            actor: WORKER_ID,
          }),
        )
      }
    }
  })
  .catch((err) =>
    console.error(`[${WORKER_ID}] startup reclaim failed:`, err),
  )

// Bootstrap the market-intelligence scheduler so it ticks daily
// without any external cron. Idempotent — no-op if a tick already
// exists in the queue.
ensureMarketScheduler()
  .then((r) => {
    console.log(
      `[${WORKER_ID}] market scheduler ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
    )
    // P2.3.c — only the "bootstrapped" branch is a meaningful event.
    // "already_scheduled" is a no-op and stays silent.
    if (r.status === "bootstrapped") {
      void emitSystemEvent(
        buildScheduleCreatedEvent({
          schedule_type: "market.scheduler",
          cadence: "daily",
          actor: WORKER_ID,
        }),
      )
    }
  })
  .catch((err) =>
    console.error(`[${WORKER_ID}] market scheduler bootstrap failed:`, err),
  )

// Phase 2.1 (P2.1.f) — bootstrap the ai-runs-sweeper schedule so the
// stale-running reclaim runs every KHAT_AI_RUNS_SWEEP_INTERVAL_MS
// (default 30 min). Idempotent.
ensureAiRunsSweeperSchedule()
  .then((r) => {
    console.log(
      `[${WORKER_ID}] ai-runs-sweeper schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
    )
    // P2.3.c — same gating pattern as the market scheduler above.
    if (r.status === "bootstrapped") {
      const intervalMs = Number(
        process.env.KHAT_AI_RUNS_SWEEP_INTERVAL_MS ?? 30 * 60 * 1000,
      )
      const cadence = `${Math.round(intervalMs / 60_000)}m`
      void emitSystemEvent(
        buildScheduleCreatedEvent({
          schedule_type: "ai-runs-sweeper",
          cadence,
          actor: WORKER_ID,
        }),
      )
    }
  })
  .catch((err) =>
    console.error(
      `[${WORKER_ID}] ai-runs-sweeper bootstrap failed:`,
      err,
    ),
  )

// Bootstrap the partnership task-reminder schedule so overdue/due-soon
// follow-ups get emailed daily. Handler self-re-enqueues; idempotent.
ensurePartnerTaskReminderSchedule()
  .then((r) => {
    console.log(
      `[${WORKER_ID}] partner task-reminder schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
    )
    if (r.status === "bootstrapped") {
      const intervalMs = Number(
        process.env.KHAT_PARTNER_REMINDER_INTERVAL_MS ?? 24 * 60 * 60 * 1000,
      )
      const cadence = `${Math.round(intervalMs / 3_600_000)}h`
      void emitSystemEvent(
        buildScheduleCreatedEvent({
          schedule_type: "partner.task_reminder",
          cadence,
          actor: WORKER_ID,
        }),
      )
    }
  })
  .catch((err) =>
    console.error(`[${WORKER_ID}] partner task-reminder bootstrap failed:`, err),
  )

// Bootstrap the market source-feedback sweep (performance → source trust).
// Handler self-re-enqueues daily; idempotent.
ensureSourceFeedbackSchedule()
  .then((r) => {
    console.log(
      `[${WORKER_ID}] source-feedback schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
    )
    if (r.status === "bootstrapped") {
      void emitSystemEvent(
        buildScheduleCreatedEvent({
          schedule_type: "market.source_feedback",
          cadence: "daily",
          actor: WORKER_ID,
        }),
      )
    }
  })
  .catch((err) =>
    console.error(`[${WORKER_ID}] source-feedback bootstrap failed:`, err),
  )

loop().catch((err) => {
  console.error(`[${WORKER_ID}] fatal:`, err)
  process.exit(1)
})
