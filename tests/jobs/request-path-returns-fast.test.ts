/**
 * Slow AI off the request path — every trigger returns a jobId in < 1s.
 *
 * The HANG-MOCK technique: each slow AI function is mocked to NEVER resolve.
 * If an action or route still awaited it (the bug this change removes), the
 * call below would hang until vitest's timeout. Instead each one must come
 * back with a jobId well under a second, having called the slow function
 * zero times. A test that only mocked the AI to resolve quickly could not
 * tell "enqueued" from "ran it inline, fast" — the hang is what makes it see.
 *
 * Everything below the action is mocked (auth, DB, queue); what is under test
 * is the action/route body and its choice to enqueue instead of await.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockSelectResult, resetMock } from "../db-mock"

// vi.hoisted: the mock factories below are hoisted above ordinary consts.
const { HANG } = vi.hoisted(() => ({ HANG: () => new Promise<never>(() => {}) }))

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api-utils", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "ADMIN" })),
  requireAdminAPI: vi.fn(async () => null),
  requireActionRole: vi.fn(async () => ({ ok: true as const, user: { id: "admin-1" } })),
  getAdminAuthUser: vi.fn(async () => ({ id: "admin-1" })),
}))

// ── The slow functions: all hang forever ─────────────────────────────────────
vi.mock("@/lib/preparation/v2/pipeline", () => ({ runPrepV2Pipeline: vi.fn(HANG) }))
vi.mock("@/lib/hybrid-topics/generate", () => ({ generateHybridTopics: vi.fn(HANG) }))
vi.mock("@/lib/original-thinking/generator", () => ({ generateOriginalTopics: vi.fn(HANG) }))
vi.mock("@/lib/whisper", () => ({ transcribeAudioFile: vi.fn(HANG) }))
vi.mock("@/lib/youtube/download", () => ({ downloadYouTubeAudio: vi.fn(HANG) }))
vi.mock("@/lib/khat-map/v2", () => ({
  generateBatch: vi.fn(HANG),
  generateGuestFirstCards: vi.fn(HANG),
  recordDecisionAndFingerprint: vi.fn(async () => ({ decision: { id: "decision-1" } })),
  undoDecisionAndFingerprint: vi.fn(),
}))

// ── The queue: enqueue answers instantly ─────────────────────────────────────
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: vi.fn(async () => ({ id: "job-x", status: "pending" })),
  enqueueJobOnce: vi.fn(async (type: string) => ({
    job: { id: `job:${type}`, status: "pending" },
    alreadyRunning: false,
  })),
  findInFlightJobByDedupeKey: vi.fn(async () => null),
  listAttachableJobsByDedupeKeys: vi.fn(async () => new Map()),
}))

// ── Cheap dependencies ───────────────────────────────────────────────────────
vi.mock("@/lib/recording-v2/live-guard", () => ({
  hasActiveRecordingForPreparation: vi.fn(async () => false),
  ROOM_LIVE_REGENERATION_MESSAGE: "فيه تسجيل شغّال",
}))
vi.mock("@/lib/hybrid-topics/diagnostics", () => ({
  getHybridReadiness: vi.fn(async () => ({
    blocking_reason: null,
    should_trigger_extraction: false,
    should_trigger_scoring: false,
    should_trigger_clustering: false,
    inflight: { collect: false, extract: false, score: false, cluster: false },
  })),
}))
vi.mock("@/lib/khat-map/core/queries", () => ({
  getSeasonById: vi.fn(async () => ({
    id: "season-1",
    v2_mode: "guided",
    v2_episode_target: 10,
    wizard_stage: "guests",
  })),
  createSeason: vi.fn(),
  patchSeasonControls: vi.fn(),
  createEpisodeCandidate: vi.fn(),
  getEpisodeCandidateById: vi.fn(),
  updateEpisodeCandidateStatus: vi.fn(async () => {}),
}))
vi.mock("@/lib/khat-brain", () => ({ ensureEirForCandidate: vi.fn() }))
vi.mock("@/lib/khat-map/learning/decisions", () => ({ recordDecision: vi.fn() }))
vi.mock("@/lib/studio", () => ({
  getStudioSession: vi.fn(async () => ({
    id: "session-1",
    source: "audio",
    audio_filename: "episode.m4a",
    video_id: "abcdefghijk",
  })),
  getTranscriptForSession: vi.fn(async () => null),
}))
vi.mock("@/lib/studio/audio-path", () => ({
  resolveSessionAudioPath: vi.fn(async () => "/tmp/khat-test/audio-session-1.m4a"),
}))

import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"
import { generateHybridTopics } from "@/lib/hybrid-topics/generate"
import { generateOriginalTopics } from "@/lib/original-thinking/generator"
import { transcribeAudioFile } from "@/lib/whisper"
import { downloadYouTubeAudio } from "@/lib/youtube/download"
import { generateBatch, generateGuestFirstCards } from "@/lib/khat-map/v2"
import { enqueueJobOnce } from "@/lib/jobs/queue"

const SLOW = () => [
  runPrepV2Pipeline,
  generateHybridTopics,
  generateOriginalTopics,
  transcribeAudioFile,
  downloadYouTubeAudio,
  generateBatch,
  generateGuestFirstCards,
]

/** Run `fn`, fail if it takes ≥ 1s, and prove no slow function was touched. */
async function fast<T>(fn: () => Promise<T>): Promise<T> {
  const started = performance.now()
  const out = await Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("did not return within 1s — still awaiting the AI?")), 1000),
    ),
  ])
  expect(performance.now() - started).toBeLessThan(1000)
  for (const f of SLOW()) expect(f).not.toHaveBeenCalled()
  return out
}

