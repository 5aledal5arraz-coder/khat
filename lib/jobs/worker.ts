/**
 * Khat Brain — worker loop.
 *
 * Long-running process that polls the jobs table, claims pending work,
 * runs the registered handler, and writes results back. Designed to run
 * as a separate Node process via the `worker` npm script. Multiple
 * workers can run in parallel — claims use FOR UPDATE SKIP LOCKED.
 *
 * Two claim LANES run side by side, one job slot each (lib/jobs/lanes.ts):
 * "heavy" (Studio transcription/maps, benchmarks, market batches) and
 * "interactive" (everything an operator clicked and is waiting on). A 30-min
 * transcription no longer holds the only slot while a prep generation waits.
 *
 * Configuration via env:
 *   WORKER_POLL_MS          default 2000  (claim cadence when idle)
 *   DB_POOL_MAX             set to 4 by the `worker` script / PM2 env: two
 *                           lanes + heartbeat + progress writes. Script mode
 *                           would otherwise default the pool to 2.
 *   WORKER_LEASE_MS         default 120000 (2min) — no-renewal window after
 *                           which a running job's owner is presumed dead and
 *                           the job is reclaimed (lib/jobs/lease.ts). This
 *                           worker renews its own jobs every 20s.
 *   WORKER_ID               default randomly generated
 */

