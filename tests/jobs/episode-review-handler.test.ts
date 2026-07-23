/**
 * Studio 3-phase journey (Phase 2) — episode-review JOB handler orchestration.
 *
 * These prove the WIRING, not the verdict maths (the pure `reviewEpisodeEdits`
 * has its own 841-test suite). whisper, the DB-backed repositories, and fs are
 * mocked — NO paid AI, NO real DB, NO disk. The PURE `reviewEpisodeEdits` runs
 * for real, so the test also proves the handler feeds it the raw segments/map +
 * edited segments and stores the real review it returns.
 *
 * Covered:
 *   - happy path: transcribe edited → run review → store it (keyed to EDITED
 *     session), with the whisper call tagged phase="review_transcription".
 *   - missing payload / no project / raw Phase-1 not done → CLEAR errors.
 *   - whisper failure → surfaced as an error (job fails, nothing stored).
 *   - state is NEVER transitioned here (approval owns `reviewed`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TimedSegment } from "@/lib/studio/segments"

// ── mock the side-effecting deps; leave reviewEpisodeEdits + registry REAL ────
vi.mock("@/lib/studio", () => ({ getStudioSession: vi.fn() }))
vi.mock("@/lib/studio/projects", () => ({ getProjectByEditedSession: vi.fn() }))
vi.mock("@/lib/studio/analysis-records", () => ({ resolveEirIdForSession: vi.fn() }))
vi.mock("@/lib/studio/transcripts", () => ({
  getTimedSegments: vi.fn(),
  getEpisodeMap: vi.fn(),
  saveEpisodeReview: vi.fn(),
}))
vi.mock("@/lib/whisper", () => ({ transcribeWithTimestamps: vi.fn() }))
// fs.access must resolve so resolveSessionAudioPath doesn't reject.
vi.mock("fs/promises", () => ({ default: { access: vi.fn(async () => undefined) } }))

import { getStudioSession } from "@/lib/studio"
import { getProjectByEditedSession } from "@/lib/studio/projects"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import {
  getTimedSegments,
  getEpisodeMap,
  saveEpisodeReview,
} from "@/lib/studio/transcripts"
import { transcribeWithTimestamps } from "@/lib/whisper"
import {
  DEGENERATE_EDITED_TRANSCRIPT_MESSAGE,
  DEGENERATE_RAW_REVIEW_TRANSCRIPT_MESSAGE,
} from "@/lib/studio/transcript-quality"
import { getHandler, type JobContext } from "@/lib/jobs"
// Side-effect: registers "studio.episode_review".
import "@/lib/jobs/handlers/episode-review"

const RAW = "11111111-1111-1111-1111-111111111111"
const EDITED = "22222222-2222-2222-2222-222222222222"

const CTX: JobContext = {
  jobId: "job-1",
  jobType: "studio.episode_review",
  attempt: 0,
  maxAttempts: 3,
  workerId: "test-worker",
  // Real worker wires a swallowing reporter; default happy CTX resolves.
  reportProgress: vi.fn(async () => undefined),
}

// Raw: [0,5) is pre-roll content that the edit removes; the rest survives.
const RAW_SEGMENTS: TimedSegment[] = [
  { start: 0, end: 5, text: "مقدمة ترحيبية طويلة قبل بداية الحلقة", chunk: 0 },
  { start: 5, end: 15, text: "تبدأ الحلقة الآن مع ضيفنا الكريم في اللقاء", chunk: 0 },
  { start: 15, end: 25, text: "نتحدث عن موضوع مهم للغاية اليوم هنا", chunk: 0 },
]
const EDITED_SEGMENTS: TimedSegment[] = [
  { start: 0, end: 10, text: "تبدأ الحلقة الآن مع ضيفنا الكريم في اللقاء", chunk: 0 },
  { start: 10, end: 20, text: "نتحدث عن موضوع مهم للغاية اليوم هنا", chunk: 0 },
]
const MAP = { episode_true_start: 5, breaks: [] as Array<{ start_seconds: number; end_seconds: number }> }

function handler() {
  const h = getHandler("studio.episode_review")
  if (!h) throw new Error("handler not registered")
  return h
}

/** Wire every mock to the happy path; individual tests override one at a time. */
function arrangeHappy() {
  vi.mocked(getStudioSession).mockResolvedValue({
    id: EDITED,
    audio_filename: "edited.mp3",
  } as never)
  vi.mocked(getProjectByEditedSession).mockResolvedValue({
    id: "proj-1",
    eir_id: null,
    raw_session_id: RAW,
    edited_session_id: EDITED,
    state: "mapped",
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
  })
  vi.mocked(resolveEirIdForSession).mockResolvedValue(null)
  vi.mocked(getTimedSegments).mockResolvedValue({ segments: RAW_SEGMENTS, durationSeconds: 25 })
  vi.mocked(getEpisodeMap).mockResolvedValue(MAP as never)
  vi.mocked(transcribeWithTimestamps).mockResolvedValue({
    success: true,
    segments: EDITED_SEGMENTS,
    durationSeconds: 20,
  })
  vi.mocked(saveEpisodeReview).mockResolvedValue(undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  arrangeHappy()
})

