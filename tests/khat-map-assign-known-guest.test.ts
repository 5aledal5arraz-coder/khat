/**
 * Season workspace — a topic with a KNOWN guest must be able to reach
 * preparation without Phase-B discovery.
 *
 * The gap (found by the first real pilot episode): a manual topic is
 * approved with no EIR, the EIR page's assign-guest needs an EIR, and
 * discovery excludes guests we already know — so conversion failed with
 * `missing_linked_guest` and no UI path could fix it.
 *
 * `assignKnownGuestToTopicAction` composes the existing primitives:
 * ensureEirForCandidate → assignEirGuestAction (set guest, walk to
 * guest_assigned, bridge into Khat Map). The REAL assignEirGuestAction
 * runs here; only its leaf dependencies are mocked, so the test sees the
 * actual guest/walk/bridge calls the season action produces.
 *
 * Also covers:
 *   - editEpisodeAction re-syncing the EIR after an edit
 *   - convertV2CardToPreparationAction: a single approved topic converts
 *     on its own — no season-completeness requirement.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("./db-mock")
  return { db: mockDb }
})

vi.mock("@/lib/api-utils", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "ADMIN" })),
  requireActionRole: vi.fn(async () => ({
    ok: true as const,
    user: { id: "admin-1" },
  })),
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
vi.mock("@/lib/khat-map/conversion", () => ({
  convertEpisodeToPreparation: vi.fn(),
}))

vi.mock("@/lib/khat-brain", () => ({
  ensureEirForCandidate: vi.fn(),
  walkEirToPhase: vi.fn(),
  syncEirEditorialFromCandidate: vi.fn(),
}))
vi.mock("@/lib/eir", () => ({
  getEpisodeIntelligenceRecord: vi.fn(),
  setEpisodeIntelligenceGuest: vi.fn(),
}))
vi.mock("@/lib/discovery", () => ({ bridgeDiscoveryToKhatMap: vi.fn() }))

// Leaf modules of the episode-workspace actions file that this path never uses.
vi.mock("@/lib/collaboration/rooms", () => ({ createRoom: vi.fn() }))
vi.mock("@/lib/studio/push-to-episode", () => ({ runStudioPushToEpisode: vi.fn() }))
vi.mock("@/lib/studio/website-packages", () => ({
  getWebsitePackageForSession: vi.fn(),
  updateWebsitePackage: vi.fn(),
}))

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
import { requireActionRole } from "@/lib/api-utils"
import { getEpisodeCandidateById, getSeasonById } from "@/lib/khat-map/core/queries"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion"
import {
  ensureEirForCandidate,
  walkEirToPhase,
  syncEirEditorialFromCandidate,
} from "@/lib/khat-brain"
import { getEpisodeIntelligenceRecord, setEpisodeIntelligenceGuest } from "@/lib/eir"
import { bridgeDiscoveryToKhatMap } from "@/lib/discovery"
import {
  assignKnownGuestToTopicAction,
  convertV2CardToPreparationAction,
  editEpisodeAction,
} from "@/app/admin/khat-brain/seasons/actions"

const SEASON = "season-1"
const TOPIC = "topic-1"
const GUEST = "guest-1"
const EIR = "eir-1"

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: TOPIC,
    season_id: SEASON,
    status: "approved",
    working_title: "حلقة تجريبية",
    goal: "هدف معدّل قبل التعيين",
    eir_id: null,
    suggested_guest_candidate_id: null,
    ...over,
  } as never
}

function eirAt(phase: string) {
  return { id: EIR, phase, season_id: SEASON, guest_id: null } as never
}

const ATTACHED = {
  ok: true,
  khat_guest_candidate_id: "kgc-1",
  khat_guest_candidate_created: true,
  khat_episode_candidate_id: TOPIC,
  attached_to_episode: true,
}

const INPUT = { seasonId: SEASON, topicCandidateId: TOPIC, guestId: GUEST }

beforeEach(() => {
  vi.clearAllMocks()
  resetMock()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(requireActionRole).mockResolvedValue({
    ok: true,
    user: { id: "admin-1" },
  } as never)
})

/** Queue the `guests` existence check inside assignEirGuestAction. */
function guestExists() {
  mockSelectResult([{ id: GUEST }])
}