const enqueuedType = () => vi.mocked(enqueueJobOnce).mock.calls.at(-1)?.[0]

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("prep generation", () => {
  it("regeneratePrepV2Action enqueues prep.generate_v2 and keeps format + targetMinutes", async () => {
    const { regeneratePrepV2Action } = await import(
      "@/app/admin/khat-brain/episodes/[eirId]/job-actions"
    )
    mockSelectResult([{ id: "prep-1" }])
    const r = await fast(() => regeneratePrepV2Action("eir-1", "course", 90))
    expect(r).toMatchObject({ ok: true, jobId: "job:prep.generate_v2" })
    const [type, payload, opts] = vi.mocked(enqueueJobOnce).mock.calls[0]
    expect(type).toBe("prep.generate_v2")
    expect(payload).toMatchObject({
      preparationId: "prep-1",
      format: "course",
      targetMinutes: 90,
      force: true,
      trigger: "regenerate",
    })
    expect(opts).toMatchObject({ dedupeKey: "prep_v2:prep-1", maxAttempts: 1 })
  })

  it("a regeneration that attaches to an in-flight run SAYS so — with the running run's format", async () => {
    vi.mocked(enqueueJobOnce).mockResolvedValueOnce({
      job: { id: "job-running", status: "running", payload: { format: "story", trigger: "convert" } },
      alreadyRunning: true,
    } as never)
    const { regeneratePrepV2Action } = await import(
      "@/app/admin/khat-brain/episodes/[eirId]/job-actions"
    )
    mockSelectResult([{ id: "prep-1" }])
    const r = await fast(() => regeneratePrepV2Action("eir-1", "course"))
    expect(r).toMatchObject({ ok: true, jobId: "job-running", alreadyRunning: true })
    expect(r.message).toContain("لم تُبدأ عملية جديدة")
    expect(r.message).toContain("«قصة»") // what is actually running
    expect(r.message).toContain("«دورة مصغّرة»") // what they asked for, and how to get it
  })

  it("a live recording room refuses regeneration up front — a clear Arabic result, no job", async () => {
    const { hasActiveRecordingForPreparation } = await import("@/lib/recording-v2/live-guard")
    vi.mocked(hasActiveRecordingForPreparation).mockResolvedValueOnce(true)
    const { regeneratePrepV2Action } = await import(
      "@/app/admin/khat-brain/episodes/[eirId]/job-actions"
    )
    mockSelectResult([{ id: "prep-1" }])
    const r = await fast(() => regeneratePrepV2Action("eir-1"))
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/تسجيل/)
    expect(enqueueJobOnce).not.toHaveBeenCalled()
  })
})

