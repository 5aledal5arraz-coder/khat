/**
 * Podcast Universe job handlers (docs/podcast-universe-plan-v1.md §B11, B12).
 *
 *   podcast.channel.verify             handle/UC id → channels.list
 *   podcast.channel.initial_crawl      whole uploads playlist, checkpointed per page
 *   podcast.channel.incremental_crawl  newest pages until the B5 overlap rule stops it
 *   podcast.episode.guest_extract      one Luna batch under the run's hard budget
 *   podcast.person.resolve             deterministic B10 evidence pass
 *   podcast.weekly_sync                weekly tick; ONLY enqueues incremental crawls
 *
 * Retry policy (B12):
 *   • network / 429 / 5xx / transient AI → throw; the worker retries with
 *     exponential backoff up to the job's attempts;
 *   • quota exhausted (app cap or Google) → NOT a failure: the run is
 *     `budget_stopped` and a continuation job is scheduled for the next quota
 *     day, without burning an attempt;
 *   • 403 permission / invalid channel / invariant violation →
 *     NonRetryableJobError (dead-lettered at once with the reason).
 */
import { registerHandler as registerRaw } from "../registry"
import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import type { JobHandler } from "../types"
import { enqueueRecurringTick } from "../queue"
import { NonRetryableJobError, type JobContext } from "../types"
import {
  PU_JOB_CHANNEL_VERIFY,
  PU_JOB_GUEST_EXTRACT,
  PU_JOB_INCREMENTAL_CRAWL,
  PU_JOB_INITIAL_CRAWL,
  PU_JOB_PERSON_RESOLVE,
  PU_JOB_WEEKLY_SYNC,
} from "@/lib/podcast-universe/constants"
import { markCrawlFailed, runCrawl, verifyChannel } from "@/lib/podcast-universe/crawl"
import { PodcastQuotaExhaustedError } from "@/lib/podcast-universe/quota"
import { YoutubePermanentError } from "@/lib/podcast-universe/youtube"
import { runExtractionBatch, TransientExtractionError } from "@/lib/podcast-universe/extraction/run"
import { resolvePeople } from "@/lib/podcast-universe/people"
import {
  enqueueChannelVerify,
  startIncrementalCrawl,
  startInitialCrawl,
  weeklySyncChannelIds,
} from "@/lib/podcast-universe/jobs"
import { db } from "@/lib/db"
import { eq } from "drizzle-orm"
import { podcastCrawlRuns } from "@/lib/db/schema/podcast-universe"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Every podcast.* handler is gated on PODCAST_UNIVERSE_ENABLED. Off → the job
 * COMPLETES as a logged no-op (status "disabled"): a queued job must not be
 * dead-lettered or retried just because the module is switched off, and the
 * weekly tick does not re-enqueue itself (the chain simply ends).
 */
function registerHandler<P extends Record<string, unknown>>(type: string, fn: JobHandler<P, Record<string, unknown>>) {
  registerRaw<P, Record<string, unknown>>(type, async (payload, ctx) => {
    if (!isPodcastUniverseEnabled()) {
      console.info(`[podcast-universe] ${type} job ${ctx.jobId} skipped — PODCAST_UNIVERSE_ENABLED is not "true"`)
      return { status: "disabled", reason: "PODCAST_UNIVERSE_ENABLED is not \"true\"" }
    }
    return fn(payload, ctx)
  })
}