describe("studio.episode_review handler — happy path", () => {
  it("transcribes the edited audio, runs the review, and stores it keyed to the EDITED session", async () => {
    const result = (await handler()({ editedSessionId: EDITED }, CTX)) as Record<string, unknown>

    // Ran the review over raw segments/map + edited segments and stored it.
    expect(saveEpisodeReview).toHaveBeenCalledTimes(1)
    const [savedSessionId, review] = vi.mocked(saveEpisodeReview).mock.calls[0]
    expect(savedSessionId).toBe(EDITED) // NOT the raw session
    // The stored object is a real EpisodeReview computed from the inputs.
    expect(review.raw_duration).toBe(25)
    expect(review.edited_duration).toBe(20)
    expect(review.notes).toHaveLength(1) // one pre-roll region from the map
    expect(review.summary).toBeDefined()

    // Result mirrors the summary.
    expect(result.edited_session_id).toBe(EDITED)
    expect(result.raw_session_id).toBe(RAW)
    expect(result.edited_segment_count).toBe(2)
    expect(typeof result.overall_confidence).toBe("number")
  })

  it("tags the edited-audio whisper call with phase='review_transcription'", async () => {
    await handler()({ editedSessionId: EDITED }, CTX)
    expect(transcribeWithTimestamps).toHaveBeenCalledTimes(1)
    const args = vi.mocked(transcribeWithTimestamps).mock.calls[0]
    // (audioPath, language, context, phase)
    expect(args[1]).toBe("ar")
    expect(args[2]).toMatchObject({ subjectTable: "studio_sessions", subjectId: EDITED })
    expect(args[3]).toBe("review_transcription")
    expect(String(args[0])).toContain(`audio-${EDITED}.mp3`)
  })

  it("does NOT transition the project state (approval owns `reviewed`)", async () => {
    // getProjectByEditedSession is the only project-module fn imported; there is
    // no transitionState import in the handler, so a stored review + a resolved
    // project with UNCHANGED state proves no transition happened.
    await handler()({ editedSessionId: EDITED }, CTX)
    expect(saveEpisodeReview).toHaveBeenCalledTimes(1)
    // The project fetched stays `mapped`; nothing advanced it to `reviewed`.
    const project = await vi.mocked(getProjectByEditedSession).mock.results[0].value
    expect(project.state).toBe("mapped")
  })
})

