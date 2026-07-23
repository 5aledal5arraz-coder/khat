/**
 * Studio 3-phase journey (Phase 2) — episode-review ENDPOINTS.
 *
 * POST must ENQUEUE the job (never run whisper/AI inline) and fail fast on the
 * doomed cases; the status GET must return the persisted review + the polled
 * job status. Auth, the studio repositories, and the job queue are mocked — no
 * DB, no AI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api-utils", () => ({ requireAdminAPI: vi.fn(async () => null) }))
vi.mock("@/lib/studio", () => ({
  getStudioSession: vi.fn(),
  getProjectByEditedSession: vi.fn(),
  getEpisodeMap: vi.fn(),
  getTimedSegments: vi.fn(),
  getEpisodeReview: vi.fn(),
}))
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: vi.fn(),
  findInFlightJobByPayload: vi.fn(),
}))
vi.mock("@/lib/jobs", () => ({
  getJob: vi.fn(),
  findInFlightJobByPayload: vi.fn(),
}))

import {
  getStudioSession,
  getProjectByEditedSession,
  getEpisodeMap,
  getTimedSegments,
  getEpisodeReview,
} from "@/lib/studio"
import { enqueueJob, findInFlightJobByPayload } from "@/lib/jobs/queue"
import { getJob, findInFlightJobByPayload as findInFlightStatus } from "@/lib/jobs"
import { POST } from "@/app/api/admin/studio/[id]/episode-review/route"
import { GET } from "@/app/api/admin/studio/[id]/episode-review/status/route"

const EDITED = "22222222-2222-2222-2222-222222222222"
const RAW = "11111111-1111-1111-1111-111111111111"

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const postReq = () =>
  new Request(`http://localhost/api/admin/studio/${EDITED}/episode-review`, { method: "POST" })

function arrangePostHappy() {
  vi.mocked(getStudioSession).mockResolvedValue({ id: EDITED, audio_filename: "edited.mp3" } as never)
  vi.mocked(getProjectByEditedSession).mockResolvedValue({
    id: "proj-1",
    raw_session_id: RAW,
    edited_session_id: EDITED,
  } as never)
  vi.mocked(getEpisodeMap).mockResolvedValue({ episode_true_start: 5, breaks: [] } as never)
  vi.mocked(getTimedSegments).mockResolvedValue({
    segments: [{ start: 0, end: 5, text: "x", chunk: 0 }],
    durationSeconds: 25,
  })
  vi.mocked(enqueueJob).mockResolvedValue({ id: "job-1", status: "pending" } as never)
  // Default: no run already in flight → the POST proceeds to enqueue.
  vi.mocked(findInFlightJobByPayload).mockResolvedValue(null)
}

beforeEach(() => {
  vi.clearAllMocks()
  arrangePostHappy()
})

describe("POST /episode-review — enqueues, never runs inline", () => {
  it("enqueues studio.episode_review with the edited session id and returns 202 {jobId}", async () => {
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe("job-1")
    expect(enqueueJob).toHaveBeenCalledTimes(1)
    expect(enqueueJob).toHaveBeenCalledWith("studio.episode_review", { editedSessionId: EDITED })
  })

  it("404s when the session does not exist", async () => {
    vi.mocked(getStudioSession).mockResolvedValue(null)
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(404)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("400s when the edited audio is missing", async () => {
    vi.mocked(getStudioSession).mockResolvedValue({ id: EDITED, audio_filename: null } as never)
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(400)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("400s when the session is not a linked edited session", async () => {
    vi.mocked(getProjectByEditedSession).mockResolvedValue(null)
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(400)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("400s when the raw Phase-1 map is not complete", async () => {
    vi.mocked(getEpisodeMap).mockResolvedValue(null)
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(400)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("400s when the raw session has no timed segments", async () => {
    vi.mocked(getTimedSegments).mockResolvedValue(null)
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(400)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("DEDUP: adopts an already-running job instead of enqueuing a second one", async () => {
    vi.mocked(findInFlightJobByPayload).mockResolvedValue({
      id: "existing-job",
      status: "running",
    } as never)

    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.jobId).toBe("existing-job")
    expect(body.alreadyRunning).toBe(true)
    expect(enqueueJob).not.toHaveBeenCalled()
    expect(findInFlightJobByPayload).toHaveBeenCalledWith(
      "studio.episode_review",
      "editedSessionId",
      EDITED,
    )
  })

  it("DEDUP is per-session: enqueues normally when nothing is in flight", async () => {
    // findInFlightJobByPayload → null (the beforeEach default) → real enqueue.
    const res = await POST(postReq(), params(EDITED))
    expect(res.status).toBe(202)
    expect(enqueueJob).toHaveBeenCalledTimes(1)
  })
})

describe("GET /episode-review/status — persisted review + polled job", () => {
  const statusReq = (jobId?: string) =>
    new Request(
      `http://localhost/api/admin/studio/${EDITED}/episode-review/status${jobId ? `?jobId=${jobId}` : ""}`,
    )

  it("returns the persisted review and the job's status/error", async () => {
    const review = { summary: { applied: 1 }, overall_confidence: 1 }
    vi.mocked(getEpisodeReview).mockResolvedValue(review as never)
    vi.mocked(getJob).mockResolvedValue({ status: "succeeded", error_message: null } as never)

    const res = await GET(statusReq("job-1"), params(EDITED))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.review).toEqual(review)
    expect(body.jobStatus).toBe("succeeded")
    expect(body.jobError).toBeNull()
  })

  it("returns review=null with no job status when nothing exists yet", async () => {
    vi.mocked(getEpisodeReview).mockResolvedValue(null)
    vi.mocked(findInFlightStatus).mockResolvedValue(null)
    const res = await GET(statusReq(), params(EDITED))
    const body = await res.json()
    expect(body.review).toBeNull()
    expect(body.jobStatus).toBeNull()
    expect(body.jobId).toBeNull()
    expect(getJob).not.toHaveBeenCalled()
  })

  it("RE-ATTACH: no jobId + no review → returns the in-flight job for the session", async () => {
    vi.mocked(getEpisodeReview).mockResolvedValue(null)
    vi.mocked(findInFlightStatus).mockResolvedValue({
      id: "inflight-1",
      status: "running",
      error_message: null,
      progress: { stage: "transcribing", fraction: 0.4 },
      started_at: "2026-07-23T10:00:00.000Z",
    } as never)

    const res = await GET(statusReq(), params(EDITED))
    const body = await res.json()
    expect(body.jobId).toBe("inflight-1")
    expect(body.jobStatus).toBe("running")
    expect(body.progress).toEqual({ stage: "transcribing", fraction: 0.4 })
    expect(body.startedAt).toBe("2026-07-23T10:00:00.000Z")
    expect(getJob).not.toHaveBeenCalled()
    expect(findInFlightStatus).toHaveBeenCalledWith(
      "studio.episode_review",
      "editedSessionId",
      EDITED,
    )
  })

  it("does NOT look up an in-flight job when a saved review already exists", async () => {
    vi.mocked(getEpisodeReview).mockResolvedValue({ summary: {} } as never)
    const res = await GET(statusReq(), params(EDITED))
    const body = await res.json()
    expect(body.review).toEqual({ summary: {} })
    expect(findInFlightStatus).not.toHaveBeenCalled()
  })

  it("uses getJob (not the in-flight lookup) when an explicit jobId is polled", async () => {
    vi.mocked(getEpisodeReview).mockResolvedValue(null)
    vi.mocked(getJob).mockResolvedValue({ status: "running", error_message: null } as never)
    const res = await GET(statusReq("job-x"), params(EDITED))
    const body = await res.json()
    expect(body.jobStatus).toBe("running")
    expect(getJob).toHaveBeenCalledWith("job-x")
    expect(findInFlightStatus).not.toHaveBeenCalled()
  })
})