describe("assignKnownGuestToTopicAction — role gate", () => {
  it("refuses below EDITOR and touches nothing", async () => {
    vi.mocked(requireActionRole).mockResolvedValue({
      ok: false,
      error: "صلاحية غير كافية",
    } as never)

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r).toEqual({ success: false, error: "صلاحية غير كافية" })
    expect(requireActionRole).toHaveBeenCalledWith("EDITOR")
    expect(getEpisodeCandidateById).not.toHaveBeenCalled()
    expect(ensureEirForCandidate).not.toHaveBeenCalled()
    expect(setEpisodeIntelligenceGuest).not.toHaveBeenCalled()
  })
})

describe("assignKnownGuestToTopicAction — manual topic with no EIR", () => {
  it("creates the EIR, sets the guest, walks to guest_assigned, and bridges", async () => {
    const c = candidate()
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(c)
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: eirAt("guest_discovery"), created: true })
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(eirAt("guest_discovery"))
    guestExists()
    vi.mocked(bridgeDiscoveryToKhatMap).mockResolvedValue(ATTACHED as never)

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r).toEqual({ success: true, data: { eirId: EIR, eirCreated: true } })
    // The candidate passed in is the freshly loaded one — so a goal edited
    // before assignment is what the new EIR copies.
    expect(ensureEirForCandidate).toHaveBeenCalledWith({ candidate: c, adminId: "admin-1" })
    expect(setEpisodeIntelligenceGuest).toHaveBeenCalledWith({ eir_id: EIR, guest_id: GUEST })
    expect(walkEirToPhase).toHaveBeenCalledWith(
      expect.objectContaining({ eirId: EIR, toPhase: "guest_assigned", actorId: "admin-1" }),
    )
    expect(bridgeDiscoveryToKhatMap).toHaveBeenCalledWith({
      globalGuestId: GUEST,
      eirId: EIR,
      seasonId: SEASON,
    })
    // No stale link to clear on a fresh topic.
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("does not walk an EIR that is already past guest_discovery", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(candidate({ eir_id: EIR }))
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: eirAt("approved"), created: false })
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(eirAt("approved"))
    guestExists()
    vi.mocked(bridgeDiscoveryToKhatMap).mockResolvedValue(ATTACHED as never)

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r.success).toBe(true)
    expect(walkEirToPhase).not.toHaveBeenCalled()
  })
})

describe("assignKnownGuestToTopicAction — idempotency", () => {
  it("re-assigning the SAME guest reuses the EIR and clears nothing", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(
      candidate({ eir_id: EIR, suggested_guest_candidate_id: "kgc-1" }),
    )
    // loadGuest(kgc-1) → already linked to the same canonical guest.
    mockSelectResult([{ id: "kgc-1", linked_guest_id: GUEST }])
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: eirAt("guest_assigned"), created: false })
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(eirAt("guest_assigned"))
    guestExists()
    vi.mocked(bridgeDiscoveryToKhatMap).mockResolvedValue({
      ...ATTACHED,
      khat_guest_candidate_created: false,
    } as never)

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r).toEqual({ success: true, data: { eirId: EIR, eirCreated: false } })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(walkEirToPhase).not.toHaveBeenCalled()
  })

  it("replacing a DIFFERENT guest clears the stale topic link before bridging", async () => {
    const c = candidate({ eir_id: EIR, suggested_guest_candidate_id: "kgc-old" })
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(c)
    mockSelectResult([{ id: "kgc-old", linked_guest_id: "someone-else" }])
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: eirAt("guest_assigned"), created: false })
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(eirAt("guest_assigned"))
    guestExists()
    vi.mocked(bridgeDiscoveryToKhatMap).mockResolvedValue(ATTACHED as never)

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r.success).toBe(true)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const set = vi.mocked(mockDb.update).mock.results[0].value.set
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ suggested_guest_candidate_id: null }),
    )
    // Cleared BEFORE the bridge ran — otherwise the bridge refuses to attach.
    expect(vi.mocked(mockDb.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bridgeDiscoveryToKhatMap).mock.invocationCallOrder[0],
    )
  })
})