// Must be first — loads .env.local before ./queue pulls in @/lib/db and
// initializes the pg pool. No-op in production. See load-env.ts.
import "./load-env"
import { randomUUID } from "node:crypto"
import { hostname } from "node:os"
import { log } from "@/lib/log"
import { validateEnv } from "@/lib/env"
import {
  claimNextJob,
  completeJob,
  failJob,
  reclaimStaleJobs,
  renewJobLease,
  type ReclaimedJob,
} from "./queue"
import { createProgressReporter } from "./progress-reporter"
import {
  leaseStaleMs,
  LEASE_RENEW_INTERVAL_MS,
  REAP_INTERVAL_MS,
} from "./lease"
import { getHandler, listRegisteredTypes } from "./registry"
import {
  ensureMarketScheduler,
  ensureAiRunsSweeperSchedule,
  ensurePartnerTaskReminderSchedule,
  ensureSourceFeedbackSchedule,
  ensureYoutubeAudienceSchedule,
  ensurePodcastWeeklySyncSchedule,
} from "./scheduler-bootstrap"
import { HandlerTimeoutError, NonRetryableJobError, type JobRow } from "./types"
import {
  readWorkerHeartbeat,
  startWorkerHeartbeat,
  type WorkerHeartbeatHandle,
} from "./heartbeat"
import { WORKER_LANES, type WorkerLane } from "./lanes"
import { checkMigrationDrift, formatDriftMessage } from "@/lib/db/migration-guard"
import { isQuotaExceededError, QUOTA_EXCEEDED_MESSAGE } from "@/lib/ai-router/errors"
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
// No-renewal window after which a running job is reclaimed (lib/jobs/lease.ts).
const LEASE_MS = leaseStaleMs(Number(process.env.WORKER_LEASE_MS ?? NaN))
const HOST = hostname()
const WORKER_ID = process.env.WORKER_ID ?? `worker-${randomUUID().slice(0, 8)}`
const wlog = log.child(WORKER_ID)

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
  // market.collect fetches from sources (network-bound, not AI). This budget
  // caps ONE SLICE, not a whole collection run: the handler processes presets
  // until COLLECT_SLICE_MS (180s) then hands the remainder to a fresh job, so
  // its wall time no longer grows with the preset count or the number of
  // enabled sources. Worst case = 180s + one preset (~24s grounded) = 204s.
  // Do NOT raise this to "fix" a timeout — a collect that needs more than 300s
  // means the slice budget is wrong, not this one. See the handler's header.
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
  // youtube.audience_refresh: one token refresh + two Analytics reports + two
  // inserts, weekly. No AI. A tight ceiling catches a hung Google call.
  "youtube.audience_refresh": 2 * 60_000,
  // discovery_v2.run: one job does propose (300s + one timeout retry,
  // worst ≈ 608s) + Wikidata/enrichment/story fan-out for up to ~30 names.
  // MUST equal DISCOVERY_JOB_BUDGET_MS in lib/discovery-v2/pipeline.ts —
  // the pipeline's top-up and story deadlines are computed from it
  // (tests/ai-router/discovery-propose-budget.test.ts pins the two).
  // 16 min since batch 2 (2026-09-28): the witness-profiles step (≤45s) runs
  // before propose; at 15 min the worst case left 7s of margin.
  "discovery_v2.run": 16 * 60_000,
  // original.generate_topics: AI-bound on full transcripts; allow generous budget.
  "original.generate_topics": 15 * 60_000,
  // newsletter.send_campaign: batched Resend sends; resumable across retries,
  // so a single run only needs to cover one pass over the queued recipients.
  "newsletter.send_campaign": 10 * 60_000,
  // partner.task_reminder: one SELECT + a handful of digest emails; lightweight.
  "partner.task_reminder": 60_000,
  // market.source_feedback: batch of SELECTs + small trust updates; lightweight.
  "market.source_feedback": 60_000,
  // model.benchmark: ~20 AI calls incl. long-context + high-effort judges;
  // sequential pairs keep load sane but the wall-clock adds up.
  "model.benchmark": 30 * 60_000,
  // studio.episode_map: whisper-1 timestamped transcription of a full ~2h raw
  // recording (chunked, sequential) + ffmpeg silencedetect + one analysis call.
  // The transcription wall-clock dominates; generous budget.
  "studio.episode_map": 30 * 60_000,
  // studio.episode_review: whisper-1 timestamped transcription of the full
  // EDITED recording (transcription-dominated, same as episode_map) + the pure,
  // instant verdict algorithm. Same 30-min budget.
  "studio.episode_review": 30 * 60_000,
  // candidate.analyze / candidate.outreach_generate: one editorial AI call each
  // over a small profile snapshot (no transcript, no chunking). The 5-min
  // default would do; a slightly wider budget absorbs the router's retry/backoff
  // ladder on a transient blip without a spurious timeout.
  "candidate.analyze": 8 * 60_000,
  "candidate.outreach_generate": 8 * 60_000,
  // episode.conversation_generate: prepareTranscript chunk-summarizes a full
  // ~2h transcript (memoized by content hash, so usually warm) then makes ONE
  // editorial call. Measured end-to-end at ~132s cold; 15 min leaves room for
  // a cold cache plus the router's retry ladder without a spurious timeout.
  "episode.conversation_generate": 15 * 60_000,
  // email.notify_submission: two Resend calls, no AI, no transcript. A tight
  // ceiling is the point — if Resend is hanging we want the retry ladder, not
  // a worker slot held for five minutes per submission.
  "email.notify_submission": 60_000,
  // ── Slow AI moved off the request path (2026-09-28) ──
  // prep.generate_v2: five sequential AI passes (research → structure →
  // questions → critique [+ one critique retry] → grounded insight cards).
  // ~6 min typical; each pass can ride the router's retry ladder, and Pass 5
  // grounds each card on the web. 25 min absorbs the worst measured case.
  "prep.generate_v2": 25 * 60_000,
  // season.hybrid_generate: the generator enforces its own 580s wall
  // (HYBRID_GEN_WALL_MS); 15 min leaves room for the persist + a slow DB.
  "season.hybrid_generate": 15 * 60_000,
  // season.batch_generate: one guided batch (oversample → judge → enrich) or
  // a guest-first run; measured single-digit minutes.
  "season.batch_generate": 12 * 60_000,
  // studio.transcribe: gpt-4o-transcribe over a full episode, chunked and
  // sequential (+ yt-dlp download for the youtube source). Same budget as the
  // other full-episode transcription handlers.
  "studio.transcribe": 30 * 60_000,
  // ── Podcast Universe M1 (docs/podcast-universe-plan-v1.md §B11) ──
  // verify: one or two channels.list calls (+ in-call retry backoff).
  "podcast.channel.verify": 2 * 60_000,
  // initial_crawl: a whole uploads playlist, ~2 one-unit calls per 50 videos —
  // ~40 pages for the largest seed channel, checkpointed per page, so a
  // timeout resumes from the last page instead of starting over.
  "podcast.channel.initial_crawl": 20 * 60_000,
  // incremental_crawl: ≥2 newest pages until the B5 overlap rule stops it.
  "podcast.channel.incremental_crawl": 10 * 60_000,
  // guest_extract: ONE Luna call per job (router default 120s × up to 3
  // attempts + backoff ≈ 6.5 min worst case) + per-episode DB writes.
  "podcast.episode.guest_extract": 10 * 60_000,
  // person.resolve: deterministic DB pass over ≤200 people; no network.
  "podcast.person.resolve": 5 * 60_000,
  // weekly_sync: only enqueues incremental crawls.
  "podcast.weekly_sync": 2 * 60_000,
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
    wlog.warn(
      `HANDLER_TIMEOUT_MS has ${stray.length} key(s) with no registered handler: ${stray.join(", ")}. ` +
        `These are dead — the handlers they were meant to cap are running on the ${DEFAULT_HANDLER_TIMEOUT_MS / 60_000}-min default.`,
    )
  }
}

