/**
 * ص-٩ — the three ways «توليد أقسام الحوار» can come back with nothing, and
 * what the job layer does with each.
 *
 * The point of these tests is not that generation works — it is that every
 * failure ARRIVES SOMEWHERE READABLE. A generator whose "no transcript" is
 * indistinguishable from "still thinking" is the recurring KHAT failure mode,
 * so each branch is asserted on two things: the Arabic message, and whether
 * the worker should bother retrying it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// `vi.mock` factories are hoisted above every top-level statement, so the doubles
// they close over have to be created by `vi.hoisted` — a plain `const` above is
// still in its temporal dead zone when the factory runs.
const { studio, generateEpisodeConversation, setEpisodeEnrichment, getEpisodeEnrichment, saveVersion, episodeGenerationContext } =
  vi.hoisted(() => ({
    studio: {
      findSessionLinkedToEpisode: vi.fn(),
      getStudioSession: vi.fn(),
      getStudioSessionsByVideoId: vi.fn(),
      getTranscriptForSession: vi.fn(),
      getEpisodeIntelligenceForSession: vi.fn(),
    },
    generateEpisodeConversation: vi.fn(),
    setEpisodeEnrichment: vi.fn(),
    getEpisodeEnrichment: vi.fn(),
    saveVersion: vi.fn(),
    episodeGenerationContext: vi.fn(),
  }))

vi.mock("@/lib/studio", () => studio)
vi.mock("@/lib/ai", () => ({ generateEpisodeConversation }))
vi.mock("@/lib/episodes/enrichments", () => ({ getEpisodeEnrichment, setEpisodeEnrichment }))
vi.mock("@/lib/episodes/versions", () => ({ saveVersion }))
vi.mock("@/lib/episodes/generation-context", () => ({ episodeGenerationContext }))

import { runConversationGeneration } from "@/lib/episodes/conversation-generation"
import { NonRetryableJobError } from "@/lib/jobs/types"

const SESSION = { id: "sess-1", video_title: "حلقة" }

function ready(text: string) {
  return { status: "ready", transcript_clean: text }
}

beforeEach(() => {
  vi.clearAllMocks()
  episodeGenerationContext.mockResolvedValue({ lane: "khat", eirId: null })
  studio.findSessionLinkedToEpisode.mockResolvedValue(null)
  studio.getStudioSessionsByVideoId.mockResolvedValue([])
  studio.getEpisodeIntelligenceForSession.mockResolvedValue(null)
  getEpisodeEnrichment.mockResolvedValue(null)
})

describe("runConversationGeneration — the lane gate (خط only)", () => {
  it("refuses a clip, and says so", async () => {
    episodeGenerationContext.mockResolvedValue({ lane: "clips", eirId: null })

    const res = await runConversationGeneration("ep-clip")

    expect(res).toMatchObject({ ok: false, reason: "not_khat_lane" })
    expect(!res.ok && res.error).toContain("مقطع")
    // Refused BEFORE touching the studio, so a clip costs nothing at all.
    expect(studio.findSessionLinkedToEpisode).not.toHaveBeenCalled()
    expect(generateEpisodeConversation).not.toHaveBeenCalled()
  })

  it("refuses a separate programme (سالفة), and says so", async () => {
    episodeGenerationContext.mockResolvedValue({ lane: "separate", eirId: null })

    const res = await runConversationGeneration("ep-salfa")

    expect(res).toMatchObject({ ok: false, reason: "not_khat_lane" })
    expect(!res.ok && res.error).toContain("ليست حلقة خط كاملة")
    expect(generateEpisodeConversation).not.toHaveBeenCalled()
  })

  it("ALLOWS an uncategorised episode through — the classifier's default is خط", async () => {
    // The reverse-direction rule: everything is خط EXCEPT the listed
    // exceptions, so a real episode whose category has not been assigned yet
    // must not be locked out over incomplete paperwork. It proceeds and fails
    // for a data reason instead.
    episodeGenerationContext.mockResolvedValue({ lane: "khat", eirId: null })

    const res = await runConversationGeneration("ep-uncategorised")

    expect(res).toMatchObject({ ok: false, reason: "no_session" })
    expect(studio.findSessionLinkedToEpisode).toHaveBeenCalled()
  })

  it("a missing episode row is 'no_episode', not silently خط", async () => {
    episodeGenerationContext.mockResolvedValue({ lane: null, eirId: null })

    const res = await runConversationGeneration("ep-ghost")

    expect(res).toMatchObject({ ok: false, reason: "no_episode" })
    expect(studio.findSessionLinkedToEpisode).not.toHaveBeenCalled()
  })
})

describe("runConversationGeneration — the three empty-handed outcomes", () => {
  it("no studio session at all → no_session, with the fix in the message", async () => {
    const res = await runConversationGeneration("ep-1")

    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ reason: "no_session" })
    expect(!res.ok && res.error).toContain("لا توجد جلسة استوديو")
    // Never reached the model — nothing to pay for.
    expect(generateEpisodeConversation).not.toHaveBeenCalled()
  })

  it("a session exists but no transcript is ready → no_transcript", async () => {
    studio.getStudioSessionsByVideoId.mockResolvedValue([SESSION])
    studio.getTranscriptForSession.mockResolvedValue({ status: "pending", transcript_clean: null })

    const res = await runConversationGeneration("ep-1")

    expect(res).toMatchObject({ ok: false, reason: "no_transcript" })
    expect(!res.ok && res.error).toContain("لا يوجد نص جاهز")
    expect(generateEpisodeConversation).not.toHaveBeenCalled()
  })

  it("a 'ready' transcript with empty text is still no_transcript", async () => {
    studio.getStudioSessionsByVideoId.mockResolvedValue([SESSION])
    studio.getTranscriptForSession.mockResolvedValue({ status: "ready", transcript_clean: "" })

    expect(await runConversationGeneration("ep-1")).toMatchObject({
      ok: false,
      reason: "no_transcript",
    })
  })

  it("the AI call itself failing → generation_failed, message passed through verbatim", async () => {
    studio.getStudioSessionsByVideoId.mockResolvedValue([SESSION])
    studio.getTranscriptForSession.mockResolvedValue(ready("نص طويل"))
    generateEpisodeConversation.mockResolvedValue({
      success: false,
      error: "OPENAI_API_KEY غير مُعدّ",
    })

    const res = await runConversationGeneration("ep-1")

    expect(res).toMatchObject({ ok: false, reason: "generation_failed" })
    expect(!res.ok && res.error).toBe("OPENAI_API_KEY غير مُعدّ")
    expect(setEpisodeEnrichment).not.toHaveBeenCalled()
  })
})

describe("runConversationGeneration — success paths", () => {
  beforeEach(() => {
    studio.getStudioSessionsByVideoId.mockResolvedValue([SESSION])
    studio.getTranscriptForSession.mockResolvedValue(ready("نص طويل"))
  })

  it("writes nothing when every field already had human content", async () => {
    generateEpisodeConversation.mockResolvedValue({
      success: true,
      filled: [],
      skipped: ["why_this_conversation"],
    })

    const res = await runConversationGeneration("ep-1")

    expect(res).toMatchObject({ ok: true, filled: [], skipped: ["why_this_conversation"] })
    expect(setEpisodeEnrichment).not.toHaveBeenCalled()
  })

  it("attributes the ai_runs row to the episode AND its EIR", async () => {
    // Cost rows are written at call time and can never be attributed later,
    // so this is asserted on the call, not on any stored result.
    episodeGenerationContext.mockResolvedValue({ lane: "khat", eirId: "eir-7" })
    generateEpisodeConversation.mockResolvedValue({ success: true, filled: [], skipped: [] })

    await runConversationGeneration("ep-1")

    expect(generateEpisodeConversation.mock.calls[0][0].eirContext).toEqual({
      eirId: "eir-7",
      subjectTable: "episode_enrichments",
      subjectId: "ep-1",
    })
  })

  it("still names the episode when the episode has no EIR", async () => {
    generateEpisodeConversation.mockResolvedValue({ success: true, filled: [], skipped: [] })

    await runConversationGeneration("ep-1")

    expect(generateEpisodeConversation.mock.calls[0][0].eirContext).toMatchObject({
      eirId: null,
      subjectId: "ep-1",
    })
  })

  it("persists the patch and never carries an approval for «ما لم يُقال»", async () => {
    generateEpisodeConversation.mockResolvedValue({
      success: true,
      filled: ["unsaid_reflections"],
      skipped: [],
      patch: { unsaid_reflections: ["بند مولَّد"] },
    })

    const res = await runConversationGeneration("ep-1")

    expect(res).toMatchObject({ ok: true, filled: ["unsaid_reflections"] })
    const written = setEpisodeEnrichment.mock.calls[0][0]
    expect(written.unsaid_reflections).toEqual(["بند مولَّد"])
    // The gate column is absent — generation can never approve its own output.
    expect(written).not.toHaveProperty("unsaid_reflections_approved")
  })

  it("prefers the explicitly linked session over the video-id fallback", async () => {
    studio.findSessionLinkedToEpisode.mockResolvedValue("sess-linked")
    studio.getStudioSession.mockResolvedValue({ id: "sess-linked", video_title: "المربوطة" })
    studio.getTranscriptForSession.mockResolvedValue(ready("نص"))
    generateEpisodeConversation.mockResolvedValue({ success: true, filled: [], skipped: [] })

    await runConversationGeneration("ep-1")

    expect(studio.getTranscriptForSession).toHaveBeenNthCalledWith(1, "sess-linked")
  })
})

describe("episode.conversation_generate handler — retry policy", () => {
  it("dead-letters a clip immediately — it will still be a clip on attempt 3", async () => {
    const { registry, jobType } = await loadHandler()
    episodeGenerationContext.mockResolvedValue({ lane: "clips", eirId: null })

    const handler = registry.getHandler(jobType)
    await expect(handler!({ episodeId: "ep-clip" }, ctx())).rejects.toBeInstanceOf(
      NonRetryableJobError,
    )
  })

  it("dead-letters a missing session immediately instead of retrying it 3 times", async () => {
    const { registry, jobType } = await loadHandler()
    studio.getStudioSessionsByVideoId.mockResolvedValue([])

    const handler = registry.getHandler(jobType)
    expect(handler).toBeTypeOf("function")

    await expect(handler!({ episodeId: "ep-1" }, ctx())).rejects.toBeInstanceOf(
      NonRetryableJobError,
    )
  })

  it("lets a failed AI call take the normal retry ladder", async () => {
    const { registry, jobType } = await loadHandler()
    studio.getStudioSessionsByVideoId.mockResolvedValue([SESSION])
    studio.getTranscriptForSession.mockResolvedValue(ready("نص"))
    generateEpisodeConversation.mockResolvedValue({ success: false, error: "502 من المزوّد" })

    const handler = registry.getHandler(jobType)
    const err = await handler!({ episodeId: "ep-1" }, ctx()).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(NonRetryableJobError)
    expect((err as Error).message).toBe("502 من المزوّد")
  })
})

/** Import the handler module for its registration side effect. */
async function loadHandler() {
  const registry = await import("@/lib/jobs/registry")
  const { EPISODE_CONVERSATION_GENERATE_JOB } = await import(
    "@/lib/jobs/episode-conversation-jobs"
  )
  await import("@/lib/jobs/handlers/episode-conversation")
  return { registry, jobType: EPISODE_CONVERSATION_GENERATE_JOB }
}

function ctx() {
  return {
    jobId: "job-1",
    jobType: "episode.conversation_generate",
    attempt: 1,
    maxAttempts: 3,
    workerId: "test",
    reportProgress: async () => {},
  } as never
}