describe("assignKnownGuestToTopicAction — refusals", () => {
  it("reports failure when the bridge did not attach (conversion would stay blocked)", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(candidate())
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: eirAt("idea"), created: true })
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(eirAt("idea"))
    guestExists()
    vi.mocked(bridgeDiscoveryToKhatMap).mockResolvedValue({
      ...ATTACHED,
      attached_to_episode: false,
    } as never)

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r.success).toBe(false)
  })

  it("refuses an unknown guest id without touching the EIR guest", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(candidate())
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: eirAt("idea"), created: true })
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(eirAt("idea"))
    mockSelectResult([]) // guests lookup → none

    const r = await assignKnownGuestToTopicAction(INPUT)

    expect(r).toEqual({ success: false, error: "الضيف المختار غير موجود." })
    expect(setEpisodeIntelligenceGuest).not.toHaveBeenCalled()
    expect(bridgeDiscoveryToKhatMap).not.toHaveBeenCalled()
  })

  it("refuses a topic from another season", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(candidate({ season_id: "other" }))
    const r = await assignKnownGuestToTopicAction(INPUT)
    expect(r.success).toBe(false)
    expect(ensureEirForCandidate).not.toHaveBeenCalled()
  })

  it("refuses a topic that is not approved (or already converted)", async () => {
    for (const status of ["proposed", "converted_to_preparation"]) {
      vi.mocked(getEpisodeCandidateById).mockResolvedValue(candidate({ status }))
      const r = await assignKnownGuestToTopicAction(INPUT)
      expect(r.success).toBe(false)
    }
    expect(ensureEirForCandidate).not.toHaveBeenCalled()
  })

  it("a thrown error becomes a Result, never a rejected action", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(candidate())
    vi.mocked(ensureEirForCandidate).mockRejectedValue(new Error("pool timeout"))
    const r = await assignKnownGuestToTopicAction(INPUT)
    expect(r).toEqual({ success: false, error: "pool timeout" })
  })
})

describe("editEpisodeAction — edits reach an existing EIR", () => {
  it("re-syncs the EIR from the freshly saved candidate", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ wizard_stage: "topics" } as never)
    const saved = candidate({ eir_id: EIR, goal: "هدف جديد" })
    vi.mocked(getEpisodeCandidateById).mockResolvedValue(saved)

    const r = await editEpisodeAction({
      seasonId: SEASON,
      topicCandidateId: TOPIC,
      patch: { goal: "هدف جديد" },
    })

    expect(r.success).toBe(true)
    expect(syncEirEditorialFromCandidate).toHaveBeenCalledWith(saved)
    // The sync reads AFTER the write, so it sees the new goal.
    expect(vi.mocked(mockDb.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getEpisodeCandidateById).mock.invocationCallOrder[0],
    )
  })
})

describe("convertV2CardToPreparationAction — single topic, no season gate", () => {
  const CONVERT = { seasonId: SEASON, topicCandidateId: TOPIC }

  it("converts one approved topic without consulting season completeness", async () => {
    mockSelectResult([{ id: TOPIC, status: "approved" }]) // loadTopic
    vi.mocked(convertEpisodeToPreparation).mockResolvedValue({
      ok: true,
      created: true,
      was_existing: false,
      link: {
        kind: "episode_to_preparation",
        target_id: "prep-1",
        href: "/admin/preparation/prep-1",
        label: "إعداد مرتبط",
        converted_at: "2026-09-26T00:00:00.000Z",
      },
    } as never)

    const r = await convertV2CardToPreparationAction(CONVERT)

    expect(r).toEqual({
      success: true,
      data: {
        preparation_id: "prep-1",
        href: "/admin/preparation/prep-1",
        was_existing: false,
        converted_at: "2026-09-26T00:00:00.000Z",
        warning: undefined,
        // The mocked conversion scheduled no prep_v2 job.
        job: null,
      },
    })
    expect(convertEpisodeToPreparation).toHaveBeenCalledWith({
      episode_candidate_id: TOPIC,
      admin_id: "admin-1",
    })
    expect(getSeasonById).not.toHaveBeenCalled()
  })

  it("maps a missing guest to MISSING_GUEST", async () => {
    mockSelectResult([{ id: TOPIC, status: "approved" }])
    vi.mocked(convertEpisodeToPreparation).mockResolvedValue({
      ok: false,
      reason: "missing_linked_guest",
      message: "اختر ضيفًا",
    } as never)
    const r = await convertV2CardToPreparationAction(CONVERT)
    expect(r).toMatchObject({ success: false, code: "MISSING_GUEST" })
  })

  it("refuses a topic that is not approved", async () => {
    mockSelectResult([{ id: TOPIC, status: "proposed" }])
    const r = await convertV2CardToPreparationAction(CONVERT)
    expect(r).toMatchObject({ success: false, code: "CANDIDATE_NOT_APPROVED" })
    expect(convertEpisodeToPreparation).not.toHaveBeenCalled()
  })

  it("is EDITOR-gated", async () => {
    vi.mocked(requireActionRole).mockResolvedValue({ ok: false, error: "x" } as never)
    const r = await convertV2CardToPreparationAction(CONVERT)
    expect(r).toMatchObject({ success: false, code: "UNAUTHORIZED" })
    expect(convertEpisodeToPreparation).not.toHaveBeenCalled()
  })
})
