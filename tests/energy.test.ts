import { describe, it, expect } from "vitest"
import {
  energyBand,
  SECTION_TARGET_BAND,
  scoreQuestionByEnergy,
  matchesEnergy,
  rankQuestionsByEnergy,
  coachHint,
} from "@/lib/recording-v2/energy"
import type { PrepV2Question, QuestionType, QuestionRiskLevel, QuestionPriority } from "@/lib/preparation/v2/types"

function q(
  id: string,
  types: QuestionType[],
  risk: QuestionRiskLevel,
  priority: QuestionPriority = "if_time",
): PrepV2Question {
  return {
    id,
    section: "conflict",
    text: id,
    types,
    priority,
    purpose: "",
    follow_up_prompt: "",
    risk_level: risk,
  }
}

describe("energyBand", () => {
  it("maps 0–2 to low, 3 to medium, 4–5 to high", () => {
    expect([0, 1, 2].map(energyBand)).toEqual(["low", "low", "low"])
    expect(energyBand(3)).toBe("medium")
    expect([4, 5].map(energyBand)).toEqual(["high", "high"])
  })
})

describe("SECTION_TARGET_BAND", () => {
  it("follows the arc: peaks high, edges low", () => {
    expect(SECTION_TARGET_BAND.opening).toBe("low")
    expect(SECTION_TARGET_BAND.build_up).toBe("medium")
    expect(SECTION_TARGET_BAND.conflict).toBe("high")
    expect(SECTION_TARGET_BAND.emotional_peak).toBe("high")
    expect(SECTION_TARGET_BAND.resolution).toBe("low")
  })
})

describe("scoreQuestionByEnergy", () => {
  it("rewards confrontational/high-risk in a high band and penalizes them in low", () => {
    const hot = q("hot", ["confrontational"], "high")
    expect(scoreQuestionByEnergy(hot, "high")).toBeGreaterThan(0)
    expect(scoreQuestionByEnergy(hot, "low")).toBeLessThan(0)
  })
  it("rewards reflective/factual/low-risk in a low band", () => {
    const calm = q("calm", ["reflective"], "low")
    expect(scoreQuestionByEnergy(calm, "low")).toBeGreaterThan(0)
    expect(scoreQuestionByEnergy(calm, "high")).toBeLessThan(0)
  })
  it("is neutral (0) at medium band", () => {
    expect(scoreQuestionByEnergy(q("x", ["confrontational"], "high"), "medium")).toBe(0)
    expect(matchesEnergy(q("x", ["confrontational"], "high"), "medium")).toBe(false)
  })
})

describe("rankQuestionsByEnergy", () => {
  it("keeps must_ask first, floats energy matches, sinks done", () => {
    const calmMust = q("calmMust", ["reflective"], "low", "must_ask")
    const hotMust = q("hotMust", ["confrontational"], "high", "must_ask")
    const hotIf = q("hotIf", ["emotional"], "high", "if_time")
    const out = rankQuestionsByEnergy([calmMust, hotMust, hotIf], "high")
    // must_ask group first; within it the hot one floats above the calm one.
    expect(out.slice(0, 2).map((x) => x.id)).toEqual(["hotMust", "calmMust"])
    expect(out[2].id).toBe("hotIf")
  })
  it("sinks done questions to the bottom", () => {
    const a = q("a", ["confrontational"], "high", "must_ask")
    const b = q("b", ["confrontational"], "high", "must_ask")
    const out = rankQuestionsByEnergy([a, b], "high", (id) => id === "a")
    expect(out.map((x) => x.id)).toEqual(["b", "a"])
  })
})

describe("coachHint", () => {
  it("nudges up when a high-energy section is flat", () => {
    expect(coachHint("conflict", 1)).toContain("ادفع")
    expect(coachHint("emotional_peak", 2)).toBeTruthy()
  })
  it("nudges down when a calm section is hot", () => {
    expect(coachHint("opening", 5)).toBeTruthy()
    expect(coachHint("resolution", 4)).toContain("اهدأ")
  })
  it("cheers an aligned peak", () => {
    expect(coachHint("conflict", 5)).toBe("لحظة مثالية — اضغط الآن")
  })
  it("stays silent when aligned and not a peak (no nagging)", () => {
    expect(coachHint("build_up", 3)).toBeNull()
    expect(coachHint("opening", 2)).toBeNull()
  })
})