export function podcastWeeklySyncIntervalMs(): number {
  const v = Number(process.env.KHAT_PODCAST_UNIVERSE_SYNC_INTERVAL_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : WEEK_MS
}

/** Feature flag (D12 rollback): set KHAT_PODCAST_UNIVERSE_WEEKLY_SYNC=false to stop the weekly tick. */
export function isPodcastWeeklySyncEnabled(): boolean {
  return process.env.KHAT_PODCAST_UNIVERSE_WEEKLY_SYNC !== "false"
}

function str(v: unknown): string {
  if (typeof v !== "string" || !v) throw new NonRetryableJobError("missing required payload field")
  return v
}

// ─── verify ──────────────────────────────────────────────────────────────

registerHandler<{ channelId: string; allowSearchFallback?: boolean }>(PU_JOB_CHANNEL_VERIFY, async (payload) => {
  const channelId = str(payload.channelId)
  try {
    const r = await verifyChannel(channelId, { allowSearchFallback: payload.allowSearchFallback === true })
    if (r.status === "not_found") {
      throw new NonRetryableJobError(`channel could not be resolved on YouTube — check the handle/id`)
    }
    return { ...r }
  } catch (err) {
    if (err instanceof PodcastQuotaExhaustedError) {
      await enqueueChannelVerify(channelId, { runAfter: err.resetAt, resume: true })
      return { status: "budget_stopped", resumeAt: err.resetAt.toISOString() }
    }
    if (err instanceof YoutubePermanentError) throw new NonRetryableJobError(err.message)
    throw err
  }
})

// ─── crawls ──────────────────────────────────────────────────────────────

async function crawlHandler(payload: { runId?: string; channelId?: string }, ctx: JobContext, kind: "initial" | "incremental") {
  const runId = str(payload.runId)
  const channelId = str(payload.channelId)
  try {
    const out = await runCrawl(runId)
    if (out.status === "busy") {
      // Never two crawls of one channel at once. An initial crawl waits its
      // turn (15 min); an incremental one is skipped — the next tick covers it.
      if (kind === "initial") await startInitialCrawl(channelId, { runAfter: new Date(Date.now() + 15 * 60_000), resume: true })
      return { status: "busy", runningRunId: out.runningRunId, action: kind === "initial" ? "rescheduled" : "skipped" }
    }
    if (out.status === "budget_stopped") {
      // Quota is a pause, not a failure: resume at the next quota day.
      if (kind === "initial") await startInitialCrawl(channelId, { runAfter: out.resetAt, resume: true })
      else await startIncrementalCrawl(channelId, { runAfter: out.resetAt, resumeRunId: runId })
      return { status: "budget_stopped", pages: out.pages, resumeAt: out.resetAt.toISOString() }
    }
    return { ...out }
  } catch (err) {
    if (err instanceof YoutubePermanentError) {
      await markCrawlFailed(runId, err.message)
      throw new NonRetryableJobError(err.message)
    }
    if (ctx.attempt >= ctx.maxAttempts) {
      await markCrawlFailed(runId, `gave up after ${ctx.attempt} attempts: ${err instanceof Error ? err.message : String(err)}`)
    }
    throw err
  }
}

registerHandler<{ runId?: string; channelId?: string }>(PU_JOB_INITIAL_CRAWL, (p, ctx) => crawlHandler(p, ctx, "initial"))
registerHandler<{ runId?: string; channelId?: string }>(PU_JOB_INCREMENTAL_CRAWL, (p, ctx) => crawlHandler(p, ctx, "incremental"))

// ─── guest extraction ────────────────────────────────────────────────────

registerHandler<{ runId?: string; batchNo?: number }>(PU_JOB_GUEST_EXTRACT, async (payload, ctx) => {
  const runId = str(payload.runId)
  const batchNo = Number(payload.batchNo ?? 1)
  try {
    const out = await runExtractionBatch(runId, batchNo, { attempt: ctx.attempt, maxAttempts: ctx.maxAttempts })
    return { ...out }
  } catch (err) {
    if (err instanceof TransientExtractionError && ctx.attempt >= ctx.maxAttempts && db) {
      // The chain stops here; the run is resumable (startGuestExtraction
      // continues a `partial` run with its spend so far — never a fresh budget).
      await db
        .update(podcastCrawlRuns)
        .set({ status: "partial", error_summary: `batch ${batchNo} failed after ${ctx.attempt} attempts: ${err.message}`.slice(0, 1000) })
        .where(eq(podcastCrawlRuns.id, runId))
    }
    throw err
  }
})

// ─── person resolve ──────────────────────────────────────────────────────

registerHandler<{ personIds?: string[] }>(PU_JOB_PERSON_RESOLVE, async (payload) => {
  const ids = Array.isArray(payload.personIds) ? payload.personIds.filter((x): x is string => typeof x === "string") : []
  const changed = await resolvePeople(ids)
  return { people: ids.length, changed }
})

// ─── weekly sync ─────────────────────────────────────────────────────────

export async function runPodcastWeeklySync(now: Date = new Date()) {
  // Next tick first, so a failing run can't end the schedule.
  await enqueueRecurringTick(PU_JOB_WEEKLY_SYNC, {}, { priority: 1, maxAttempts: 1, runAfter: new Date(now.getTime() + podcastWeeklySyncIntervalMs()) })
  if (!isPodcastWeeklySyncEnabled()) return { status: "disabled", enqueued: 0 }
  const ids = await weeklySyncChannelIds()
  let enqueued = 0
  for (const id of ids) {
    const r = await startIncrementalCrawl(id)
    if (r.ok && !r.alreadyRunning) enqueued++
  }
  return { status: "ok", channels: ids.length, enqueued }
}

registerHandler(PU_JOB_WEEKLY_SYNC, async () => runPodcastWeeklySync() as Promise<Record<string, unknown>>)
