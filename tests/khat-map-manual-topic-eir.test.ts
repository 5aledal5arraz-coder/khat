/**
 * A manual season topic gets its EIR at creation (2026-10-02).
 *
 * `addManualTopicAction` created + approved the candidate and recorded the
 * accept decision, but — unlike `recordCardDecision`'s accept — never called
 * `ensureEirForCandidate`. The season card then said «لم يتم ربطه بـ EIR بعد»
 * and offered no «تشغيل اكتشاف لهذه الحلقة».
 *
 * Also pins that the manual form no longer offers «جريئة» (controversial).
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, vi, beforeEach } from "vitest"

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
vi.mock("@/lib/eir", () => ({ transitionEpisodePhase: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { resetMock } from "./db-mock"
import { transitionEpisodePhase } from "@/lib/eir"
import {
  createEpisodeCandidate,
  getEpisodeCandidateById,
  getSeasonById,
  updateEpisodeCandidateStatus,
} from "@/lib/khat-map/core/queries"
import { recordDecision } from "@/lib/khat-map/learning/decisions"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { addManualTopicAction, removeManualTopicAction } from "@/app/admin/khat-brain/seasons/actions"
import { AddTopicModal } from "@/app/admin/khat-brain/seasons/[seasonId]/_components/add-topic-modal"

const SEASON = "season-1"
const created = { id: "topic-1", season_id: SEASON, status: "pending_review", eir_id: null } as never
const approved = { id: "topic-1", season_id: SEASON, status: "approved", eir_id: null } as never
const INPUT = { seasonId: SEASON, working_title: "موضوع يدوي", episode_type: "social" as const }

beforeEach(() => {
  vi.clearAllMocks()
  resetMock()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(getSeasonById).mockResolvedValue({ id: SEASON, v2_mode: "manual", wizard_stage: "topics" } as never)
  vi.mocked(createEpisodeCandidate).mockResolvedValue(created)
  vi.mocked(updateEpisodeCandidateStatus).mockResolvedValue(approved)
})

describe("addManualTopicAction — EIR at creation", () => {
  it("creates the EIR for the approved candidate, like an accepted card", async () => {
    vi.mocked(ensureEirForCandidate).mockResolvedValue({ eir: { id: "eir-1" }, created: true } as never)
    const r = await addManualTopicAction(INPUT)
    expect(r.success).toBe(true)
    expect(recordDecision).toHaveBeenCalled()
    expect(ensureEirForCandidate).toHaveBeenCalledWith({ candidate: approved, adminId: "admin-1" })
  })

  it("an EIR failure never fails the add (same non-fatal pattern as accept)", async () => {
    vi.mocked(ensureEirForCandidate).mockRejectedValue(new Error("bridge down"))
    const r = await addManualTopicAction(INPUT)
    expect(r).toEqual({ success: true, data: { topic: approved } })
  })

  it("nothing is created when the season is not manual/guided", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ id: SEASON, v2_mode: "open_ai", wizard_stage: "topics" } as never)
    const r = await addManualTopicAction(INPUT)
    expect(r.success).toBe(false)
    expect(ensureEirForCandidate).not.toHaveBeenCalled()
  })
})

describe("AddTopicModal — no «جريئة»", () => {
  it("does not offer controversial; still offers the other types", () => {
    const html = renderToStaticMarkup(
      createElement(AddTopicModal, { open: true, seasonId: SEASON, onClose: () => {}, onAdded: () => {} }),
    )
    expect(html).not.toContain('value="controversial"')
    expect(html).not.toContain("جريئة")
    expect(html).toContain('value="social"') // sight: the options did render
  })
})

describe("removeManualTopicAction — archives the topic's EIR", () => {
  it("rejects the topic and archives its EIR", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue({ id: "topic-1", season_id: SEASON, eir_id: "eir-1" } as never)
    const r = await removeManualTopicAction({ seasonId: SEASON, topicCandidateId: "topic-1" })
    expect(r).toEqual({ success: true, data: { ok: true } })
    expect(updateEpisodeCandidateStatus).toHaveBeenCalledWith("topic-1", "rejected", "حُذف يدوياً")
    expect(transitionEpisodePhase).toHaveBeenCalledWith(
      expect.objectContaining({ eir_id: "eir-1", to_phase: "archived", actor_id: "admin-1" }),
    )
  })

  it("a topic with no EIR (older rows) is removed without touching EIRs", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue({ id: "topic-1", season_id: SEASON, eir_id: null } as never)
    const r = await removeManualTopicAction({ seasonId: SEASON, topicCandidateId: "topic-1" })
    expect(r.success).toBe(true)
    expect(transitionEpisodePhase).not.toHaveBeenCalled()
  })

  it("an archive failure never fails the removal", async () => {
    vi.mocked(getEpisodeCandidateById).mockResolvedValue({ id: "topic-1", season_id: SEASON, eir_id: "eir-1" } as never)
    vi.mocked(transitionEpisodePhase).mockRejectedValue(new Error("invalid transition"))
    const r = await removeManualTopicAction({ seasonId: SEASON, topicCandidateId: "topic-1" })
    expect(r).toEqual({ success: true, data: { ok: true } })
  })
})
