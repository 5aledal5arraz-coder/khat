/**
 * Season Phase B launches discovery without asking — and now defaults to men
 * from Kuwait (Khaled, 2026-09-28) when the season names no gender. A season
 * that DOES name one, and an explicit launcher pick, still win.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ started: [] as Record<string, unknown>[] }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("./db-mock")
  return { db: mockDb }
})
vi.mock("@/lib/api-utils", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "ADMIN" })),
  requireActionRole: vi.fn(async () => ({ ok: true as const, user: { id: "admin-1" } })),
  getAdminAuthUser: vi.fn(async () => ({ id: "admin-1" })),
}))
vi.mock("@/lib/khat-map/core/queries", () => ({
  getSeasonById: vi.fn(),
  createSeason: vi.fn(),
  patchSeasonControls: vi.fn(),
  createEpisodeCandidate: vi.fn(),
  getEpisodeCandidateById: vi.fn(),
  updateEpisodeCandidateStatus: vi.fn(),
}))
vi.mock("@/lib/khat-map/v2", () => ({
  generateBatch: vi.fn(),
  generateGuestFirstCards: vi.fn(),
  recordDecisionAndFingerprint: vi.fn(),
  undoDecisionAndFingerprint: vi.fn(),
}))
vi.mock("@/lib/khat-map/learning/decisions", () => ({ recordDecision: vi.fn() }))
vi.mock("@/lib/khat-map/conversion", () => ({ convertEpisodeToPreparation: vi.fn() }))
vi.mock("@/lib/khat-brain", () => ({
  ensureEirForCandidate: vi.fn(),
  walkEirToPhase: vi.fn(),
  syncEirEditorialFromCandidate: vi.fn(),
}))
vi.mock("@/lib/eir", () => ({ getEpisodeIntelligenceRecord: vi.fn(), setEpisodeIntelligenceGuest: vi.fn() }))
vi.mock("@/lib/discovery", () => ({ bridgeDiscoveryToKhatMap: vi.fn() }))
vi.mock("@/lib/collaboration/rooms", () => ({ createRoom: vi.fn() }))
vi.mock("@/lib/studio/push-to-episode", () => ({ runStudioPushToEpisode: vi.fn() }))
vi.mock("@/lib/studio/website-packages", () => ({ getWebsitePackageForSession: vi.fn(), updateWebsitePackage: vi.fn() }))
vi.mock("@/app/admin/discovery-v2/actions", () => ({
  startV2DiscoveryAction: vi.fn(async (input: Record<string, unknown>) => {
    h.started.push(input)
    return { success: true, runId: "run-1" }
  }),
}))

import { mockSelectResult, resetMock } from "./db-mock"
import { getSeasonById } from "@/lib/khat-map/core/queries"
import { startGuestDiscoveryForEpisodeAction } from "@/app/admin/khat-brain/seasons/actions"

const season = (gender: string) =>
  ({ id: "s1", name: "الموسم 2", wizard_stage: "guests", editorial_controls: { guest_filters: { gender, nationality: "any" } } }) as never

beforeEach(() => {
  vi.clearAllMocks()
  resetMock()
  h.started = []
  // the episode candidate row
  mockSelectResult([{ working_title: "حلقة", topic_domain: "money_career", hook: null, why_matters: null }])
})

describe("Phase B discovery — gender default", () => {
  it("a season with no gender filter («الكل») → men", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(season("all"))
    await startGuestDiscoveryForEpisodeAction({ seasonId: "s1", episodeCandidateId: "c1" })
    expect(h.started[0].gender).toBe("male")
    // geography absent → the engine's Kuwait-only default
    expect(h.started[0].geography).toBeNull()
  })

  it("a season that names a gender, and an explicit pick, still win", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(season("female"))
    await startGuestDiscoveryForEpisodeAction({ seasonId: "s1", episodeCandidateId: "c1" })
    expect(h.started[0].gender).toBe("female")
    mockSelectResult([{ working_title: "حلقة", topic_domain: null, hook: null, why_matters: null }])
    await startGuestDiscoveryForEpisodeAction({ seasonId: "s1", episodeCandidateId: "c1", gender: null })
    expect(h.started[1].gender).toBeNull() // «أيّ» is an explicit choice
  })
})
