/**
 * Studio 3-phase journey, Step 4 — the project-journey hydration endpoint.
 *
 * GET returns the project (or a null journey) + the two phase timestamps the
 * stepper shows. Auth + the journey assembler are mocked — no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api-utils", () => ({ requireAdminAPI: vi.fn(async () => null) }))
vi.mock("@/lib/studio", () => ({ getProjectJourneyForSession: vi.fn() }))

import { getProjectJourneyForSession } from "@/lib/studio"
import { GET } from "@/app/api/admin/studio/[id]/project/route"

const ID = "22222222-2222-2222-2222-222222222222"
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request(`http://localhost/api/admin/studio/${ID}/project`)

beforeEach(() => vi.clearAllMocks())

describe("GET /project", () => {
  it("returns the project journey (project + phase timestamps)", async () => {
    vi.mocked(getProjectJourneyForSession).mockResolvedValue({
      project: { id: "proj-1", state: "mapped" } as never,
      mappedAt: "2026-07-22T10:00:00.000Z",
      reviewedAt: null,
    })
    const res = await GET(req(), params(ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.state).toBe("mapped")
    expect(body.mappedAt).toBe("2026-07-22T10:00:00.000Z")
    expect(body.reviewedAt).toBeNull()
    expect(getProjectJourneyForSession).toHaveBeenCalledWith(ID)
  })

  it("returns a null journey for non-project sessions", async () => {
    vi.mocked(getProjectJourneyForSession).mockResolvedValue({
      project: null,
      mappedAt: null,
      reviewedAt: null,
    })
    const res = await GET(req(), params(ID))
    const body = await res.json()
    expect(body.project).toBeNull()
  })
})
