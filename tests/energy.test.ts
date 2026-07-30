import { describe, it, expect } from "vitest"
import {
  energyBand,
  ENERGY_BAND_LABEL_AR,
  ENERGY_FIT_LABEL_AR,
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

  it("names three explicit grades without changing the stored 0–5 scale", () => {
    expect(ENERGY_BAND_LABEL_AR[energyBand(1)]).toBe("هادئ")
    expect(ENERGY_BAND_LABEL_AR[energyBand(3)]).toBe("متوسط")
    expect(ENERGY_BAND_LABEL_AR[energyBand(5)]).toBe("حادّ")
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

describe("scoreQuestionByEnergy — corrective, not matching", () => {
  it("floats the question that RAISES tension when the room is flat", () => {
    const hot = q("hot", ["confrontational"], "high")
    const calm = q("calm", ["reflective"], "low")
    expect(scoreQuestionByEnergy(hot, "low")).toBeGreaterThan(
      scoreQuestionByEnergy(calm, "low"),
    )
    expect(scoreQuestionByEnergy(hot, "low")).toBeGreaterThan(0)
  })

  it("floats the question that CALMS when the room is hot (breathe after the peak)", () => {
    const hot = q("hot", ["confrontational"], "high")
    const calm = q("calm", ["reflective"], "low")
    expect(scoreQuestionByEnergy(calm, "high")).toBeGreaterThan(
      scoreQuestionByEnergy(hot, "high"),
    )
    expect(scoreQuestionByEnergy(calm, "high")).toBeGreaterThan(0)
  })

  it("agrees with coachHint instead of contradicting it", () => {
    // The whisper at low energy says "push". The ranking must push too.
    expect(coachHint("conflict", 1)).toContain("ادفع")
    const hot = q("hot", ["confrontational"], "high")
    expect(matchesEnergy(hot, "low")).toBe(true)
  })

  it("weighs risk as an ordered 0/1/2 scale, not a ±1 flag (C3)", () => {
    // Same types, three risk levels → three DISTINCT scores in both directions.
    const lo = q("lo", ["personal"], "low")
    const mid = q("mid", ["personal"], "medium")
    const hi = q("hi", ["personal"], "high")
    const raising = [lo, mid, hi].map((x) => scoreQuestionByEnergy(x, "low"))
    expect(raising).toEqual([0, 1, 2])
    const calming = [lo, mid, hi].map((x) => scoreQuestionByEnergy(x, "high"))
    expect(calming).toEqual([2, 1, 0])
  })
})

describe("scoreQuestionByEnergy — the medium branch (the default state)", () => {
  it("is NOT flat at the default energy of 3", () => {
    // Regression: `medium` had no branch at all, so every question scored 0,
    // the ranking was a no-op and the badge never rendered — in the state the
    // room is in by default.
    expect(energyBand(3)).toBe("medium")
    expect(scoreQuestionByEnergy(q("hot", ["confrontational"], "high"), "medium")).toBeGreaterThan(0)
    expect(scoreQuestionByEnergy(q("calm", ["reflective"], "low"), "medium")).toBeLessThan(0)
    expect(matchesEnergy(q("hot", ["confrontational"], "high"), "medium")).toBe(true)
  })

  it("leaves risk out at medium — nothing to correct is not a reason to escalate", () => {
    const a = q("a", ["personal"], "low")
    const b = q("b", ["personal"], "high")
    expect(scoreQuestionByEnergy(a, "medium")).toBe(scoreQuestionByEnergy(b, "medium"))
  })
})

describe("ENERGY_FIT_LABEL_AR", () => {
  it("names what the floated question does, per band", () => {
    expect(ENERGY_FIT_LABEL_AR.low).toBe("يرفع الحدّة")
    expect(ENERGY_FIT_LABEL_AR.medium).toBe("يدفع للأمام")
    expect(ENERGY_FIT_LABEL_AR.high).toBe("يهدّئ الإيقاع")
  })
})

describe("rankQuestionsByEnergy", () => {
  const calmMust = q("calmMust", ["reflective"], "low", "must_ask")
  const hotMust = q("hotMust", ["confrontational"], "high", "must_ask")
  const hotIf = q("hotIf", ["emotional"], "high", "if_time")
  const calmIf = q("calmIf", ["factual"], "low", "if_time")
  const bank = [calmMust, hotMust, hotIf, calmIf]

  it("keeps must_ask ABOVE energy — never floats «إن سمح الوقت» over an essential", () => {
    for (const band of ["low", "medium", "high"] as const) {
      const out = rankQuestionsByEnergy(bank, band)
      const mustIdx = out.map((x) => x.priority === "must_ask")
      expect(mustIdx.slice(0, 2)).toEqual([true, true])
    }
  })

  it("reorders at the DEFAULT energy of 3 — this used to be a no-op", () => {
    const asIs = bank.map((x) => x.id)
    const atDefault = rankQuestionsByEnergy(bank, energyBand(3)).map((x) => x.id)
    expect(atDefault).not.toEqual(asIs)
    // Corrective at medium: within each priority group the pushing question leads.
    expect(atDefault).toEqual(["hotMust", "calmMust", "hotIf", "calmIf"])
  })

  it("inverts within a priority group when the room goes hot", () => {
    expect(rankQuestionsByEnergy(bank, "high").map((x) => x.id)).toEqual([
      "calmMust",
      "hotMust",
      "calmIf",
      "hotIf",
    ])
  })

  it("pushes when the room is flat", () => {
    expect(rankQuestionsByEnergy(bank, "low").map((x) => x.id)).toEqual([
      "hotMust",
      "calmMust",
      "hotIf",
      "calmIf",
    ])
  })

  it("NEVER changes the question set or a single character of text — order only", () => {
    for (const band of ["low", "medium", "high"] as const) {
      const out = rankQuestionsByEnergy(bank, band)
      expect(out).toHaveLength(bank.length)
      expect([...out].map((x) => x.id).sort()).toEqual([...bank].map((x) => x.id).sort())
      for (const original of bank) {
        const seen = out.find((x) => x.id === original.id)!
        expect(seen).toBe(original) // same object reference — nothing rewritten
        expect(seen.text).toBe(original.text)
      }
    }
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