describe("studio.episode_review handler — progress heartbeat", () => {
  it("reports transcribing → per-chunk → comparing → done through ctx.reportProgress", async () => {
    // Drive the mocked whisper's per-chunk callback (5th arg) — NO paid AI.
    vi.mocked(transcribeWithTimestamps).mockImplementation(
      async (_path, _lang, _ctx, _phase, onProgress) => {
        onProgress?.({ currentChunk: 1, totalChunks: 3 })
        onProgress?.({ currentChunk: 2, totalChunks: 3 })
        onProgress?.({ currentChunk: 3, totalChunks: 3 })
        return { success: true, segments: EDITED_SEGMENTS, durationSeconds: 20 }
      },
    )
    const reportProgress = vi.fn<(p: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    )
    await handler()({ editedSessionId: EDITED }, { ...CTX, reportProgress })

    const stages = reportProgress.mock.calls.map(
      (c) => (c[0] as { stage: string }).stage,
    )
    // initial transcribing, three per-chunk transcribing, then comparing, then done
    expect(stages[0]).toBe("transcribing")
    expect(stages).toContain("comparing")
    expect(stages[stages.length - 1]).toBe("done")
    // comparing sits after the LAST transcribing tick and before done
    expect(stages.indexOf("comparing")).toBeGreaterThan(stages.lastIndexOf("transcribing"))
    expect(stages.indexOf("comparing")).toBeLessThan(stages.indexOf("done"))

    // Transcription fractions are monotonic and transcription-weighted (last = 0.9).
    const transcribeFractions = reportProgress.mock.calls
      .map((c) => c[0] as { stage: string; fraction: number })
      .filter((p) => p.stage === "transcribing")
      .map((p) => p.fraction)
    for (let i = 1; i < transcribeFractions.length; i++) {
      expect(transcribeFractions[i]).toBeGreaterThanOrEqual(transcribeFractions[i - 1])
    }
    expect(transcribeFractions[transcribeFractions.length - 1]).toBeCloseTo(0.9, 5)
  })

  it("stores the review even when transcribeWithTimestamps never reports progress", async () => {
    // Omitting onProgress calls (the additive default) leaves the job fully working.
    vi.mocked(transcribeWithTimestamps).mockResolvedValue({
      success: true,
      segments: EDITED_SEGMENTS,
      durationSeconds: 20,
    })
    await handler()({ editedSessionId: EDITED }, CTX)
    expect(saveEpisodeReview).toHaveBeenCalledTimes(1)
  })
})

