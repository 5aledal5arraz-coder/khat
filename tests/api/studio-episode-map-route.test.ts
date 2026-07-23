/**
 * Studio 3-phase journey (Phase 1) — episode-map ENDPOINTS.
 *
 * POST must ENQUEUE the map job (never run whisper/AI inline), fail fast on the
 * doomed cases, and DEDUP a second enqueue for the same session. The status GET
 * must return the persisted map + the polled job, and — on a refresh with no
 * jobId and no saved map — RE-ATTACH by returning the in-flight job so the UI
 * resumes its progress bar. Auth, the studio repositories, and the job queue are
 * mocked — no DB, no AI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api-utils", () => ({ requireAdminAPI: vi.fn(async () => null) }))
vi.mock("@/lib/studio", () => ({
  getStudioSession: vi.fn(),
  getEpisodeMap: vi.fn(),
}))
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: vi.fn(),
  findInFlightJobByPayload: vi.fn(),
}))
vi.mock("@/lib/jobs", () => ({
  getJob: vi.fn(),
  findInFlightJobByPayload: vi.fn(),
}))

import { getStudioSession, getEpisodeMap } from "@/lib/studio"
import { enqueueJob, findInFlightJobByPayload } from "@/lib/jobs/queue"
import { getJob, findInFlightJobByPayload as findInFlightStatus } from "@/lib/jobs"
import { POST } from "@/app/api/admin/studio/[id]/episode-map/route"
import { GET } from "@/app/api/admin/studio/[id]/episode-map/status/route"

const SESSION = "11111111-1111-1111-1111-111111111111"

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const postReq = () =>
  new Request(`http://localhost/api/admin/studio/${SESSION}/episode-map`, {
    method: "POST",
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStudioSession).mockResolvedValue({
    id: SESSION,
    audio_filename: "raw.mp3",
  } as never)
  vi.mocked(enqueueJob).mockResolvedValue({ id: "job-1", status: "pending" } as never)
  vi.mocked(findInFlightJobByPayload).mockResolvedValue(null)
})

describe("POST /episode-map — enqueues, never runs inline", () => {
  it("enqueues studio.episode_map with the session id and returns 202 {jobId}", async () => {
    const res = await POST(postReq(), params(SESSION))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe("job-1")
    expect(enqueueJob).toHaveBeenCalledWith("studio.episode_map", { sessionId: SESSION })
  })

  it("404s when the session does not exist", async () => {
    vi.mocked(getStudioSession).mockResolvedValue(null)
    const res = await POST(postReq(), params(SESSION))
    expect(res.status).toBe(404)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("400s when there is no uploaded audio", async () => {
    vi.mocked(getStudioSession).mockResolvedValue({
      id: SESSION,
      audio_filename: null,
    } as never)
    const res = await POST(postReq(), params(SESSION))
    expect(res.status).toBe(400)
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("DEDUP: adopts an already-running job instead of enqueuing a second one", async () => {
    vi.mocked(findInFlightJobByPayload).mockResolvedValue({
      id: "existing-job",
      status: "running",
    } as never)

    const res = await POST(postReq(), params(SESSION))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.jobId).toBe("existing-job")
    expect(body.alreadyRunning).toBe(true)
    expect(enqueueJob).not.toHaveBeenCalled()
    expect(findInFlightJobByPayload).toHaveBeenCalledWith(
      "studio.episode_map",
      "sessionId",
      SESSION,
    )
  })
})

describe("GET /episode-map/status — persisted map + polled/re-attached job", () => {
  const statusReq = (jobId?: string) =>
    new Request(
      `http://localhost/api/admin/studio/${SESSION}/episode-map/status${jobId ? `?jobId=${jobId}` : ""}`,
    )

  it("returns the persisted map and the polled job's status/error", async () => {
    const map = { episode_true_start: 5, breaks: [] }
    vi.mocked(getEpisodeMap).mockResolvedValue(map as never)
    vi.mocked(getJob).mockResolvedValue({
      status: "succeeded",
      error_message: null,
    } as never)

    const res = await GET(statusReq("job-1"), params(SESSION))
    const body = await res.json()
    expect(body.map).toEqual(map)
    expect(body.jobStatus).toBe("succeeded")
    expect(findInFlightStatus).not.toHaveBeenCalled()
  })

  it("returns map=null and no job when nothing exists yet", async () => {
    vi.mocked(getEpisodeMap).mockResolvedValue(null)
    vi.mocked(findInFlightStatus).mockResolvedValue(null)
    const res = await GET(statusReq(), params(SESSION))
    const body = await res.json()
    expect(body.map).toBeNull()
    expect(body.jobId).toBeNull()
    expect(body.jobStatus).toBeNull()
    expect(getJob).not.toHaveBeenCalled()
  })

  it("RE-ATTACH: no jobId + no map → returns the in-flight job for the session", async () => {
    vi.mocked(getEpisodeMap).mockResolvedValue(null)
    vi.mocked(findInFlightStatus).mockResolvedValue({
      id: "inflight-1",
      status: "running",
      error_message: null,
      progress: { stage: "transcribing", fraction: 0.6 },
      started_at: "2026-07-23T09:00:00.000Z",
    } as never)

    const res = await GET(statusReq(), params(SESSION))
    const body = await res.json()
    expect(body.jobId).toBe("inflight-1")
    expect(body.jobStatus).toBe("running")
    expect(body.progress).toEqual({ stage: "transcribing", fraction: 0.6 })
    expect(body.startedAt).toBe("2026-07-23T09:00:00.000Z")
    expect(findInFlightStatus).toHaveBeenCalledWith(
      "studio.episode_map",
      "sessionId",
      SESSION,
    )
  })

  it("does NOT look up an in-flight job when a saved map already exists", async () => {
    const map = { episode_true_start: 0, breaks: [] }
    vi.mocked(getEpisodeMap).mockResolvedValue(map as never)
    const res = await GET(statusReq(), params(SESSION))
    const body = await res.json()
    expect(body.map).toEqual(map)
    expect(findInFlightStatus).not.toHaveBeenCalled()
  })
})
