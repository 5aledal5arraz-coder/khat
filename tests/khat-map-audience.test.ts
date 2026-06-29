import { describe, it, expect } from "vitest"
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

/** A scored candidate whose `final_score` (the 0-10 ranking value) is `score`. */
function scored(category: string, title: string, score: number): ScoredCandidate {
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
        topic_angle_code: null,
        main_axes: [],
        suggested_questions: [],
        risk_level: null,
        effort_level: null,
        sponsor_appeal: null,
        category: category as never,
        regional_note: null,
        viral_angle: null,
        debate_axis: null,
      } as ScoredCandidate["raw"]["topic"],
      guest: null,
      editorial_score: score,
      why_now: "",
      domain_reasoning: null,
    },
    embedding: [],
    similarity_verdict: "ok",
    similarity_max: 0.1,
    similarity_trigger_title: null,
    taste_alignment: 0.5,
    domain_load: 0,
    final_score: score,
  }
}

describe("selectByPotential", () => {
  it("ranks by potential, breaking near-ties toward breadth", () => {
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
    // #1 is the highest score; #2 is the science (8.5 beats psy-2's 8.9 − 0.8 penalty).
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
    // psychology is capped → the lower-scored science is taken instead.
    expect(picks[0].raw.topic.working_title).toBe("sci")
  })
})
