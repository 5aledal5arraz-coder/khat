/**
 * Studio 3-phase journey, Step 4 — the read-side journey assembler.
 * Resolves a session's project (edited cut first, then raw) and attaches the
 * two phase timestamps from the analysis records. Collaborators mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/studio/projects", () => ({
  getProjectByEditedSession: vi.fn(),
  getProjectByRawSession: vi.fn(),
}))
vi.mock("@/lib/studio/analysis-records", () => ({
  getStudioAnalysisRecord: vi.fn(),
}))

import {
  getProjectByEditedSession,
  getProjectByRawSession,
} from "@/lib/studio/projects"
import { getStudioAnalysisRecord } from "@/lib/studio/analysis-records"
import { getProjectJourneyForSession } from "@/lib/studio/project-journey"

const RAW = "11111111-1111-1111-1111-111111111111"
const EDITED = "22222222-2222-2222-2222-222222222222"

const project = {
  id: "proj-1",
  state: "mapped",
  raw_session_id: RAW,
  edited_session_id: EDITED,
} as never

beforeEach(() => vi.clearAllMocks())

describe("getProjectJourneyForSession", () => {
  it("returns an all-null journey when no project is linked", async () => {
    vi.mocked(getProjectByEditedSession).mockResolvedValue(null)
    vi.mocked(getProjectByRawSession).mockResolvedValue(null)
    const j = await getProjectJourneyForSession("ghost")
    expect(j).toEqual({ project: null, mappedAt: null, reviewedAt: null })
    expect(getStudioAnalysisRecord).not.toHaveBeenCalled()
  })

  it("resolves the edited cut first and attaches both phase timestamps", async () => {
    vi.mocked(getProjectByEditedSession).mockResolvedValue(project)
    vi.mocked(getStudioAnalysisRecord).mockImplementation(async (id: string, kind: string) => {
      if (kind === "transcript") return { generated_at: "2026-07-22T10:00:00.000Z" } as never
      if (kind === "phase2_review") return { generated_at: "2026-07-22T12:00:00.000Z" } as never
      return null
    })

    const j = await getProjectJourneyForSession(EDITED)
    expect(j.project?.id).toBe("proj-1")
    expect(j.mappedAt).toBe("2026-07-22T10:00:00.000Z")
    expect(j.reviewedAt).toBe("2026-07-22T12:00:00.000Z")
    // Never fell back to the raw lookup — the edited cut resolved first.
    expect(getProjectByRawSession).not.toHaveBeenCalled()
  })

  it("falls back to the raw session lookup, timestamps null when records absent", async () => {
    vi.mocked(getProjectByEditedSession).mockResolvedValue(null)
    vi.mocked(getProjectByRawSession).mockResolvedValue(project)
    vi.mocked(getStudioAnalysisRecord).mockResolvedValue(null)

    const j = await getProjectJourneyForSession(RAW)
    expect(j.project?.id).toBe("proj-1")
    expect(j.mappedAt).toBeNull()
    expect(j.reviewedAt).toBeNull()
  })
})