describe("season planning", () => {
  it("generateHybridTopicsAction enqueues season.hybrid_generate", async () => {
    const { generateHybridTopicsAction } = await import(
      "@/app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions"
    )
    const r = await fast(() => generateHybridTopicsAction({ seasonId: "season-1" }))
    expect(r).toMatchObject({ ok: true, jobId: "job:season.hybrid_generate" })
  })

  it("generateOriginalTopicsAction enqueues the existing original.generate_topics", async () => {
    const { generateOriginalTopicsAction } = await import(
      "@/app/admin/khat-brain/original-thinking/actions"
    )
    const r = await fast(() => generateOriginalTopicsAction("ar", 10))
    expect(r).toMatchObject({ ok: true, jobId: "job:original.generate_topics" })
  })

  it("generateBatchAction enqueues season.batch_generate", async () => {
    const { generateBatchAction } = await import("@/app/admin/khat-brain/seasons/actions")
    const r = await fast(() => generateBatchAction({ seasonId: "season-1", size: 4 }))
    expect(r).toEqual({
      success: true,
      data: { jobId: "job:season.batch_generate", alreadyRunning: false },
    })
  })

  it("autoCompleteSeasonAction enqueues season.batch_generate with the missing roles", async () => {
    const { autoCompleteSeasonAction } = await import("@/app/admin/khat-brain/seasons/actions")
    // Two accepted episodes out of a 3-target season → one slot left.
    const { getSeasonById } = await import("@/lib/khat-map/core/queries")
    vi.mocked(getSeasonById).mockResolvedValue({
      id: "season-1",
      v2_mode: "guided",
      v2_episode_target: 3,
    } as never)
    mockSelectResult([
      { episode_type: "intellectual", topic_domain: "economy", risk_level: "safe" },
      { episode_type: "intellectual", topic_domain: "economy", risk_level: "safe" },
    ])
    const r = await fast(() => autoCompleteSeasonAction("season-1"))
    expect(r.success).toBe(true)
    if (!r.success) throw new Error("unreachable")
    expect(r.data.jobId).toBe("job:season.batch_generate")
    const payload = vi.mocked(enqueueJobOnce).mock.calls[0][1] as { mode: string; requiredRoles: string[] }
    expect(payload.mode).toBe("auto_complete")
    expect(payload.requiredRoles.length).toBeGreaterThan(0)
  })

  it("regenerateSlotAction journals the reject, then enqueues one replacement", async () => {
    const { regenerateSlotAction } = await import("@/app/admin/khat-brain/seasons/actions")
    mockSelectResult([{ id: "topic-1", working_title: "حلقة", topic_domain: "economy" }])
    const r = await fast(() =>
      regenerateSlotAction({ seasonId: "season-1", topicCandidateId: "topic-1" }),
    )
    expect(r.success).toBe(true)
    expect(enqueuedType()).toBe("season.batch_generate")
    expect(vi.mocked(enqueueJobOnce).mock.calls[0][2]).toMatchObject({
      dedupeKey: "season_batch:season-1:regenerate_slot:topic-1",
    })
  })

  it("injectGuestAction enqueues the guest-first engine", async () => {
    const { injectGuestAction } = await import("@/app/admin/khat-brain/seasons/actions")
    const r = await fast(() =>
      injectGuestAction({ seasonId: "season-1", guest: { full_name: "ضيف تجريبي" } }),
    )
    expect(r).toEqual({
      success: true,
      data: { jobId: "job:season.batch_generate", alreadyRunning: false },
    })
  })

  it("alternativeAction (keep guest, new topic) records the decision and enqueues the replacement", async () => {
    const { alternativeAction } = await import("@/app/admin/khat-brain/seasons/actions")
    mockSelectResult([{ id: "topic-1", working_title: "حلقة", topic_domain: "economy" }])
    mockSelectResult([{ id: "guest-1", full_name: "ضيف", bio: null, social_accounts: {}, official_website: null }])
    const r = await fast(() =>
      alternativeAction({
        seasonId: "season-1",
        topicCandidateId: "topic-1",
        guestCandidateId: "guest-1",
        batchIndex: 1,
        mode: "keep_guest_generate_new_topic",
      }),
    )
    expect(r.success).toBe(true)
    if (!r.success) throw new Error("unreachable")
    expect(r.data.replacement_job?.jobId).toBe("job:season.batch_generate")
  })
})

describe("studio transcription routes", () => {
  it("POST transcript/whisper answers 202 + jobId", async () => {
    const { POST } = await import("@/app/api/admin/studio/[id]/transcript/whisper/route")
    const res = await fast(() =>
      POST(new Request("http://x/whisper", { method: "POST", body: "{}" }), {
        params: Promise.resolve({ id: "session-1" }),
      }),
    )
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ jobId: "job:studio.transcribe" })
    expect(vi.mocked(enqueueJobOnce).mock.calls[0][1]).toMatchObject({
      sessionId: "session-1",
      source: "audio",
      force: false,
    })
  })

  it("POST transcript/youtube-audio answers 202 + jobId", async () => {
    const { POST } = await import("@/app/api/admin/studio/[id]/transcript/youtube-audio/route")
    const res = await fast(() =>
      POST(new Request("http://x/yt", { method: "POST", body: "{}" }), {
        params: Promise.resolve({ id: "session-1" }),
      }),
    )
    expect(res.status).toBe(202)
    expect(vi.mocked(enqueueJobOnce).mock.calls[0][1]).toMatchObject({ source: "youtube" })
  })

  it("a ready transcript still short-circuits without enqueuing (the ص-٨ cost guard)", async () => {
    const { getTranscriptForSession } = await import("@/lib/studio")
    vi.mocked(getTranscriptForSession).mockResolvedValueOnce({
      status: "ready",
      transcript_clean: "نص جاهز",
    } as never)
    const { POST } = await import("@/app/api/admin/studio/[id]/transcript/whisper/route")
    const res = await fast(() =>
      POST(new Request("http://x/whisper", { method: "POST", body: "{}" }), {
        params: Promise.resolve({ id: "session-1" }),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ cached: true })
    expect(enqueueJobOnce).not.toHaveBeenCalled()
  })
})
