/**
 * The handlers that took slow AI off the request path — their outcome rules.
 *
 *   • prep.generate_v2: a pipeline that RAN but refused/failed completes with
 *     `{ ok:false, messageAr }` (shown, never retried) — including the
 *     recording live-guard (`room_live`, commit 6b8dc71). A pass that died of
 *     "no credits" is re-thrown so the worker dead-letters it with the billing
 *     message. A missing prep is NonRetryable. Progress reaches ctx.
 *   • studio.transcribe: `transcribeAudioFile` returns `{success:false}`
 *     instead of throwing — the handler must THROW it, or quota detection
 *     never sees it and the job "succeeds" with no transcript.
 *   • lanes + the status card's wording, which every job surface shares.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, resetMock } from "../db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/preparation/v2/pipeline", () => ({ runPrepV2Pipeline: vi.fn() }))
vi.mock("@/lib/whisper", () => ({ transcribeAudioFile: vi.fn() }))
vi.mock("@/lib/youtube/download", () => ({ downloadYouTubeAudio: vi.fn() }))
vi.mock("@/lib/studio", () => ({
  getStudioSession: vi.fn(),
  getTranscriptForSession: vi.fn(async () => null),
  createTranscript: vi.fn(async () => ({ success: true })),
  createTranscriptError: vi.fn(async () => {}),
}))
vi.mock("@/lib/studio/audio-path", () => ({
  resolveSessionAudioPath: vi.fn(async () => "/tmp/khat-test/a.m4a"),
}))

import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"
import { transcribeAudioFile } from "@/lib/whisper"
import { getStudioSession, createTranscript, createTranscriptError } from "@/lib/studio"
import { runPrepGenerateV2 } from "@/lib/jobs/handlers/prep-generate-v2"
import { runStudioTranscribe } from "@/lib/jobs/handlers/studio-transcribe"
import { NonRetryableJobError } from "@/lib/jobs/types"
import { ROOM_LIVE_REGENERATION_MESSAGE } from "@/lib/recording-v2/live-guard"
import { isQuotaExceededError } from "@/lib/ai-router/errors"
import { laneForJobType } from "@/lib/jobs/lanes"
import {
  describeJob,
  WORKER_DOWN_TITLE,
  WORKER_DEV_HINT,
  WORKER_RESTARTED_TITLE,
  type JobSnapshot,
  type WorkerSnapshot,
} from "@/lib/jobs/status-view"

const RUN_IDS = {
  pass1_research: null,
  pass2_structure: null,
  pass3_questions: null,
  pass4_critique: null,
  pass5_insights: null,
}
const PAYLOAD = {
  preparationId: "prep-1",
  eirId: "eir-1",
  language: "ar" as const,
  force: true,
  trigger: "regenerate" as const,
  requestedBy: "admin-1",
}
const notOk = (reason: string, error?: string) => ({
  ok: false,
  preparation_id: "prep-1",
  payload: null,
  validation: { ok: false, failures: [] },
  ai_run_ids: RUN_IDS,
  reason,
  ...(error ? { error } : {}),
})

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
})

describe("prep.generate_v2 handler", () => {
  it("room_live → a clear Arabic result, not a throw (so never a retry)", async () => {
    vi.mocked(runPrepV2Pipeline).mockResolvedValue(notOk("room_live") as never)
    const r = await runPrepGenerateV2(PAYLOAD, async () => {})
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("room_live")
    expect(r.messageAr).toBe(ROOM_LIVE_REGENERATION_MESSAGE)
  })

  it("a pass that died of «no credits» is rethrown for the worker's quota dead-letter", async () => {
    vi.mocked(runPrepV2Pipeline).mockResolvedValue(
      notOk("pass1_failed", "429 You have no credits remaining. Add credits to continue.") as never,
    )
    const err = await runPrepGenerateV2(PAYLOAD, async () => {}).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(isQuotaExceededError(err)).toBe(true)
  })

  it("a missing preparation is NonRetryable", async () => {
    vi.mocked(runPrepV2Pipeline).mockResolvedValue(notOk("preparation_not_found") as never)
    await expect(runPrepGenerateV2(PAYLOAD, async () => {})).rejects.toBeInstanceOf(
      NonRetryableJobError,
    )
  })

  it("a conversion's failed generation says the record exists (prepV2WarningAr)", async () => {
    vi.mocked(runPrepV2Pipeline).mockResolvedValue(notOk("pass3_failed") as never)
    const r = await runPrepGenerateV2({ ...PAYLOAD, trigger: "convert", force: false }, async () => {})
    expect(r.messageAr?.startsWith("أُنشئ سجلّ الإعداد")).toBe(true)
  })

  it("passes format + targetMinutes through and forwards pass progress to the job", async () => {
    vi.mocked(runPrepV2Pipeline).mockImplementation(async (input) => {
      await input.onProgress?.({ pass: 3, of: 5, label: "بنك الأسئلة" })
      return {
        ok: true,
        preparation_id: "prep-1",
        payload: { episode_sections: [{}, {}], question_bank: [{}, {}, {}] },
        validation: { ok: true, failures: [] },
        ai_run_ids: RUN_IDS,
      } as never
    })
    const progress = vi.fn(async () => {})
    const r = await runPrepGenerateV2({ ...PAYLOAD, format: "course", targetMinutes: 90 }, progress)
    expect(vi.mocked(runPrepV2Pipeline).mock.calls[0][0]).toMatchObject({
      preparationId: "prep-1",
      format: "course",
      targetMinutes: 90,
      force: true,
    })
    expect(progress).toHaveBeenCalledWith({ pass: 3, of: 5, label: "بنك الأسئلة" })
    expect(r).toMatchObject({ ok: true, sections: 2, questions: 3 })
  })
})

describe("studio.transcribe handler", () => {
  beforeEach(() => {
    vi.mocked(getStudioSession).mockResolvedValue({
      id: "s-1",
      source: "audio",
      audio_filename: "a.m4a",
      video_id: null,
    } as never)
  })

  it("throws Whisper's {success:false} so the worker can classify it (quota → dead at once)", async () => {
    vi.mocked(transcribeAudioFile).mockResolvedValue({
      success: false,
      error: "429 You have no credits remaining. Add credits to continue.",
    })
    const err = await runStudioTranscribe(
      { sessionId: "s-1", source: "audio", force: false },
      async () => {},
    ).catch((e) => e)
    expect(isQuotaExceededError(err)).toBe(true)
    expect(createTranscriptError).toHaveBeenCalled()
    expect(createTranscript).not.toHaveBeenCalled()
  })

  it("saves the transcript and reports per-chunk progress", async () => {
    vi.mocked(transcribeAudioFile).mockImplementation(async (_p, _l, _c, onProgress) => {
      onProgress?.({ currentChunk: 2, totalChunks: 4 })
      return { success: true, text: "نص" }
    })
    const progress = vi.fn(async () => {})
    const r = await runStudioTranscribe({ sessionId: "s-1", source: "audio", force: false }, progress)
    expect(r).toEqual({ ok: true, cached: false, chars: 2 })
    expect(createTranscript).toHaveBeenCalledWith("s-1", "whisper", "نص", "ar")
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ currentChunk: 2, totalChunks: 4, fraction: 0.5 }),
    )
  })
})

describe("worker lanes", () => {
  it("puts long batch work on heavy and operator-waited work on interactive", () => {
    for (const t of ["studio.transcribe", "studio.episode_map", "model.benchmark", "market.extract"]) {
      expect(laneForJobType(t)).toBe("heavy")
    }
    for (const t of [
      "prep.generate_v2",
      "season.hybrid_generate",
      "season.batch_generate",
      "original.generate_topics",
      "candidate.analyze",
      "episode.conversation_generate",
    ]) {
      expect(laneForJobType(t)).toBe("interactive")
    }
  })
})

describe("the status card never goes silent", () => {
  const NOW = Date.parse("2026-09-28T10:00:00Z")
  const job = (over: Partial<JobSnapshot> = {}): JobSnapshot => ({
    id: "j",
    type: "prep.generate_v2",
    status: "pending",
    progress: null,
    result: null,
    error_message: null,
    attempts: 0,
    max_attempts: 1,
    created_at: new Date(NOW - 5_000).toISOString(),
    started_at: null,
    completed_at: null,
    locked_by: null,
    lease_age_s: null,
    ...over,
  })
  const worker = (over: Partial<WorkerSnapshot> = {}): WorkerSnapshot => ({
    alive: true,
    lastBeatAgeS: 5,
    busyWith: null,
    lanes: { heavy: null, interactive: null },
    workerId: "worker-live",
    ...over,
  })

  it("pending with no worker → «عامل المهام لا يعمل» + the dev hint in dev only", () => {
    const dev = describeJob(job(), worker({ alive: false }), { nowMs: NOW, isDev: true })
    expect(dev.title).toBe(WORKER_DOWN_TITLE)
    expect(dev.tone).toBe("warning")
    expect(dev.devHint).toBe(WORKER_DEV_HINT)
    const prod = describeJob(job(), worker({ alive: false }), { nowMs: NOW, isDev: false })
    expect(prod.devHint).toBeNull()
  })

  it("pending > 60s while ITS lane is busy → waiting behind another job", () => {
    const old = job({ created_at: new Date(NOW - 90_000).toISOString() })
    const busy = worker({ lanes: { heavy: null, interactive: "season.hybrid_generate" } })
    expect(describeJob(old, busy, { nowMs: NOW, isDev: false }).kind).toBe("waiting_behind")
    // A busy HEAVY lane does not hold an interactive job back.
    const heavyBusy = worker({ lanes: { heavy: "studio.transcribe", interactive: null } })
    expect(describeJob(old, heavyBusy, { nowMs: NOW, isDev: false }).kind).toBe("queued")
  })

  it("running shows «المرحلة 3/5: …»", () => {
    const v = describeJob(
      job({ status: "running", progress: { pass: 3, of: 5, label: "بنك الأسئلة" } }),
      worker(),
      { nowMs: NOW, isDev: false },
    )
    expect(v.progressLabel).toBe("المرحلة 3/5: بنك الأسئلة")
  })

  it("running but held by a worker that was restarted → says so (no frozen progress)", () => {
    const orphan = job({
      status: "running",
      locked_by: "worker-old",
      lease_age_s: 5,
      progress: { pass: 3, of: 5, label: "بنك الأسئلة" },
    })
    // A live worker under a different id, not running this type in any lane.
    const v = describeJob(orphan, worker({ workerId: "worker-new" }), { nowMs: NOW, isDev: false })
    expect(v).toMatchObject({ kind: "orphaned", tone: "warning", title: WORKER_RESTARTED_TITLE })
    // …or its lease simply stopped being renewed.
    expect(
      describeJob({ ...orphan, locked_by: "worker-live", lease_age_s: 200 }, worker(), { nowMs: NOW, isDev: false }).kind,
    ).toBe("orphaned")
    // A healthy run: same owner, fresh lease.
    expect(
      describeJob({ ...orphan, locked_by: "worker-live" }, worker(), { nowMs: NOW, isDev: false }).kind,
    ).toBe("running")
  })

  it("dead → red with the error message and a retry", () => {
    const v = describeJob(
      job({ status: "dead", error_message: "مزوّد الذكاء الاصطناعي أوقف الخدمة" }),
      worker(),
      { nowMs: NOW, isDev: false },
    )
    expect(v).toMatchObject({ kind: "dead", tone: "danger", canRetry: true })
    expect(v.detail).toContain("أوقف الخدمة")
  })

  it("succeeded with warningAr → amber; succeeded with ok:false → not done, with why", () => {
    const warn = describeJob(
      job({ status: "succeeded", result: { ok: true, warningAr: "ملاحظة" } }),
      worker(),
      { nowMs: NOW, isDev: false },
    )
    expect(warn).toMatchObject({ kind: "succeeded_warning", tone: "warning", detail: "ملاحظة" })
    const refused = describeJob(
      job({ status: "succeeded", result: { ok: false, messageAr: ROOM_LIVE_REGENERATION_MESSAGE } }),
      worker(),
      { nowMs: NOW, isDev: false },
    )
    expect(refused).toMatchObject({ kind: "not_done", detail: ROOM_LIVE_REGENERATION_MESSAGE })
  })
})
