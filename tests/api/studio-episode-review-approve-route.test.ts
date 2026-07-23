/**
 * Studio 3-phase journey, Step 4 — the Phase-2 APPROVE endpoint.
 *
 * Approval must: require a project-linked edited session, require a REAL
 * review to exist (no blind stamp), and transition `mapped → reviewed`
 * through the state machine (which opens the Phase-3 gate). Auth + the
 * studio repositories are mocked — no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api-utils", () => ({ requireAdminAPI: vi.fn(async () => null) }))
vi.mock("@/lib/studio", () => ({
  getProjectByEditedSession: vi.fn(),
  getEpisodeReview: vi.fn(),
  transitionState: vi.fn(),
}))

import {
  getProjectByEditedSession,
  getEpisodeReview,
  transitionState,
} from "@/lib/studio"
import { POST } from "@/app/api/admin/studio/[id]/episode-review/approve/route"

const EDITED = "22222222-2222-2222-2222-222222222222"
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () =>
  new Request(`http://localhost/api/admin/studio/${EDITED}/episode-review/approve`, {
    method: "POST",
  })

function arrangeHappy() {
  vi.mocked(getProjectByEditedSession).mockResolvedValue({
    id: "proj-1",
    edited_session_id: EDITED,
    state: "mapped",
  } as never)
  vi.mocked(getEpisodeReview).mockResolvedValue({ summary: { applied: 1 } } as never)
  vi.mocked(transitionState).mockResolvedValue({
    id: "proj-1",
    state: "reviewed",
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  arrangeHappy()
})

describe("POST /episode-review/approve", () => {
  it("transitions mapped → reviewed and returns the updated project", async () => {
    const res = await POST(req(), params(EDITED))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.state).toBe("reviewed")
    expect(transitionState).toHaveBeenCalledWith("proj-1", "reviewed")
  })

  it("400s when the session is not a linked edited session", async () => {
    vi.mocked(getProjectByEditedSession).mockResolvedValue(null)
    const res = await POST(req(), params(EDITED))
    expect(res.status).toBe(400)
    expect(transitionState).not.toHaveBeenCalled()
  })

  it("409s when no review exists — approval is never a blind stamp", async () => {
    vi.mocked(getEpisodeReview).mockResolvedValue(null)
    const res = await POST(req(), params(EDITED))
    expect(res.status).toBe(409)
    expect(transitionState).not.toHaveBeenCalled()
  })

  it("409s when the state machine rejects the transition (illegal jump)", async () => {
    vi.mocked(transitionState).mockRejectedValue(
      new Error("studio project: illegal state transition \"raw_uploaded\" → \"reviewed\""),
    )
    const res = await POST(req(), params(EDITED))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/illegal state transition/)
  })
})
