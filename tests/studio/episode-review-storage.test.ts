/**
 * Studio 3-phase journey (Phase 2) — review PERSISTENCE round-trip.
 *
 * `saveEpisodeReview` / `getEpisodeReview` (lib/studio/transcripts.ts) store the
 * review under the new `phase2_review` kind, keyed to the EDITED session id.
 * The analysis-records repository is mocked with an in-memory store so this
 * exercises the transcripts-layer logic (kind, key, `data.review` wrap/unwrap)
 * without a real DB.
 *
 * Also asserts (against the REAL schema constant) that `phase2_review` is in
 * STUDIO_ANALYSIS_KINDS — that membership is exactly what the repo's `assertKind`
 * checks, and since `kind` is NOT DB-CHECK-enforced, the code-only addition is
 * all that's needed (no migration).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { EpisodeReview } from "@/lib/studio/episode-review"

// In-memory stand-in for the studio_analysis_records repository.
const store = new Map<string, { studio_session_id: string; kind: string; data: Record<string, unknown> }>()
const key = (sid: string, kind: string) => `${sid}::${kind}`

vi.mock("@/lib/studio/analysis-records", () => ({
  resolveEirIdForSession: vi.fn(async () => null),
  upsertStudioAnalysisRecord: vi.fn(async (input: { studio_session_id: string; kind: string; data: Record<string, unknown> }) => {
    const record = {
      studio_session_id: input.studio_session_id,
      kind: input.kind,
      data: input.data,
    }
    store.set(key(input.studio_session_id, input.kind), record)
    return record
  }),
  getStudioAnalysisRecord: vi.fn(async (sid: string, kind: string) => store.get(key(sid, kind)) ?? null),
}))

import { saveEpisodeReview, getEpisodeReview } from "@/lib/studio/transcripts"
import { upsertStudioAnalysisRecord } from "@/lib/studio/analysis-records"
import { STUDIO_ANALYSIS_KINDS } from "@/lib/db/schema/studio-analysis"

const EDITED = "22222222-2222-2222-2222-222222222222"
const OTHER = "33333333-3333-3333-3333-333333333333"

function fakeReview(): EpisodeReview {
  return {
    notes: [
      {
        type: "pre_roll",
        raw_range: { start: 0, end: 5 },
        status: "applied",
        detail: "تم الحذف",
        absent_fraction: 1,
        present_fraction: 0,
        uncertain_fraction: 0,
        content_seconds: 5,
      },
    ],
    extra_cuts: [],
    edited_duration: 20,
    raw_duration: 25,
    summary: { applied: 1, not_applied: 0, partial: 0, uncertain: 0, extra: 0 },
    overall_confidence: 1,
  }
}

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

describe("saveEpisodeReview / getEpisodeReview — phase2_review round-trip", () => {
  it("stores under kind=phase2_review keyed to the EDITED session and reads it back", async () => {
    const review = fakeReview()
    await saveEpisodeReview(EDITED, review)

    // Written with the new kind, keyed to the edited session, wrapped in {review}.
    expect(upsertStudioAnalysisRecord).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(upsertStudioAnalysisRecord).mock.calls[0][0]
    expect(arg.kind).toBe("phase2_review")
    expect(arg.studio_session_id).toBe(EDITED)
    expect(arg.data).toEqual({ review })

    // Round-trips back identically.
    const read = await getEpisodeReview(EDITED)
    expect(read).toEqual(review)
  })

  it("returns null for a session with no review", async () => {
    expect(await getEpisodeReview(OTHER)).toBeNull()
  })

  it("does not leak a review across sessions", async () => {
    await saveEpisodeReview(EDITED, fakeReview())
    expect(await getEpisodeReview(OTHER)).toBeNull()
  })
})

describe("phase2_review kind registration (code-only, no migration)", () => {
  it("is present in STUDIO_ANALYSIS_KINDS", () => {
    expect(STUDIO_ANALYSIS_KINDS).toContain("phase2_review")
  })
})
