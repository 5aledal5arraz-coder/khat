/**
 * A run tagged with an EIR is listed on (and nominates into) that EIR — the
 * id must point at a real record. Unknown id → refused, nothing created.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ eir: null as null | Record<string, unknown>, created: [] as unknown[] }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api-utils", () => ({ requireActionRole: vi.fn(async () => ({ ok: true, user: { id: "u1" } })) }))
vi.mock("@/lib/eir", () => ({ getEpisodeIntelligenceRecord: vi.fn(async () => h.eir) }))
vi.mock("@/lib/discovery/runs", () => ({
  createDiscoveryRun: vi.fn(async (x: unknown) => {
    h.created.push(x)
    return { id: "run-1" }
  }),
  getDiscoveryRun: vi.fn(),
}))
vi.mock("@/lib/discovery/candidates", () => ({ getCandidate: vi.fn(), setCandidateStatus: vi.fn() }))
vi.mock("@/lib/guest-candidates/from-discovery", () => ({ upsertCrmCandidateFromDiscovery: vi.fn() }))
vi.mock("@/lib/jobs", () => ({ enqueueJob: vi.fn() }))

import { startV2DiscoveryAction } from "@/app/admin/discovery-v2/actions"

beforeEach(() => {
  h.created = []
  h.eir = { id: "eir-1" }
})

describe("startV2DiscoveryAction — eirId", () => {
  it("an unknown EIR is refused and no run is created", async () => {
    h.eir = null
    const r = await startV2DiscoveryAction({ topic: "t", eirId: "nope" })
    expect(r).toEqual({ success: false, error: "الحلقة غير موجودة" })
    expect(h.created).toHaveLength(0)
  })
  it("sight: a real EIR is stored in source_config", async () => {
    const r = await startV2DiscoveryAction({ topic: "t", eirId: "eir-1" })
    expect(r.success).toBe(true)
    expect((h.created[0] as { source_config: { eirId: string } }).source_config.eirId).toBe("eir-1")
  })
})
