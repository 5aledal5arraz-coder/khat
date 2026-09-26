/**
 * `editorial_intent` is copied from the Khat Map candidate when the EIR is
 * created. The preparation pipeline reads the EIR's intent, so:
 *   - an edit made BEFORE the EIR exists must be carried at creation, and
 *   - an edit made AFTER must be re-synced — without clobbering provenance
 *     (source, source_id, primary_theme, main_axes…).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("../db-mock")
  return { db: mockDb }
})
vi.mock("@/lib/eir", () => ({
  createEpisodeIntelligenceRecord: vi.fn(async (input: Record<string, unknown>) => ({
    id: "eir-new",
    ...input,
  })),
  getEpisodeIntelligenceRecord: vi.fn(),
  patchEpisodeIntelligenceEditorial: vi.fn(async () => ({ id: "eir-1" })),
  transitionEpisodePhase: vi.fn(),
}))

import { resetMock } from "../db-mock"
import {
  createEpisodeIntelligenceRecord,
  getEpisodeIntelligenceRecord,
  patchEpisodeIntelligenceEditorial,
} from "@/lib/eir"
import {
  ensureEirForCandidate,
  syncEirEditorialFromCandidate,
} from "@/lib/khat-brain/v2-bridge"

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: "topic-1",
    season_id: "season-1",
    working_title: "عنوان",
    topic_domain: null,
    episode_type: "story",
    topic_angle_code: null,
    risk_level: null,
    effort_level: null,
    hook: "hook",
    why_matters: null,
    why_now: null,
    goal: "الهدف المعدّل",
    description: "وصف",
    main_axes: ["a"],
    suggested_questions: [],
    production_notes: null,
    eir_id: null,
    suggested_guest_candidate_id: null,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMock()
})

describe("ensureEirForCandidate — edits before the EIR exists", () => {
  it("copies the candidate's current goal/description into the new EIR", async () => {
    await ensureEirForCandidate({ candidate: candidate(), adminId: "admin-1" })

    expect(createEpisodeIntelligenceRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "guest_discovery",
        created_by: "admin-1",
        editorial_intent: expect.objectContaining({
          goal: "الهدف المعدّل",
          description: "وصف",
          main_axes: ["a"],
          source: "khat_map_candidate",
          source_id: "topic-1",
        }),
      }),
    )
  })
})

describe("syncEirEditorialFromCandidate — edits after the EIR exists", () => {
  it("patches only the editable fields + title onto the linked EIR", async () => {
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue({ id: "eir-1" } as never)

    await syncEirEditorialFromCandidate(
      candidate({ eir_id: "eir-1", goal: "هدف بعد التعيين", working_title: "عنوان جديد" }),
    )

    expect(patchEpisodeIntelligenceEditorial).toHaveBeenCalledWith({
      eir_id: "eir-1",
      working_title: "عنوان جديد",
      intent_patch: {
        hook: "hook",
        why_matters: null,
        why_now: null,
        goal: "هدف بعد التعيين",
        description: "وصف",
      },
    })
    // Provenance keys are NOT in the patch, so the merge keeps them.
    const patch = vi.mocked(patchEpisodeIntelligenceEditorial).mock.calls[0][0].intent_patch
    expect(patch).not.toHaveProperty("source_id")
    expect(patch).not.toHaveProperty("main_axes")
  })

  it("is a no-op when the topic has no EIR yet", async () => {
    const r = await syncEirEditorialFromCandidate(candidate())
    expect(r).toBeNull()
    expect(patchEpisodeIntelligenceEditorial).not.toHaveBeenCalled()
  })

  it("is a no-op when the linked EIR no longer exists", async () => {
    vi.mocked(getEpisodeIntelligenceRecord).mockResolvedValue(null)
    const r = await syncEirEditorialFromCandidate(candidate({ eir_id: "gone" }))
    expect(r).toBeNull()
    expect(patchEpisodeIntelligenceEditorial).not.toHaveBeenCalled()
  })
})
