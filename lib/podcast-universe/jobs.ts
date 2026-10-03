/**
 * Enqueue side of the Podcast Universe jobs (B11). The handlers live in
 * lib/jobs/handlers/podcast-universe.ts; both share the job-type constants.
 *
 * Dedupe keys (B11):
 *   podcast-channel-verify:<channel-key>
 *   podcast-initial:<channel-id>:v1            (+ `:resume` for a quota continuation)
 *   podcast-incremental:<channel-id>
 *   podcast-extract:<prompt-version>:<run-id>:<batch-no>
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { podcastChannels, podcastCrawlRuns } from "@/lib/db/schema/podcast-universe"
import { enqueueJob, enqueueJobOnce } from "@/lib/jobs/queue"
import {
  GUEST_EXTRACT_PROMPT_VERSION,
  M1_EXTRACT_BUDGET_USD,
  PU_ATTEMPTS,
  PU_JOB_CHANNEL_VERIFY,
  PU_JOB_GUEST_EXTRACT,
  PU_JOB_INCREMENTAL_CRAWL,
  PU_JOB_INITIAL_CRAWL,
  PU_JOB_PERSON_RESOLVE,
} from "./constants"
import { channelCrawlRunning, createRun, loadChannel, pgCode, resumableInitialRun } from "./crawl"
import { committedExtractionUsd, createExtractionRun, type ExtractCursor } from "./extraction/run"

export type StartResult = { ok: true; jobId: string; runId?: string; alreadyRunning: boolean } | { ok: false; error: string }

export function verifyDedupeKey(channel: { id: string; youtube_channel_id: string | null; handle: string | null }): string {
  return `podcast-channel-verify:${channel.youtube_channel_id ?? channel.handle ?? channel.id}`
}
export const initialDedupeKey = (channelId: string) => `podcast-initial:${channelId}:v1`
/**
 * A quota continuation carries the day it resumes on, so the job that schedules
 * it (still `running` under its own key) never attaches to itself.
 */
const resumeSuffix = (runAfter: Date | undefined) => `:resume:${(runAfter ?? new Date()).toISOString().slice(0, 13)}`

/** Any pending/running job whose dedupe key starts with `prefix`. */
async function inflightByPrefix(prefix: string): Promise<{ id: string; payload: Record<string, unknown> } | null> {
  const res = await db!.execute(sql`
    SELECT id, payload FROM jobs
    WHERE status IN ('pending', 'running') AND dedupe_key LIKE ${prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%"}
    ORDER BY created_at DESC LIMIT 1
  `)
  const row = res.rows[0] as { id: string; payload: Record<string, unknown> } | undefined
  return row ?? null
}
export const incrementalDedupeKey = (channelId: string) => `podcast-incremental:${channelId}`
export const extractDedupeKey = (runId: string, batchNo: number) =>
  `podcast-extract:${GUEST_EXTRACT_PROMPT_VERSION}:${runId}:${batchNo}`

export async function enqueueChannelVerify(channelId: string, opts: { allowSearchFallback?: boolean; runAfter?: Date; resume?: boolean } = {}): Promise<StartResult> {
  const channel = await loadChannel(channelId)
  if (!channel) return { ok: false, error: "القناة غير موجودة" }
  const base = verifyDedupeKey(channel)
  if (!opts.resume) {
    const inflight = await inflightByPrefix(base)
    if (inflight) return { ok: true, jobId: inflight.id, alreadyRunning: true }
  }
  const key = base + (opts.resume ? resumeSuffix(opts.runAfter) : "")
  const r = await enqueueJobOnce(
    PU_JOB_CHANNEL_VERIFY,
    { channelId, allowSearchFallback: opts.allowSearchFallback === true },
    { dedupeKey: key, maxAttempts: PU_ATTEMPTS[PU_JOB_CHANNEL_VERIFY], runAfter: opts.runAfter, priority: 1 },
  )
  return { ok: true, jobId: r.job.id, alreadyRunning: r.alreadyRunning }
}

export async function startInitialCrawl(channelId: string, opts: { runAfter?: Date; resume?: boolean } = {}): Promise<StartResult> {
  const channel = await loadChannel(channelId)
  if (!channel) return { ok: false, error: "القناة غير موجودة" }
  if (channel.verification_status !== "verified") return { ok: false, error: "تحقّق من القناة أولاً" }
  if (channel.paused && !opts.resume) return { ok: false, error: "القناة موقوفة — ألغِ الإيقاف أولاً" }
  if (!opts.resume) {
    const inflight = await inflightByPrefix(initialDedupeKey(channelId))
    if (inflight) return { ok: true, jobId: inflight.id, runId: String(inflight.payload.runId ?? ""), alreadyRunning: true }
  }
  const run = (await resumableInitialRun(channelId)) ?? (await createRun(channelId, "initial"))
  const r = await enqueueJobOnce(
    PU_JOB_INITIAL_CRAWL,
    { runId: run.id, channelId },
    {
      dedupeKey: initialDedupeKey(channelId) + (opts.resume ? resumeSuffix(opts.runAfter) : ""),
      maxAttempts: PU_ATTEMPTS[PU_JOB_INITIAL_CRAWL],
      runAfter: opts.runAfter,
    },
  )
  return { ok: true, jobId: r.job.id, runId: run.id, alreadyRunning: r.alreadyRunning }
}