describe("studio.episode_review handler — guard rails (clear errors, nothing stored)", () => {
  it("rejects when editedSessionId is missing from the payload", async () => {
    await expect(handler()({}, CTX)).rejects.toThrow(/editedSessionId is required/)
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("rejects when no project is linked to the edited session", async () => {
    vi.mocked(getProjectByEditedSession).mockResolvedValue(null)
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(
      /no studio project is linked/,
    )
    expect(transcribeWithTimestamps).not.toHaveBeenCalled()
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("rejects when the raw session has no timed segments (Phase 1 not done)", async () => {
    vi.mocked(getTimedSegments).mockResolvedValue(null)
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(
      /no timed segments/,
    )
    expect(transcribeWithTimestamps).not.toHaveBeenCalled()
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("rejects when the raw session has no episode map (Phase 1 not done)", async () => {
    vi.mocked(getEpisodeMap).mockResolvedValue(null)
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(
      /no episode map/,
    )
    expect(transcribeWithTimestamps).not.toHaveBeenCalled()
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("rejects when the edited session has no uploaded audio", async () => {
    vi.mocked(getStudioSession).mockResolvedValue({ id: EDITED, audio_filename: null } as never)
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(
      /no uploaded audio/,
    )
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("surfaces a whisper failure and stores nothing", async () => {
    vi.mocked(transcribeWithTimestamps).mockResolvedValue({
      success: false,
      error: "فشل في تحويل الصوت",
    })
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(/فشل في تحويل الصوت/)
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })
})

describe("studio.episode_review handler — degenerate EDITED transcript (whisper loop)", () => {
  // A decoding loop on the edited audio: >= HARD_LOOP_RUN_LENGTH (10) identical
  // consecutive segments. Monotonic starts so it passes reviewEpisodeEdits'
  // structural assertSegments — the ONLY thing that must stop it is the degeneracy
  // guard, so `saveEpisodeReview not called` genuinely distinguishes guard-fired
  // from guard-absent (without the guard, reviewEpisodeEdits would succeed on a
  // garbage transcript and the review WOULD be stored).
  const LOOPED_EDITED: TimedSegment[] = Array.from({ length: 20 }, (_, i) => ({
    start: i * 2,
    end: i * 2 + 1.8,
    text: "ثاني",
    chunk: 0,
  }))

  it("FAILS the job with the edited-context Arabic message and stores nothing", async () => {
    vi.mocked(transcribeWithTimestamps).mockResolvedValue({
      success: true,
      segments: LOOPED_EDITED,
      durationSeconds: 40,
    })

    // Throws the edited-specific message (a message reviewEpisodeEdits can NEVER
    // produce — proof the guard fired BEFORE the pure verdict, not after).
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(
      DEGENERATE_EDITED_TRANSCRIPT_MESSAGE,
    )

    // The edited audio WAS transcribed (the guard sits AFTER transcription)…
    expect(transcribeWithTimestamps).toHaveBeenCalledTimes(1)
    // …but NO review was built on the hallucinated edited text and NONE stored.
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("still stores a review when the SAME arrangement yields a healthy edited transcript", async () => {
    // Sanity: the guard is specific to degeneracy — the default healthy edited
    // segments proceed to a stored review (guards the guard against over-firing).
    await handler()({ editedSessionId: EDITED }, CTX)
    expect(saveEpisodeReview).toHaveBeenCalledTimes(1)
  })
})

describe("studio.episode_review handler — degenerate RAW remainder after filtering (Wave-1.6, Finding 1)", () => {
  // Raw whisper output where the filter drops a middle HARD run and SPLICES the two
  // sub-HARD "ثاني" runs into one connected 16-long loop in `cleanRaw`. That residual
  // loop reads "absent" from the (healthy) edited transcript and would fabricate a
  // FALSE ✅ "applied" — the review's cardinal sin. Monotonic 2s starts so it passes
  // reviewEpisodeEdits' structural assertSegments; only the residual guard must stop it.
  const MERGED_RAW: TimedSegment[] = [
    ...Array.from({ length: 8 }, () => "ثاني"),
    ...Array.from({ length: 10 }, () => "اكس"),
    ...Array.from({ length: 8 }, () => "ثاني"),
  ].map((text, i) => ({ start: i * 2, end: i * 2 + 1.8, text, chunk: 0 }))

  it("FAILS the review with the raw-context Arabic message and stores nothing", async () => {
    vi.mocked(getTimedSegments).mockResolvedValue({ segments: MERGED_RAW, durationSeconds: 60 })
    // The EDITED transcript stays HEALTHY (arrangeHappy default) so guard 3b passes and
    // the raw-remainder guard is unambiguously what fires.
    await expect(handler()({ editedSessionId: EDITED }, CTX)).rejects.toThrow(
      DEGENERATE_RAW_REVIEW_TRANSCRIPT_MESSAGE,
    )
    // The edited audio WAS transcribed (the raw guard sits AFTER 3b + the raw filter)…
    expect(transcribeWithTimestamps).toHaveBeenCalledTimes(1)
    // …but NO review was built on the residual raw loop and NONE stored.
    expect(saveEpisodeReview).not.toHaveBeenCalled()
  })

  it("still reviews when the raw remainder is CLEAN after filtering (guard does not over-fire)", async () => {
    // Sanity: a raw transcript with NO residual loop proceeds to a stored review — the
    // guard is specific to a degenerate remainder, not any filtering at all.
    await handler()({ editedSessionId: EDITED }, CTX)
    expect(saveEpisodeReview).toHaveBeenCalledTimes(1)
  })
})
