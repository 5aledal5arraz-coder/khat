/**
 * Studio 3-phase journey, Step 4 — the PURE stepper + approval-gate
 * derivations. No DB, no React: state → step model, and the honesty-gate
 * note accounting. These are the load-bearing decisions the review screen
 * and the session list render, so they are pinned here.
 */
import { describe, it, expect } from "vitest"

import {
  deriveStepperModel,
  isReviewApproved,
  attentionCount,
  notAppliedCount,
  uncertainCount,
  phaseLabelForState,
  sessionPhaseInfo,
  ATTENTION_NOTE_STATUSES,
  type StepperModel,
} from "@/lib/studio/project-stepper"
import { STUDIO_PROJECT_STATES } from "@/lib/db/schema/studio-projects"
import type { EpisodeReview, ReviewSummary } from "@/lib/studio/episode-review"

// A review carrying only the summary — the accounting helpers read that alone.
function reviewWith(summary: Partial<ReviewSummary>): EpisodeReview {
  return {
    notes: [],
    extra_cuts: [],
    edited_duration: 0,
    raw_duration: 0,
    overall_confidence: 1,
    summary: {
      applied: 0,
      not_applied: 0,
      partial: 0,
      uncertain: 0,
      extra: 0,
      ...summary,
    },
  }
}

// ── deriveStepperModel ───────────────────────────────────────────────────────

describe("deriveStepperModel — state → 3-step model", () => {
  const cases: Array<[(typeof STUDIO_PROJECT_STATES)[number], StepperModel]> = [
    ["draft", { map: "current", review: "pending", publish: "locked" }],
    ["raw_uploaded", { map: "current", review: "pending", publish: "locked" }],
    ["mapped", { map: "done", review: "current", publish: "locked" }],
    ["reviewed", { map: "done", review: "done", publish: "current" }],
    ["finalized", { map: "done", review: "done", publish: "current" }],
    ["published", { map: "done", review: "done", publish: "done" }],
  ]

  it.each(cases)("%s → correct step states", (state, expected) => {
    expect(deriveStepperModel(state)).toEqual(expected)
  })

  it("Phase 3 is locked until the review is approved, then unlocks", () => {
    // Before approval (draft/raw_uploaded/mapped) publish is locked.
    expect(deriveStepperModel("mapped").publish).toBe("locked")
    // Approval (reviewed) is exactly when it stops being locked.
    expect(deriveStepperModel("reviewed").publish).not.toBe("locked")
  })

  it("is total over every project state (no missing case)", () => {
    for (const s of STUDIO_PROJECT_STATES) {
      const m = deriveStepperModel(s)
      for (const step of [m.map, m.review, m.publish]) {
        expect(["done", "current", "pending", "locked"]).toContain(step)
      }
    }
  })
})

describe("isReviewApproved", () => {
  it("is true only from reviewed onward", () => {
    expect(isReviewApproved("draft")).toBe(false)
    expect(isReviewApproved("raw_uploaded")).toBe(false)
    expect(isReviewApproved("mapped")).toBe(false)
    expect(isReviewApproved("reviewed")).toBe(true)
    expect(isReviewApproved("finalized")).toBe(true)
    expect(isReviewApproved("published")).toBe(true)
  })
})

// ── The honesty gate: attention accounting ───────────────────────────────────

describe("attention accounting — the honesty gate", () => {
  it("applied notes are NEVER counted as attention", () => {
    expect(attentionCount(reviewWith({ applied: 5 }))).toBe(0)
    expect(notAppliedCount(reviewWith({ applied: 5 }))).toBe(0)
    expect(uncertainCount(reviewWith({ applied: 5 }))).toBe(0)
  })

  it("not_applied + partial + uncertain all demand attention", () => {
    const r = reviewWith({ applied: 2, not_applied: 1, partial: 1, uncertain: 1, extra: 3 })
    expect(attentionCount(r)).toBe(3) // 1 + 1 + 1 — extra is informational, excluded
    expect(notAppliedCount(r)).toBe(2) // not_applied + partial
    expect(uncertainCount(r)).toBe(1)
  })

  it("extra cuts are informational, never attention", () => {
    expect(attentionCount(reviewWith({ extra: 9 }))).toBe(0)
  })

  it("null review ⇒ zero", () => {
    expect(attentionCount(null)).toBe(0)
    expect(notAppliedCount(null)).toBe(0)
    expect(uncertainCount(null)).toBe(0)
  })

  it("ATTENTION_NOTE_STATUSES excludes applied", () => {
    expect(ATTENTION_NOTE_STATUSES).not.toContain("applied")
    expect(ATTENTION_NOTE_STATUSES).toEqual(
      expect.arrayContaining(["not_applied", "partial", "uncertain"]),
    )
  })
})

// ── Session-list presentation ────────────────────────────────────────────────

describe("phaseLabelForState / sessionPhaseInfo", () => {
  it("labels every project state", () => {
    for (const s of STUDIO_PROJECT_STATES) {
      expect(phaseLabelForState(s).length).toBeGreaterThan(0)
    }
  })

  it("distinguishes the raw recording from the edited cut", () => {
    const raw = sessionPhaseInfo("raw", "mapped")
    const edited = sessionPhaseInfo("edited", "mapped")
    expect(raw.stageTone).toBe("raw")
    expect(edited.stageTone).toBe("edited")
    expect(raw.stageLabel).not.toBe(edited.stageLabel)
    // Both legs of one project share the phase label — that's the visual tie.
    expect(raw.phaseLabel).toBe(edited.phaseLabel)
  })

  it("omits the phase label when the session has no linked project", () => {
    expect(sessionPhaseInfo("edited", null).phaseLabel).toBeNull()
  })
})