export async function startIncrementalCrawl(channelId: string, opts: { runAfter?: Date; resumeRunId?: string } = {}): Promise<StartResult> {
  const channel = await loadChannel(channelId)
  if (!channel) return { ok: false, error: "القناة غير موجودة" }
  if (channel.verification_status !== "verified") return { ok: false, error: "تحقّق من القناة أولاً" }
  if (!channel.last_successful_crawl_at) return { ok: false, error: "شغّل الزحف الأولي أولاً" }
  if (channel.paused) return { ok: false, error: "القناة موقوفة" }
  // One active crawl per channel: the weekly sync SKIPS a channel being crawled.
  if (!opts.resumeRunId) {
    const running = await channelCrawlRunning(channelId)
    if (running) return { ok: false, error: "يوجد زحف قيد التشغيل لهذه القناة — تم التخطي" }
  }
  if (!opts.resumeRunId) {
    const inflight = await inflightByPrefix(incrementalDedupeKey(channelId))
    if (inflight) return { ok: true, jobId: inflight.id, runId: String(inflight.payload.runId ?? ""), alreadyRunning: true }
  }
  const key = incrementalDedupeKey(channelId) + (opts.resumeRunId ? resumeSuffix(opts.runAfter) : "")
  const runId = opts.resumeRunId ?? (await createRun(channelId, "incremental")).id
  const r = await enqueueJobOnce(
    PU_JOB_INCREMENTAL_CRAWL,
    { runId, channelId },
    { dedupeKey: key, maxAttempts: PU_ATTEMPTS[PU_JOB_INCREMENTAL_CRAWL], runAfter: opts.runAfter },
  )
  return { ok: true, jobId: r.job.id, runId, alreadyRunning: r.alreadyRunning }
}

export async function enqueueGuestExtractBatch(runId: string, batchNo: number): Promise<void> {
  await enqueueJobOnce(
    PU_JOB_GUEST_EXTRACT,
    { runId, batchNo },
    { dedupeKey: extractDedupeKey(runId, batchNo), maxAttempts: PU_ATTEMPTS[PU_JOB_GUEST_EXTRACT] },
  )
}

/**
 * Start (or continue) guest extraction under the TOTAL M1 cap (B13). The cap
 * counts every guest_extract run ever: once the cumulative spend reaches it,
 * nothing new starts — a new run never brings a fresh $3. A queued / running /
 * partial run is CONTINUED.
 */
export async function startGuestExtraction(budgetUsd = M1_EXTRACT_BUDGET_USD): Promise<StartResult> {
  if (!(budgetUsd > 0) || budgetUsd > M1_EXTRACT_BUDGET_USD) {
    return { ok: false, error: `السقف الكلي يجب أن يكون بين 0 و ${M1_EXTRACT_BUDGET_USD} دولار` }
  }
  // Recorded cost + any open reservation (a call in flight) count toward the cap.
  const { spent: booked, reserved } = await committedExtractionUsd()
  const spent = booked + reserved
  if (spent >= budgetUsd) {
    return {
      ok: false,
      error: `المصروف الكلي على الاستخراج $${spent.toFixed(4)} بلغ السقف الكلي $${budgetUsd.toFixed(2)} — لا تشغيل جديد`,
    }
  }
  const partial = await db!
    .select({ id: podcastCrawlRuns.id, cursor: podcastCrawlRuns.cursor_state })
    .from(podcastCrawlRuns)
    .where(and(eq(podcastCrawlRuns.run_type, "guest_extract"), eq(podcastCrawlRuns.status, "partial")))
    .orderBy(desc(podcastCrawlRuns.created_at))
    .limit(1)
  let runId: string
  let batchNo = 1
  if (partial[0]) {
    runId = partial[0].id
    batchNo = ((partial[0].cursor as ExtractCursor | null)?.batches_done ?? 0) + 1
    try {
      await db!.update(podcastCrawlRuns).set({ status: "queued", error_summary: null }).where(eq(podcastCrawlRuns.id, runId))
    } catch (err) {
      // Another run became active meanwhile (uq_podcast_crawl_runs_active_extract).
      if (pgCode(err) !== "23505") throw err
      return { ok: false, error: "يوجد تشغيل استخراج نشط بالفعل" }
    }
  } else {
    const created = await createExtractionRun(budgetUsd)
    runId = created.runId
    if (created.reused) {
      const inflight = await db!.execute(sql`
        SELECT id FROM jobs WHERE type = ${PU_JOB_GUEST_EXTRACT}
          AND status IN ('pending','running') AND payload->>'runId' = ${runId} LIMIT 1
      `)
      const row = inflight.rows[0] as { id: string } | undefined
      if (row) return { ok: true, jobId: row.id, runId, alreadyRunning: true }
      const [r] = await db!.select({ cursor: podcastCrawlRuns.cursor_state }).from(podcastCrawlRuns).where(eq(podcastCrawlRuns.id, runId))
      batchNo = ((r?.cursor as ExtractCursor | null)?.batches_done ?? 0) + 1
    }
  }
  await enqueueGuestExtractBatch(runId, batchNo)
  return { ok: true, jobId: "", runId, alreadyRunning: false }
}

export async function enqueuePersonResolve(personIds: string[]): Promise<void> {
  const ids = [...new Set(personIds)]
  for (let i = 0; i < ids.length; i += 200) {
    await enqueueJob(PU_JOB_PERSON_RESOLVE, { personIds: ids.slice(i, i + 200) }, { maxAttempts: PU_ATTEMPTS[PU_JOB_PERSON_RESOLVE] })
  }
}

/** Channels the weekly sync refreshes: verified, crawled once, not paused, not rejected/dormant. */
export async function weeklySyncChannelIds(): Promise<string[]> {
  const rows = await db!
    .select({ id: podcastChannels.id })
    .from(podcastChannels)
    .where(
      and(
        eq(podcastChannels.verification_status, "verified"),
        eq(podcastChannels.paused, false),
        isNotNull(podcastChannels.last_successful_crawl_at),
        inArray(podcastChannels.registry_type, ["core_interview", "context_coverage"]),
      ),
    )
  return rows.map((r) => r.id)
}
