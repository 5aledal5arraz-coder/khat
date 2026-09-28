/**
 * A candidate nominated for an episode («رشّحه لهالحلقة») is linked to a
 * canonical guest → that guest is assigned to the episode — never over a
 * DIFFERENT guest already on it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ eir: null as null | Record<string, unknown> }))

vi.mock("@/lib/eir", () => ({
  getEpisodeIntelligenceRecord: vi.fn(async () => h.eir),
  setEpisodeIntelligenceGuest: vi.fn(async () => ({})),
}))
vi.mock("@/lib/khat-brain", () => ({ walkEirToPhase: vi.fn(async () => ({})) }))
vi.mock("@/lib/discovery", () => ({
  bridgeDiscoveryToKhatMap: vi.fn(async () => ({
    ok: true, khat_guest_candidate_id: "k1", khat_guest_candidate_created: true, khat_episode_candidate_id: null, attached_to_episode: false,
  })),
}))

import { setEpisodeIntelligenceGuest } from "@/lib/eir"
import { walkEirToPhase } from "@/lib/khat-brain"
import { assignNominatedGuestToEir } from "@/lib/eir/attach-guest"

beforeEach(() => {
  vi.clearAllMocks()
  h.eir = { id: "e1", phase: "guest_discovery", season_id: "s1", guest_id: null }
})

describe("assignNominatedGuestToEir", () => {
  it("an EIR with no guest → assigned, walked to guest_assigned, bridged", async () => {
    const r = await assignNominatedGuestToEir({ eirId: "e1", guestId: "g1", actorId: "u1" })
    expect(r.status).toBe("assigned")
    expect(setEpisodeIntelligenceGuest).toHaveBeenCalledWith({ eir_id: "e1", guest_id: "g1" })
    expect(walkEirToPhase).toHaveBeenCalledWith(expect.objectContaining({ eirId: "e1", toPhase: "guest_assigned" }))
  })
  it("a DIFFERENT guest already on the EIR is never overwritten", async () => {
    h.eir = { ...h.eir, guest_id: "other" }
    const r = await assignNominatedGuestToEir({ eirId: "e1", guestId: "g1", actorId: "u1" })
    expect(r.status).toBe("eir_has_other_guest")
    expect(setEpisodeIntelligenceGuest).not.toHaveBeenCalled()
  })
  it("the same guest → nothing to do; a missing EIR → reported", async () => {
    h.eir = { ...h.eir, guest_id: "g1" }
    expect((await assignNominatedGuestToEir({ eirId: "e1", guestId: "g1", actorId: "u1" })).status).toBe("already_assigned")
    h.eir = null
    expect((await assignNominatedGuestToEir({ eirId: "e1", guestId: "g1", actorId: "u1" })).status).toBe("eir_missing")
    expect(setEpisodeIntelligenceGuest).not.toHaveBeenCalled()
  })
})
