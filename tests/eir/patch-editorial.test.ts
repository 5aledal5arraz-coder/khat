/**
 * patchEpisodeIntelligenceEditorial merges INTO editorial_intent — the
 * provenance keys written at creation (source, source_id, primary_theme,
 * main_axes) must survive a topic edit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("../db-mock")
  return { db: mockDb }
})
vi.mock("@/lib/system-events/emit", () => ({ emitSystemEvent: vi.fn() }))

import { mockDb, mockSelectResult, resetMock } from "../db-mock"
import { patchEpisodeIntelligenceEditorial } from "@/lib/eir"

function row(intent: Record<string, unknown>) {
  const now = new Date("2026-09-26T00:00:00Z")
  return {
    id: "eir-1",
    phase: "guest_assigned",
    season_id: "season-1",
    working_title: "قديم",
    final_title: null,
    topic_domain: null,
    episode_type: null,
    topic_angle_code: null,
    guest_id: "guest-1",
    editorial_intent: intent,
    risk_level: null,
    effort_level: null,
    recording_scheduled_at: null,
    created_by: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMock()
})

describe("patchEpisodeIntelligenceEditorial", () => {
  it("merges the patch and keeps provenance keys", async () => {
    const before = {
      goal: "قديم",
      description: "وصف قديم",
      main_axes: ["محور"],
      source: "khat_map_candidate",
      source_id: "topic-1",
      primary_theme: "theme",
    }
    mockSelectResult([row(before)]) // read current
    mockSelectResult([row({ ...before, goal: "جديد" })]) // read back

    await patchEpisodeIntelligenceEditorial({
      eir_id: "eir-1",
      working_title: "جديد",
      intent_patch: { goal: "جديد", description: null },
    })

    const set = vi.mocked(mockDb.update).mock.results[0].value.set
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        working_title: "جديد",
        editorial_intent: {
          goal: "جديد",
          description: null,
          main_axes: ["محور"],
          source: "khat_map_candidate",
          source_id: "topic-1",
          primary_theme: "theme",
        },
      }),
    )
  })

  it("throws for a missing EIR and writes nothing", async () => {
    mockSelectResult([])
    await expect(
      patchEpisodeIntelligenceEditorial({ eir_id: "nope", intent_patch: { goal: "x" } }),
    ).rejects.toThrow("EIR not found")
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
