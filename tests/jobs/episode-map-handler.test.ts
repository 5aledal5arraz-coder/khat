/**
 * Studio 3-phase journey (Phase 1) — episode-map JOB handler, focused on the
 * progress heartbeat wiring (Step 5). whisper, the AI map generator, the DB
 * repositories and fs are all mocked — NO paid AI, NO real DB, NO disk. Proves
 * the handler emits the full stage arc: transcribing → per-chunk → detecting_breaks
 * → analyzing → done, and forwards whisper's per-chunk ticks + the map generator's
 * onStage transitions into ctx.reportProgress.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TimedSegment } from "@/lib/studio/segments"

vi.mock("@/lib/studio", () => ({ getStudioSession: vi.fn() }))
vi.mock("@/lib/studio/projects", () => ({
  getProjectByRawSession: vi.fn(),
  transitionState: vi.fn(),
}))
vi.mock("@/lib/studio/analysis-records", () => ({ resolveEirIdForSession: vi.fn() }))
vi.mock("@/lib/studio/transcripts", () => ({
  saveTimedSegments: vi.fn(),
  saveEpisodeMap: vi.fn(),
}))
vi.mock("@/lib/whisper", () => ({ transcribeWithTimestamps: vi.fn() }))
vi.mock("@/lib/ai/episode-map", () => ({ generateEpisodeMap: vi.fn() }))
vi.mock("fs/promises", () => ({ default: { access: vi.fn(async () => undefined) } }))

import { getStudioSession } from "@/lib/studio"
import { getProjectByRawSession, transitionState } from "@/lib/studio/projects"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import { saveTimedSegments, saveEpisodeMap } from "@/lib/studio/transcripts"
import { transcribeWithTimestamps } from "@/lib/whisper"
import { generateEpisodeMap } from "@/lib/ai/episode-map"
import { getHandler, type JobContext } from "@/lib/jobs"
// Side-effect: registers "studio.episode_map".
import "@/lib/jobs/handlers/episode-map"

const SESSION = "33333333-3333-3333-3333-333333333333"

const SEGMENTS: TimedSegment[] = [
  { start: 0, end: 10, text: "مقطع أول", chunk: 0 },
  { start: 10, end: 20, text: "مقطع ثانٍ", chunk: 1 },
]

const FAKE_MAP = {
  episode_true_start: 12,
  first_real_sentence: "تبدأ الحلقة",
  pre_roll_summary: "",
  breaks: [{ gap_id: "GAP_1" }],
  hook_candidates: [{ rank: 1 }, { rank: 2 }],
  prompt_version: "v1",
  ai_run_id: "run-1",
  model_name: "gpt-test",
  generated_at: "2026-07-22T00:00:00.000Z",
}

const CTX: JobContext = {
  jobId: "job-map-1",
  jobType: "studio.episode_map",
  attempt: 0,
  maxAttempts: 3,
  workerId: "test-worker",
  reportProgress: vi.fn(async () => undefined),
}

function handler() {
  const h = getHandler("studio.episode_map")
  if (!h) throw new Error("handler not registered")
  return h
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStudioSession).mockResolvedValue({
    id: SESSION,
    audio_filename: "raw.mp3",
    duration_seconds: 1800, // 30 min → 3 estimated chunks
  } as never)
  vi.mocked(resolveEirIdForSession).mockResolvedValue(null)
  vi.mocked(saveTimedSegments).mockResolvedValue(undefined as never)
  vi.mocked(saveEpisodeMap).mockResolvedValue(undefined as never)
  vi.mocked(getProjectByRawSession).mockResolvedValue(null as never)
  vi.mocked(transitionState).mockResolvedValue(undefined as never)
  // whisper drives its per-chunk callback; the generator drives its onStage.
  vi.mocked(transcribeWithTimestamps).mockImplementation(
    async (_path, _lang, _ctx, _phase, onProgress) => {
      onProgress?.({ currentChunk: 1, totalChunks: 3 })
      onProgress?.({ currentChunk: 2, totalChunks: 3 })
      onProgress?.({ currentChunk: 3, totalChunks: 3 })
      return { success: true, segments: SEGMENTS, durationSeconds: 20 }
    },
  )
  vi.mocked(generateEpisodeMap).mockImplementation(async (input) => {
    input.onStage?.("detecting_breaks")
    input.onStage?.("analyzing")
    return FAKE_MAP as never
  })
})

describe("studio.episode_map handler — progress heartbeat", () => {
  it("emits transcribing → per-chunk → detecting_breaks → analyzing → done in order", async () => {
    const reportProgress = vi.fn<(p: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    )
    const result = (await handler()(
      { sessionId: SESSION },
      { ...CTX, reportProgress },
    )) as Record<string, unknown>

    const stages = reportProgress.mock.calls.map(
      (c) => (c[0] as { stage: string }).stage,
    )
    // First tick is the immediate determinate scale (chunk 0 of ~3).
    expect(stages[0]).toBe("transcribing")
    expect((reportProgress.mock.calls[0][0] as { totalChunks: number }).totalChunks).toBe(3)
    // The tail stages appear in order and last is done.
    expect(stages).toEqual(
      expect.arrayContaining(["transcribing", "detecting_breaks", "analyzing", "done"]),
    )
    expect(stages.indexOf("detecting_breaks")).toBeLessThan(stages.indexOf("analyzing"))
    expect(stages.indexOf("analyzing")).toBeLessThan(stages.indexOf("done"))
    expect(stages.lastIndexOf("transcribing")).toBeLessThan(stages.indexOf("detecting_breaks"))
    expect(stages[stages.length - 1]).toBe("done")

    // The result still mirrors the map (progress wiring didn't disturb it).
    expect(result.session_id).toBe(SESSION)
    expect(result.break_count).toBe(1)
    expect(result.hook_count).toBe(2)
    expect(result.segment_count).toBe(2)
    expect(saveEpisodeMap).toHaveBeenCalledTimes(1)
  })

  it("still produces the map when whisper never reports progress (additive default)", async () => {
    vi.mocked(transcribeWithTimestamps).mockResolvedValue({
      success: true,
      segments: SEGMENTS,
      durationSeconds: 20,
    })
    const result = (await handler()({ sessionId: SESSION }, CTX)) as Record<string, unknown>
    expect(result.session_id).toBe(SESSION)
    expect(saveEpisodeMap).toHaveBeenCalledTimes(1)
  })
})