// Same boot-guard idea as above, one layer down: the handler timeouts can only
// be right if the SCHEMA is right. A worker running against a database that is
// N migrations behind the code doesn't fail at boot — it fails hours later,
// inside a random handler, as a dead job with a "column does not exist" message
// that points nowhere near the actual problem. That is exactly how the local DB
// stayed 9 migrations behind for 22 days.
//
// Unlike the timeout guard this one is FATAL when drift is confirmed: there is
// no useful work a worker can do against the wrong schema. It is deliberately
// NOT fatal when the check itself can't run (no pool, unreachable host) — an
// unreachable database is not evidence of drift.
//
// Escape hatch: KHAT_SKIP_MIGRATION_GUARD=1 downgrades it to a warning, for the
// case where an operator knowingly needs a worker up before migrating.
async function assertNoMigrationDrift(): Promise<void> {
  const result = await checkMigrationDrift()

  if (result.status === "in_sync") {
    wlog.info(`migration guard: in sync (${result.applied}/${result.expected})`)
    return
  }

  if (result.status === "unknown") {
    wlog.warn(`migration guard: تعذّر الفحص — ${result.reason}. الاستمرار بدون تحقق.`)
    return
  }

  const message = formatDriftMessage(result)
  if (process.env.KHAT_SKIP_MIGRATION_GUARD === "1") {
    wlog.warn(`migration guard (متجاوَز عبر KHAT_SKIP_MIGRATION_GUARD):\n${message}`)
    return
  }

  wlog.error(
    `توقّف الـ worker عند الإقلاع.\n${message}\n` +
      "  (للتجاوز المؤقت وعلى مسؤوليتك: KHAT_SKIP_MIGRATION_GUARD=1)",
  )
  process.exit(1)
}

let stopping = false

// ─── Liveness heartbeat ──────────────────────────────────────────────
// The job type currently in flight, or null when this worker is idle. Read by
// the heartbeat timer (see below) so every beat carries the worker's CURRENT
// busy/idle state — that is what lets the ops page tell "شغّال بلا مهام" apart
// from "ما يرد" instead of calling every quiet stretch a death.
// Per claim lane: the job that lane is running (for the heartbeat and the
// lease-renewal timer), or null when idle.
interface LaneJob {
  id: string
  type: string
  attempts: number
}
const laneJob: Record<WorkerLane, LaneJob | null> = { heavy: null, interactive: null }
const laneJobType = (lane: WorkerLane): string | null => laneJob[lane]?.type ?? null

/** ISO boot timestamp — display context on the ops page, never a health input. */
const BOOTED_AT = new Date().toISOString()

