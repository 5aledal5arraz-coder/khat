/**
 * Podcast Universe job handlers — B12 retry policy at the job boundary.
 *   quota stop   → job SUCCEEDS with status budget_stopped and a continuation
 *                  is scheduled for the quota reset (no attempt burnt);
 *   permanent    → NonRetryableJobError (dead-lettered at once), run failed;
 *   transient    → rethrown (worker backoff), run failed only on the last attempt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  runCrawl: vi.fn(),
  markCrawlFailed: vi.fn(async () => {}),
  verifyChannel: vi.fn(),
  startInitialCrawl: vi.fn(async () => ({ ok: true, jobId: "j2", alreadyRunning: false })),
  startIncrementalCrawl: vi.fn(async () => ({ ok: true, jobId: "j3", alreadyRunning: false })),
  enqueueChannelVerify: vi.fn(async () => ({ ok: true, jobId: "j4", alreadyRunning: false })),
  runExtractionBatch: vi.fn(),
  runUpdates: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/podcast-universe/crawl", () => ({
  runCrawl: h.runCrawl,
  markCrawlFailed: h.markCrawlFailed,
  verifyChannel: h.verifyChannel,
}))
vi.mock("@/lib/podcast-universe/jobs", () => ({
  startInitialCrawl: h.startInitialCrawl,
  startIncrementalCrawl: h.startIncrementalCrawl,
  enqueueChannelVerify: h.enqueueChannelVerify,
  weeklySyncChannelIds: vi.fn(async () => []),
}))
vi.mock("@/lib/jobs/queue", () => ({ enqueueRecurringTick: vi.fn(async () => null) }))
vi.mock("@/lib/podcast-universe/extraction/run", async (orig) => ({
  ...(await orig<typeof import("@/lib/podcast-universe/extraction/run")>()),
  runExtractionBatch: h.runExtractionBatch,
}))
// The handler's only direct DB write: run → partial after the last attempt.
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          h.runUpdates.push(patch)
        },
      }),
    }),
  },
}))

// The module is behind PODCAST_UNIVERSE_ENABLED; these tests exercise it ON.
process.env.PODCAST_UNIVERSE_ENABLED = "true"

import { getHandler } from "@/lib/jobs/registry"
import { NonRetryableJobError } from "@/lib/jobs/types"
import { PodcastQuotaExhaustedError } from "@/lib/podcast-universe/quota"
import { YoutubePermanentError, YoutubeTransientError } from "@/lib/podcast-universe/youtube"
import "@/lib/jobs/handlers/podcast-universe"
import { TransientExtractionError } from "@/lib/podcast-universe/extraction/run"

const ctx = (attempt: number) => ({
  jobId: "j1",
  jobType: "podcast.channel.initial_crawl",
  attempt,
  maxAttempts: 3,
  workerId: "w",
  reportProgress: async () => {},
})

describe("podcast crawl handler — retry policy (B12)", () => {
  beforeEach(() => vi.clearAllMocks())
  const handler = () => getHandler("podcast.channel.initial_crawl")!

  it("quota stop is a pause: no throw, continuation scheduled at the reset", async () => {
    const reset = new Date("2030-01-01T08:05:00Z")
    h.runCrawl.mockResolvedValueOnce({ status: "budget_stopped", resetAt: reset, pages: 4 })
    const out = await handler()({ runId: "r", channelId: "c" }, ctx(1))
    expect(out).toMatchObject({ status: "budget_stopped", pages: 4 })
    expect(h.startInitialCrawl).toHaveBeenCalledWith("c", { runAfter: reset, resume: true })
    expect(h.markCrawlFailed).not.toHaveBeenCalled()
  })

  it("a permanent YouTube error dead-letters at once", async () => {
    h.runCrawl.mockRejectedValueOnce(new YoutubePermanentError(404, "playlist gone"))
    await expect(handler()({ runId: "r", channelId: "c" }, ctx(1))).rejects.toBeInstanceOf(NonRetryableJobError)
    expect(h.markCrawlFailed).toHaveBeenCalledWith("r", "playlist gone")
  })

  it("a transient error is rethrown for the worker's backoff; the run fails only on the last attempt", async () => {
    h.runCrawl.mockRejectedValueOnce(new YoutubeTransientError("429"))
    await expect(handler()({ runId: "r", channelId: "c" }, ctx(1))).rejects.toBeInstanceOf(YoutubeTransientError)
    expect(h.markCrawlFailed).not.toHaveBeenCalled()
    h.runCrawl.mockRejectedValueOnce(new YoutubeTransientError("429"))
    await expect(handler()({ runId: "r", channelId: "c" }, ctx(3))).rejects.toBeInstanceOf(YoutubeTransientError)
    expect(h.markCrawlFailed).toHaveBeenCalledTimes(1)
  })

  it("verify: a quota stop reschedules, an unresolvable channel is non-retryable", async () => {
    const v = getHandler("podcast.channel.verify")!
    h.verifyChannel.mockRejectedValueOnce(new PodcastQuotaExhaustedError("read", new Date("2030-01-01T08:05:00Z")))
    await expect(v({ channelId: "c" }, ctx(1))).resolves.toMatchObject({ status: "budget_stopped" })
    expect(h.enqueueChannelVerify).toHaveBeenCalledTimes(1)
    h.verifyChannel.mockResolvedValueOnce({ status: "not_found", youtube_channel_id: null, uploads_playlist_id: null })
    await expect(v({ channelId: "c" }, ctx(1))).rejects.toBeInstanceOf(NonRetryableJobError)
  })

  it("registers all six job types", () => {
    for (const t of [
      "podcast.channel.verify",
      "podcast.channel.initial_crawl",
      "podcast.channel.incremental_crawl",
      "podcast.episode.guest_extract",
      "podcast.person.resolve",
      "podcast.weekly_sync",
    ]) {
      expect(getHandler(t)).toBeTypeOf("function")
    }
  })

  it("guest_extract: a transient failure on the LAST attempt marks the run partial (resumable), earlier attempts do not", async () => {
    const x = getHandler("podcast.episode.guest_extract")!
    h.runUpdates.length = 0
    h.runExtractionBatch.mockRejectedValueOnce(new TransientExtractionError("rate_limited"))
    await expect(x({ runId: "r", batchNo: 4 }, { ...ctx(1), maxAttempts: 2 })).rejects.toBeInstanceOf(TransientExtractionError)
    expect(h.runUpdates).toHaveLength(0)
    h.runExtractionBatch.mockRejectedValueOnce(new TransientExtractionError("rate_limited"))
    await expect(x({ runId: "r", batchNo: 4 }, { ...ctx(2), maxAttempts: 2 })).rejects.toBeInstanceOf(TransientExtractionError)
    expect(h.runUpdates).toHaveLength(1)
    expect(h.runUpdates[0]).toMatchObject({ status: "partial" })
    expect(String(h.runUpdates[0].error_summary)).toContain("batch 4 failed after 2 attempts")
  })
})
