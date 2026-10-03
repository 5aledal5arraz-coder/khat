/**
 * Topic-engine defect #8 — `addManualTopicAction` skipped every guard the
 * generated topics get (policy now WARNS with an explicit override, see below):
 *   - no constitution policy check (a hand-typed political topic went
 *     straight to «approved» and an EIR),
 *   - no dedup against the season's own topics,
 *   - `recordDecision` instead of the fingerprinting path, so a manual accept
 *     left no fingerprint.
 *
 * Policy semantics are the generators': a lexicon hit BLOCKS, with a clear
 * Arabic reason. The fingerprint is best-effort (one embedding) — its failure
 * never fails the add.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("../db-mock")
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
vi.mock("@/lib/khat-map/learning/fingerprints", () => ({ writeFingerprint: vi.fn() }))
vi.mock("@/lib/khat-map/conversion", () => ({ convertEpisodeToPreparation: vi.fn() }))
vi.mock("@/lib/khat-brain", () => ({
  ensureEirForCandidate: vi.fn(),
  walkEirToPhase: vi.fn(),
  syncEirEditorialFromCandidate: vi.fn(),
}))
vi.mock("@/lib/eir", () => ({ transitionEpisodePhase: vi.fn() }))

import { mockSelectResult, resetMock } from "../db-mock"
import {
  createEpisodeCandidate,
  getSeasonById,
  updateEpisodeCandidateStatus,
} from "@/lib/khat-map/core/queries"
import { recordDecision } from "@/lib/khat-map/learning/decisions"
import { writeFingerprint } from "@/lib/khat-map/learning/fingerprints"
import { addManualTopicAction } from "@/app/admin/khat-brain/seasons/actions"

const SEASON = "season-1"
const created = { id: "topic-1", season_id: SEASON, status: "proposed", eir_id: null, topic_domain: "relationships" } as never
const approved = { ...(created as object), status: "approved" } as never

beforeEach(() => {
  vi.clearAllMocks()
  resetMock()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(getSeasonById).mockResolvedValue({ id: SEASON, v2_mode: "guided", wizard_stage: "topics" } as never)
  vi.mocked(createEpisodeCandidate).mockResolvedValue(created)
  vi.mocked(updateEpisodeCandidateStatus).mockResolvedValue(approved)
  vi.mocked(recordDecision).mockResolvedValue({ id: "dec-1", season_id: SEASON, topic_candidate_id: "topic-1" } as never)
})

describe("addManualTopicAction — policy is a WARNING Khaled can override", () => {
  // Manual topics are Khaled's own choice: a lexicon hit warns with a clear
  // Arabic reason and needs an explicit «أضف رغم التحذير»; it never hard-blocks.
  it("warns (code POLICY_WARNING) and creates nothing without the confirm", async () => {
    mockSelectResult([]) // season titles
    const r = await addManualTopicAction({
      seasonId: SEASON,
      working_title: "كواليس انتخابات مجلس الامه",
      episode_type: "social",
    })
    expect(r.success).toBe(false)
    expect(!r.success && r.code).toBe("POLICY_WARNING")
    expect(!r.success && r.error).toMatch(/دستور خط/)
    expect(!r.success && r.error).toMatch(/سياسة/)
    expect(!r.success && r.error).toContain("أضف رغم التحذير")
    expect(createEpisodeCandidate).not.toHaveBeenCalled()
  })

  it.each([
    "رحلتي من الإلحاد إلى الإيمان",
    "فضيحة طبية غيّرت حياتي",
  ])("real example «%s»: warned first, then added with the confirm", async (title) => {
    mockSelectResult([])
    const first = await addManualTopicAction({ seasonId: SEASON, working_title: title, episode_type: "personal_story" })
    expect(!first.success && first.code).toBe("POLICY_WARNING")

    mockSelectResult([])
    const second = await addManualTopicAction({
      seasonId: SEASON,
      working_title: title,
      episode_type: "personal_story",
      confirmPolicyWarning: true,
    })
    expect(second.success).toBe(true)
    // the override is on the record
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ reason_text: expect.stringContaining("تحذير الدستور") }),
    )
  })

  it("a negated mention is not a hit (same lexicon semantics as the generators)", async () => {
    mockSelectResult([])
    const r = await addManualTopicAction({
      seasonId: SEASON,
      working_title: "رجل بنى حياته من جديد بعيدا عن السياسة",
      episode_type: "personal_story",
    })
    expect(r.success).toBe(true)
  })
})

describe("addManualTopicAction — dedup against the season", () => {
  it("refuses a near-duplicate of a live season topic and names it", async () => {
    mockSelectResult([{ working_title: "الأب الذي لم يقل أحبك لابنه قط", status: "approved" }])
    const r = await addManualTopicAction({
      seasonId: SEASON,
      working_title: "الأب الذي لم يقل لابنه أحبك قط",
      episode_type: "personal_story",
    })
    expect(r.success).toBe(false)
    expect(!r.success && r.error).toContain("الأب الذي لم يقل أحبك لابنه قط")
    expect(createEpisodeCandidate).not.toHaveBeenCalled()
  })

  it("a REJECTED season topic does not block re-adding it", async () => {
    mockSelectResult([{ working_title: "الأب الذي لم يقل أحبك لابنه قط", status: "rejected" }])
    const r = await addManualTopicAction({
      seasonId: SEASON,
      working_title: "الأب الذي لم يقل أحبك لابنه قط",
      episode_type: "personal_story",
    })
    expect(r.success).toBe(true)
  })
})

describe("addManualTopicAction — fingerprint", () => {
  it("records an accepted fingerprint tied to the decision", async () => {
    mockSelectResult([])
    await addManualTopicAction({ seasonId: SEASON, working_title: "رحلة غوص أخيرة", episode_type: "personal_story", hook: "خطاف" })
    expect(writeFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({
        season_id: SEASON,
        source: "accepted",
        title_ar: "رحلة غوص أخيرة",
        topic_candidate_id: "topic-1",
        decision_id: "dec-1",
      }),
    )
  })

  it("a fingerprint failure never fails the add", async () => {
    mockSelectResult([])
    vi.mocked(writeFingerprint).mockRejectedValue(new Error("embeddings down"))
    const r = await addManualTopicAction({ seasonId: SEASON, working_title: "رحلة غوص أخيرة", episode_type: "personal_story" })
    expect(r.success).toBe(true)
  })
})
