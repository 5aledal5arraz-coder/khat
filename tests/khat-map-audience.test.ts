import { describe, it, expect } from "vitest"
import {
  computeRegionalAudienceFit,
  neutralAudienceFit,
  type AudienceFit,
} from "@/lib/khat-map/v2/regional-fit"
import {
  seasonCategoryCap,
  overRepresentedCategories,
  categoryDiversityPenalty,
} from "@/lib/khat-map/v2/diversity"
import { selectByPotential } from "@/lib/khat-map/v2/select-by-potential"
import { legacyDomainForCategory, clampCategory } from "@/lib/khat-map/v2/categories"
import type { ScoredCandidate } from "@/lib/khat-map/v2/types"

describe("clampCategory (model output tolerance)", () => {
  it("accepts a bare id, a bracketed id, quotes, casing, and the Arabic label", () => {
    expect(clampCategory("business")).toBe("business")
    expect(clampCategory("[business]")).toBe("business") // model copies the menu form
    expect(clampCategory(' "Social_Issues" ')).toBe("social_issues")
    expect(clampCategory("قضايا اجتماعية")).toBe("social_issues") // Arabic label
    expect(clampCategory("not-a-category")).toBeNull()
    expect(clampCategory(null)).toBeNull()
  })
})

function uniformFit(v: number, over: Partial<AudienceFit> = {}): AudienceFit {
  const base = {} as AudienceFit
  for (const k of Object.keys(neutralAudienceFit()) as (keyof AudienceFit)[]) base[k] = v
  return { ...base, ...over }
}

describe("Regional Audience Fit", () => {
  it("uniform factors (above the quality gate) yield ~that score", () => {
    expect(computeRegionalAudienceFit(uniformFit(8))).toBeCloseTo(8, 5)
    expect(computeRegionalAudienceFit(uniformFit(4))).toBeCloseTo(4, 5)
  })

  it("weights curiosity + discussion above educational value", () => {
    const curious = uniformFit(5, { curiosity: 10, discussion_potential: 10 })
    const educational = uniformFit(5, { educational_value: 10 })
    expect(computeRegionalAudienceFit(curious)).toBeGreaterThan(
      computeRegionalAudienceFit(educational),
    )
  })

  it("applies the identity quality gate (low identity is dampened hard)", () => {
    const cheapViral = uniformFit(9, { identity_alignment: 2 })
    // Without the gate this would be ~8.3; the gate pulls it well below.
    expect(computeRegionalAudienceFit(cheapViral)).toBeLessThan(4)
  })
})

describe("diversity constraint", () => {
  it("season cap is ~22% of the target, floored at 2", () => {
    expect(seasonCategoryCap(10)).toBe(3)
    expect(seasonCategoryCap(5)).toBe(2)
  })

  it("flags over-represented categories at/above the cap", () => {
    const over = overRepresentedCategories({ psychology: 3, science: 1 }, 3)
    expect(over).toContain("psychology")
    expect(over).not.toContain("science")
  })

  it("penalizes repeats within a batch (0 → 0.8 → 2.5)", () => {
    expect(categoryDiversityPenalty("psychology", [])).toBe(0)
    expect(categoryDiversityPenalty("psychology", ["psychology"])).toBe(0.8)
    expect(categoryDiversityPenalty("psychology", ["psychology", "psychology"])).toBe(2.5)
  })
})

// ─── Potential-first selector ─────────────────────────────────────────────────

function scored(category: string, title: string, raf: number): ScoredCandidate {
  const fit = uniformFit(raf)
  return {
    raw: {
      topic: {
        working_title: title,
        hook: "",
        why_matters: "",
        why_now: "",
        goal: "",
        description: "",
        episode_type: "social",
        topic_domain: legacyDomainForCategory(category),
        topic_category: category,
        topic_angle_code: null,
        main_axes: [],
        suggested_questions: [],
        risk_level: null,
        effort_level: null,
        sponsor_appeal: null,
        category: category as never,
        audience_fit: fit,
        regional_note: null,
        viral_angle: null,
        debate_axis: null,
      } as ScoredCandidate["raw"]["topic"],
      guest: null,
      editorial_score: raf,
      why_now: "",
      domain_reasoning: null,
    },
    embedding: [],
    similarity_verdict: "ok",
    similarity_max: 0.1,
    similarity_trigger_title: null,
    taste_alignment: 0.5,
    domain_load: 0,
    final_score: computeRegionalAudienceFit(fit),
  }
}

describe("selectByPotential", () => {
  it("ranks by audience potential, breaking near-ties toward breadth", () => {
    const pool = [
      scored("psychology", "psy-top", 9.0),
      scored("psychology", "psy-2", 8.9),
      scored("science", "sci", 8.5),
    ]
    const { picks } = selectByPotential(pool, {
      size: 2,
      seasonCap: 99,
      acceptedByCategory: {},
    })
    // #1 is the highest RAF; #2 is the science (8.5 beats psy-2's 8.9 − 0.8 penalty).
    expect(picks[0].raw.topic.working_title).toBe("psy-top")
    expect(picks[1].raw.topic.working_title).toBe("sci")
  })

  it("keeps a strong topic over a weak fresher-category one (potential first)", () => {
    const pool = [
      scored("psychology", "psy-top", 9.0),
      scored("psychology", "psy-2", 8.0),
      scored("science", "sci-weak", 4.0),
    ]
    const { picks } = selectByPotential(pool, {
      size: 2,
      seasonCap: 99,
      acceptedByCategory: {},
    })
    // psy-2 (8.0 − 0.8 = 7.2) still beats the weak science (4.0). We do NOT
    // force a weak topic just to diversify.
    const titles = picks.map((p) => p.raw.topic.working_title)
    expect(titles).toEqual(["psy-top", "psy-2"])
  })

  it("enforces the season cap so a saturated category can't dominate", () => {
    const pool = [
      scored("psychology", "psy-top", 9.0),
      scored("science", "sci", 5.0),
    ]
    const { picks } = selectByPotential(pool, {
      size: 1,
      seasonCap: 3,
      acceptedByCategory: { psychology: 3 }, // already at cap
    })
    // psychology is capped → the lower-RAF science is taken instead.
    expect(picks[0].raw.topic.working_title).toBe("sci")
  })
})