/** The heartbeat timer. Assigned once at boot; see the call site below. */
let heartbeat: WorkerHeartbeatHandle | null = null

async function processOne(lane: WorkerLane): Promise<boolean> {
  const job = await claimNextJob(WORKER_ID, lane)
  if (!job) return false
  laneJob[lane] = { id: job.id, type: job.type, attempts: job.attempts }
  // Beat on both transitions so the reported busy/idle state is exact rather
  // than up to one interval stale — see WorkerHeartbeatHandle.beat.
  heartbeat?.beat()
  try {
    return await runClaimedJob(job)
  } finally {
    // Cleared on EVERY exit path (success, failure, throw) — a stuck flag
    // would report an idle worker as permanently busy.
    laneJob[lane] = null
    heartbeat?.beat()
  }
}

/** The body of `processOne` for a job that was actually claimed. */
async function runClaimedJob(job: JobRow): Promise<boolean> {

  wlog.info(
    `running ${job.type} (id=${job.id} attempt=${job.attempts}/${job.max_attempts})`,
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
    wlog.error(`no handler for "${job.type}"`)
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
    // Best-effort progress heartbeat — never throws (swallows + logs), so a
    // failed status write can never fail the job it's reporting on. Fenced on
    // `job.attempts` (the value stamped by this claim) so a heartbeat from an
    // orphaned earlier attempt can't stamp progress / revive the lease on the
    // row after it was reclaimed and re-claimed as a newer attempt.
    reportProgress: createProgressReporter(job.id, job.attempts, (err) =>
      wlog.warn(
        `progress write failed for ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    ),
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
        wlog.warn(
          `late-arrived handler completion for ${job.id} ` +
            `(elapsed=${elapsed}ms, budget=${timeoutMs}ms) — result discarded`,
        )
      }
    },
    (err) => {
      const elapsed = Date.now() - handlerStart
      if (elapsed > timeoutMs) {
        const msg = err instanceof Error ? err.message : String(err)
        wlog.warn(
          `late-arrived handler rejection for ${job.id} ` +
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
    wlog.info(`succeeded ${job.id}`)
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
    // Quota/billing exhaustion (or an explicit NonRetryableJobError) is TERMINAL:
    // retrying can't help, so dead-letter on the first attempt with a clear
    // operator message — instead of spinning through 3 doomed retries (~8 min)
    // behind a progress bar while the user has no idea why. The quota message is
    // surfaced verbatim to the Studio error banner via error_message.
    const isQuota = isQuotaExceededError(err)
    const terminal = isQuota || err instanceof NonRetryableJobError
    const message = isQuota
      ? QUOTA_EXCEEDED_MESSAGE
      : err instanceof Error
        ? err.message
        : String(err)
    // Back off before the next attempt so transient failures don't exhaust
    // max_attempts instantly. failJob ignores run_after once the job is dead;
    // a terminal failure skips the backoff and dead-letters immediately.
    const outcome = await failJob(
      job.id,
      message,
      terminal ? undefined : computeRetryAfter(job.attempts),
      { terminal },
    )
    if (isTimeout) {
      wlog.error(
        `TIMEOUT ${job.id}: ${message} — flowing through failJob (attempts=${outcome.attempts}/${outcome.max_attempts})`,
      )
    } else if (terminal) {
      wlog.error(`failed ${job.id} (terminal — no retry): ${message}`)
    } else {
      wlog.error(`failed ${job.id}: ${message}`)
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

/**
 * One claim loop per lane. The ai-runs-sweeper re-schedule runs on the
 * interactive lane only. The stale-lease reaper is NOT here — it has its own
 * timer (startLeaseTimers), because a lane can be busy for 30 minutes and an
 * orphaned job must not wait behind it.
 */
async function loop(lane: WorkerLane): Promise<void> {
  const maintenance = lane === "interactive"
  let pollCount = 0
  while (!stopping) {
    try {
      // Phase 2.1 (P2.1.f) — every 100th poll (~3 min at default cadence),
      // re-check that an `ai-runs-sweeper` tick is queued for the future.
      // Keeps the schedule alive without requiring the handler to
      // self-re-enqueue. Idempotent: no-op when a tick is already pending.
      pollCount += 1
      if (maintenance && pollCount % 100 === 0) {
        ensureAiRunsSweeperSchedule()
          .then((r) => {
            if (r.status === "bootstrapped") {
              wlog.info(
                `ai-runs-sweeper re-scheduled` +
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
            wlog.error(
              `ai-runs-sweeper re-schedule failed:`,
              err,
            ),
          )
      }

      const didWork = await processOne(lane)
      if (!didWork) {
        await sleep(POLL_MS)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      wlog.error(`loop error (${lane} lane):`, msg)
      await sleep(POLL_MS)
    }
  }
}

function emitReclaimed(rows: ReclaimedJob[], leaseMs: number): void {
  for (const row of rows) {
    if (row.outcome === "dead") {
      void emitSystemEvent(
        buildJobsDeadEvent({
          job_id: row.id,
          job_type: row.type,
          error_message: "orphaned twice — automatic re-run spent",
          attempts: 0,
          actor: WORKER_ID,
        }),
      )
      continue
    }
    void emitSystemEvent(
      buildJobsReclaimedEvent({
        job_id: row.id,
        job_type: row.type,
        previous_locked_by: row.previous_locked_by,
        lease_ms: leaseMs,
        actor: WORKER_ID,
      }),
    )
  }
}

async function reapStale(label: string): Promise<void> {
  try {
    const reclaimed = await reclaimStaleJobs(LEASE_MS)
    if (reclaimed.length > 0) {
      wlog.info(`${label}: reclaimed ${reclaimed.length} stale job(s)`)
      emitReclaimed(reclaimed, LEASE_MS)
    }
  } catch (err) {
    wlog.error(`${label} failed:`, err instanceof Error ? err.message : String(err))
  }
}

let leaseTimers: Array<ReturnType<typeof setInterval>> = []

/**
 * (1) Renew the lease of every job this worker is running, every
 *     LEASE_RENEW_INTERVAL_MS — independent of the handler, so a quiet
 *     handler is never mistaken for an orphan.
 * (2) Reap jobs whose lease stopped being renewed, on its OWN timer.
 */
function startLeaseTimers(): void {
  const renew = setInterval(() => {
    for (const lane of WORKER_LANES) {
      const j = laneJob[lane]
      if (!j) continue
      renewJobLease(j.id, j.attempts, WORKER_ID).catch((err) =>
        wlog.warn(`lease renewal failed for ${j.id}: ${err instanceof Error ? err.message : String(err)}`),
      )
    }
  }, LEASE_RENEW_INTERVAL_MS)
  const reap = setInterval(() => void reapStale("reaper"), REAP_INTERVAL_MS)
  renew.unref?.()
  reap.unref?.()
  leaseTimers = [renew, reap]
}

/** True when `pid` names a live process on this host. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: it exists but belongs to someone else — alive.
    return (err as NodeJS.ErrnoException).code === "EPERM"
  }
}

/**
 * Boot-time reclaim, before the first claim:
 *   • the previous heartbeat was written on THIS host by a process that no
 *     longer exists (PM2 restart, kill -9, a crash) → that worker is proven
 *     dead; every job it holds goes back to the queue NOW;
 *   • anything else whose lease already aged out goes back too.
 * `previous` must be read BEFORE this worker writes its own first beat.
 */
async function bootReclaim(
  previous: Awaited<ReturnType<typeof readWorkerHeartbeat>>,
): Promise<void> {
  const prev = previous?.value
  if (
    prev?.worker_id &&
    prev.worker_id !== WORKER_ID &&
    prev.host === HOST &&
    typeof prev.pid === "number" &&
    prev.pid !== process.pid &&
    !isPidAlive(prev.pid)
  ) {
    try {
      const rows = await reclaimStaleJobs(0, { lockedBy: prev.worker_id })
      if (rows.length > 0) {
        wlog.info(
          `startup: previous worker ${prev.worker_id} (pid ${prev.pid}) is gone — reclaimed ${rows.length} job(s) it held`,
        )
        emitReclaimed(rows, 0)
      }
    } catch (err) {
      wlog.error(`startup dead-owner reclaim failed:`, err instanceof Error ? err.message : String(err))
    }
  }
  await reapStale("startup")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown(reason: string): void {
  if (stopping) return
  stopping = true
  wlog.info(`shutting down (${reason})`)
  // Stop claiming liveness the moment we decide to die. The last beat then
  // ages out and the ops page flips to "ما يرد" — the honest report for a
  // worker that was deliberately stopped.
  heartbeat?.stop()
  for (const t of leaseTimers) clearInterval(t)
  // Give the in-flight job a moment to wrap up; we don't force-kill.
  setTimeout(() => process.exit(0), 1500)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

wlog.info(
  `starting (poll=${POLL_MS}ms lease=${LEASE_MS}ms renew=${LEASE_RENEW_INTERVAL_MS}ms lanes=${WORKER_LANES.join("+")} ` +
    `db_pool_max=${process.env.DB_POOL_MAX ?? "default"})`,
)

// Fail hard on missing REQUIRED config (e.g. DATABASE_URL) — a worker without a
// database is useless, so crash loudly at boot rather than on the first claim.
validateEnv()

assertTimeoutKeysAreRegistered()

// Start beating BEFORE the migration guard and the claim loop, so a worker that
// is up but blocked (or one that has simply never been given work) still proves
// it is alive. On confirmed drift the guard calls process.exit(1) and the beat
// dies with it — correctly reported as "ما يرد", because that worker is not
// going to process anything.
//
// `heartbeat` is a mutable binding so `shutdown()` — hoisted above this line —
// can stop it. Assigned exactly once.
//
// Read the PREVIOUS worker's beat before overwriting it — bootReclaim uses it
// to prove a dead predecessor on this host. The beat starts right after (one
// query later), still before the migration guard and the claim loop.
const previousBeat = readWorkerHeartbeat().then((prev) => {
  heartbeat = startWorkerHeartbeat(
    () => ({
      worker_id: WORKER_ID,
      busy: laneJob.heavy !== null || laneJob.interactive !== null,
      // Kept for older readers (the ops page shows one type): the interactive
      // lane's job first — it is the one an operator is waiting on.
      job_type: laneJobType("interactive") ?? laneJobType("heavy"),
      booted_at: BOOTED_AT,
      lanes: { heavy: laneJobType("heavy"), interactive: laneJobType("interactive") },
      pid: process.pid,
      host: HOST,
    }),
    (err) =>
      wlog.warn(
        `heartbeat write failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
  )
  return prev
})

// Started HERE, before the scheduler bootstraps, so a drifted schema aborts the
// process as early as possible instead of after a round of failing enqueues.
// `loop()` at the bottom of this file is gated on it — the worker never claims a
// job until the schema question is settled.
const migrationGuard = assertNoMigrationDrift()

// Warm the OpenAI model catalog (fire-and-forget) so the first AI job
// doesn't pay the /v1/models fetch and availability fallback is armed.
void import("@/lib/ai-router/model-catalog").then((m) => m.warmModelCatalog())

// Auto-benchmark scan: when the catalog shows a GPT family newer than the
// registry defaults, benchmark each new model against its tier baseline
// (once per candidate+suite — dedupe lives in model_benchmarks). Boots
// 2min after start, then every 12h. Gated by thresholds.autoBenchmark.
const BENCHMARK_SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000
const runBenchmarkScan = () =>
  import("@/lib/ai-router/benchmark/scan")
    .then((m) => m.scanForModelBenchmarks())
    .then((r) => {
      if (r.enqueued.length > 0) {
        wlog.info(`model-benchmark scan: enqueued ${r.enqueued.length} run(s)`)
      }
    })
    .catch((err) => {
      wlog.warn(`model-benchmark scan failed: ${err instanceof Error ? err.message : err}`)
    })
setTimeout(runBenchmarkScan, 2 * 60_000).unref?.()
setInterval(runBenchmarkScan, BENCHMARK_SCAN_INTERVAL_MS).unref?.()

// Eager startup reclaim (see bootReclaim): a predecessor that died on this
// host gets its running jobs back in the queue before the first claim.
const bootReclaimDone = previousBeat.then((prev) => bootReclaim(prev))

// Bootstrap the market-intelligence scheduler so it ticks daily
// without any external cron. Idempotent — no-op if a tick already
// exists in the queue.
ensureMarketScheduler()
  .then((r) => {
    wlog.info(
      `market scheduler ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
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
    wlog.error(`market scheduler bootstrap failed:`, err),
  )

// Phase 2.1 (P2.1.f) — bootstrap the ai-runs-sweeper schedule so the
// stale-running reclaim runs every KHAT_AI_RUNS_SWEEP_INTERVAL_MS
// (default 30 min). Idempotent.
ensureAiRunsSweeperSchedule()
  .then((r) => {
    wlog.info(
      `ai-runs-sweeper schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
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
    wlog.error(
      `ai-runs-sweeper bootstrap failed:`,
      err,
    ),
  )

// Bootstrap the partnership task-reminder schedule so overdue/due-soon
// follow-ups get emailed daily. Handler self-re-enqueues; idempotent.
ensurePartnerTaskReminderSchedule()
  .then((r) => {
    wlog.info(
      `partner task-reminder schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
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
    wlog.error(`partner task-reminder bootstrap failed:`, err),
  )

// Bootstrap the market source-feedback sweep (performance → source trust).
// Handler self-re-enqueues daily; idempotent.
ensureSourceFeedbackSchedule()
  .then((r) => {
    wlog.info(
      `source-feedback schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
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
    wlog.error(`source-feedback bootstrap failed:`, err),
  )

// Bootstrap the weekly YouTube audience refresh (last 28 days). Handler
// self-re-enqueues weekly; idempotent; skips quietly when not connected.
ensureYoutubeAudienceSchedule()
  .then((r) => {
    wlog.info(
      `youtube-audience schedule ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
    )
    if (r.status === "bootstrapped") {
      void emitSystemEvent(
        buildScheduleCreatedEvent({
          schedule_type: "youtube.audience_refresh",
          cadence: "weekly",
          actor: WORKER_ID,
        }),
      )
    }
  })
  .catch((err) =>
    wlog.error(`youtube-audience bootstrap failed:`, err),
  )

// Bootstrap the Podcast Universe weekly incremental sync. Handler
// self-re-enqueues weekly; idempotent; a no-op for channels that have not had
// their initial crawl. KHAT_PODCAST_UNIVERSE_WEEKLY_SYNC=false disables it.
ensurePodcastWeeklySyncSchedule()
  .then((r) => {
    wlog.info(
      `podcast-universe weekly sync ${r.status}${r.jobId ? ` (job=${r.jobId.slice(0, 8)})` : ""}`,
    )
    if (r.status === "bootstrapped") {
      void emitSystemEvent(
        buildScheduleCreatedEvent({
          schedule_type: "podcast.weekly_sync",
          cadence: "weekly",
          actor: WORKER_ID,
        }),
      )
    }
  })
  .catch((err) =>
    wlog.error(`podcast-universe weekly sync bootstrap failed:`, err),
  )

// Gate the claim loop on the migration guard (see above). On confirmed drift the
// guard already exited; this only ever proceeds against a schema we trust.
Promise.all([migrationGuard, bootReclaimDone])
  .then(() => {
    startLeaseTimers()
    return Promise.all(WORKER_LANES.map((lane) => loop(lane)))
  })
  .catch((err) => {
    wlog.error(`fatal:`, err)
    process.exit(1)
  })
