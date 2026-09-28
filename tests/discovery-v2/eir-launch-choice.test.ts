/**
 * The EIR «تشغيل اكتشاف لهذه الحلقة» CTA used to launch at once — no guest
 * gender asked, no geography — so a run for a season without a strict
 * filter searched "any gender" (2026-09-28, episode 93c83176). The CTA now
 * asks; these tests pin that the pick reaches the run on BOTH server paths,
 * beats the season default, and that the topic carries the Arabic domain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  eir: null as null | Record<string, unknown>,
  season: null as null | Record<string, unknown>,
  started: [] as Record<string, unknown>[],
  phaseB: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/studio/push-to-episode", () => ({ runStudioPushToEpisode: vi.fn() }))
vi.mock("@/lib/studio/website-packages", () => ({
  getWebsitePackageForSession: vi.fn(),
  updateWebsitePackage: vi.fn(),
}))
vi.mock("@/lib/collaboration/rooms", () => ({ createRoom: vi.fn() }))
vi.mock("@/lib/api-utils", () => ({
  requireActionRole: vi.fn(async () => ({ ok: true, user: { id: "u1" } })),
}))
vi.mock("@/lib/eir", () => ({
  getEpisodeIntelligenceRecord: vi.fn(async () => h.eir),
  setEpisodeIntelligenceGuest: vi.fn(),
}))
vi.mock("@/lib/khat-map/core/queries", () => ({
  getSeasonById: vi.fn(async () => h.season),
}))
vi.mock("@/app/admin/discovery-v2/actions", () => ({
  startV2DiscoveryAction: vi.fn(async (input: Record<string, unknown>) => {
    h.started.push(input)
    return { success: true, runId: "run-new" }
  }),
}))
vi.mock("@/app/admin/khat-brain/seasons/actions", () => ({
  startGuestDiscoveryForEpisodeAction: vi.fn(async (input: Record<string, unknown>) => {
    h.phaseB.push(input)
    return { success: true, data: { runId: "run-b" } }
  }),
}))

import { startGuestDiscoveryForEirAction } from "@/app/admin/khat-brain/episodes/[eirId]/actions"

beforeEach(() => {
  h.started = []
  h.phaseB = []
  h.eir = {
    id: "eir-1",
    working_title: "المال يتذكّر ما نسيته العائلة",
    final_title: null,
    topic_domain: "money_career",
    season_id: "s1",
    editorial_intent: {},
  }
  h.season = { id: "s1", editorial_controls: { guest_filters: { gender: "male" } } }
})

describe("EIR discovery launch — the operator's pick reaches the run", () => {
  it("standalone EIR: gender + geography from the CTA beat the season filter", async () => {
    const r = await startGuestDiscoveryForEirAction("eir-1", { gender: "female", geography: ["kuwait", "saudi"] })
    expect(r).toEqual({ success: true, runId: "run-new" })
    expect(h.started[0]).toMatchObject({ gender: "female", geography: ["kuwait", "saudi"] })
  })

  it("«أيّ» (null) is an explicit choice — it does NOT fall back to the season's male filter", async () => {
    await startGuestDiscoveryForEirAction("eir-1", { gender: null, geography: ["kuwait"] })
    expect(h.started[0].gender).toBeNull()
  })

  it("sight: without a choice (older callers) the season filter still applies", async () => {
    await startGuestDiscoveryForEirAction("eir-1")
    expect(h.started[0]).toMatchObject({ gender: "male", geography: null })
  })

  it("the topic carries the Arabic domain label, never the enum key", async () => {
    await startGuestDiscoveryForEirAction("eir-1", { gender: "male", geography: ["kuwait"] })
    expect(h.started[0].topic).toBe("المال يتذكّر ما نسيته العائلة — مال ومسار")
  })

  it("a Khat Map EIR forwards the pick to the season Phase-B path", async () => {
    h.eir = { ...h.eir, editorial_intent: { source: "khat_map_candidate", source_id: "cand-1" } }
    const r = await startGuestDiscoveryForEirAction("eir-1", { gender: "female", geography: ["gulf"] })
    expect(r).toEqual({ success: true, runId: "run-b" })
    expect(h.phaseB[0]).toMatchObject({
      seasonId: "s1",
      episodeCandidateId: "cand-1",
      bypassStageGate: true,
      gender: "female",
      geography: ["gulf"],
    })
  })
})
