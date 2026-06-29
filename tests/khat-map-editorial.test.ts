import { describe, it, expect } from "vitest"
import { SEASON_CATEGORY_IDS } from "@/lib/khat-map/v2/categories"
import {
  KNOWLEDGE_UNIVERSE,
  ALL_SUBCATEGORY_IDS,
  subcategoriesFor,
  clampSubcategory,
  locateSubcategory,
  subcategoryCountByCategory,
} from "@/lib/khat-map/v2/knowledge-universe"
import {
  THINKING_LENSES,
  THINKING_LENS_IDS,
  clampLenses,
} from "@/lib/khat-map/v2/lenses"
import {
  clampTitleSet,
  TITLE_VARIANT_IDS,
} from "@/lib/khat-map/v2/headline-principles"
import {
  computeSuccessScore,
  clampSuccessDimensions,
  neutralSuccessDimensions,
  successScoreToRank,
  passesSuccessThreshold,
  successBand,
  SUCCESS_THRESHOLD,
  type SuccessDimensions,
} from "@/lib/khat-map/v2/success-score"
import { assembleEditorial } from "@/lib/khat-map/v2/editorial-assemble"
import type { RawCandidate, CourtVerdict } from "@/lib/khat-map/v2/types"

// ─── Knowledge Universe ──────────────────────────────────────────────────────

describe("knowledge universe", () => {
  it("gives every category at least 12 subcategories", () => {
    const counts = subcategoryCountByCategory()
    for (const cat of SEASON_CATEGORY_IDS) {
      expect(counts[cat], `category ${cat}`).toBeGreaterThanOrEqual(12)
    }
  })

  it("uses globally unique subcategory ids", () => {
    const all: string[] = []
    for (const cat of SEASON_CATEGORY_IDS) {
      for (const s of KNOWLEDGE_UNIVERSE[cat]) all.push(s.id)
    }
    expect(new Set(all).size).toBe(all.length)
    expect(ALL_SUBCATEGORY_IDS.length).toBe(all.length)
  })

  it("every subcategory has a non-empty label and generative scope", () => {
    for (const cat of SEASON_CATEGORY_IDS) {
      for (const s of subcategoriesFor(cat)) {
        expect(s.label_ar.trim().length).toBeGreaterThan(0)
        expect(s.scope_ar.trim().length).toBeGreaterThan(10)
      }
    }
  })

  it("clampSubcategory tolerates brackets, quotes, casing, and labels", () => {
    expect(clampSubcategory("islamic_history")).toBe("islamic_history")
    expect(clampSubcategory("[ISLAMIC_HISTORY]")).toBe("islamic_history")
    expect(clampSubcategory('"history_of_money"')).toBe("history_of_money")
    expect(clampSubcategory("التاريخ الإسلامي")).toBe("islamic_history")
    expect(clampSubcategory("not_a_real_sub")).toBeNull()
    expect(clampSubcategory(null)).toBeNull()
  })

  it("accepts a real subcategory even if tagged under the wrong category", () => {
    // islamic_history belongs to history; passing category=science still resolves it.
    expect(clampSubcategory("islamic_history", "science")).toBe("islamic_history")
  })

  it("locates a subcategory back to its category", () => {
    const loc = locateSubcategory("space_and_cosmos")
    expect(loc?.category).toBe("science")
  })
})

// ─── Thinking Lenses ─────────────────────────────────────────────────────────

describe("thinking lenses", () => {
  it("exposes 22 distinct lenses", () => {
    expect(THINKING_LENSES.length).toBe(22)
    expect(new Set(THINKING_LENS_IDS).size).toBe(22)
  })

  it("clampLenses dedupes, caps, drops unknowns, and reads labels", () => {
    expect(clampLenses(["historical", "historical", "power"])).toEqual(["historical", "power"])
    expect(clampLenses(["nonsense", "money"])).toEqual(["money"])
    expect(clampLenses(["تاريخي", "نفسي"])).toEqual(["historical", "psychological"])
    expect(clampLenses(["a", "b", "c", "d", "e", "f"]).length).toBeLessThanOrEqual(5)
    expect(clampLenses("not-an-array")).toEqual([])
  })
})

// ─── Headline title set ──────────────────────────────────────────────────────

describe("headline title set", () => {
  it("reads a flat title object and picks a recommendation", () => {
    const set = clampTitleSet(
      { premium: "عنوان راقٍ", curiosity: "عنوان فضولي", recommended: "curiosity", recommended_reason: "يفتح فجوة" },
      "fallback",
    )
    expect(set.variants.premium).toBe("عنوان راقٍ")
    expect(set.recommended).toBe("curiosity")
    expect(set.recommended_title).toBe("عنوان فضولي")
    expect(set.recommended_reason).toBe("يفتح فجوة")
  })

  it("reads a {variants} wrapper and falls back to the first variant", () => {
    const set = clampTitleSet({ variants: { emotional: "عنوان عاطفي" } }, "fallback")
    expect(set.recommended).toBe("emotional")
    expect(set.recommended_title).toBe("عنوان عاطفي")
  })

  it("falls back to the working title when nothing usable is given", () => {
    const set = clampTitleSet(null, "العنوان الأساسي")
    expect(set.recommended_title).toBe("العنوان الأساسي")
    expect(Object.keys(set.variants).length).toBe(0)
  })

  it("covers all eight title-variant kinds", () => {
    expect(TITLE_VARIANT_IDS).toEqual([
      "premium",
      "curiosity",
      "controversial",
      "emotional",
      "global",
      "local",
      "youtube",
      "apple",
    ])
  })
})

// ─── Success scoring ─────────────────────────────────────────────────────────

function dims(over: Partial<SuccessDimensions> = {}): SuccessDimensions {
  return { ...neutralSuccessDimensions(), ...over }
}

describe("success score", () => {
  it("neutral dimensions score ~50/100", () => {
    expect(computeSuccessScore(neutralSuccessDimensions())) .toBe(50)
  })

  it("all-high scores near 100 and all-low near 0", () => {
    const high = computeSuccessScore(dims(Object.fromEntries(
      Object.keys(neutralSuccessDimensions()).map((k) => [k, 10]),
    ) as Partial<SuccessDimensions>))
    expect(high).toBeGreaterThan(95)
    const low = computeSuccessScore(dims(Object.fromEntries(
      Object.keys(neutralSuccessDimensions()).map((k) => [k, 0]),
    ) as Partial<SuccessDimensions>))
    expect(low).toBe(0)
  })

  it("brand_alignment acts as a quality gate", () => {
    const ungated = computeSuccessScore(dims({ click_potential: 10, retention_potential: 10, brand_alignment: 8 }))
    const gated = computeSuccessScore(dims({ click_potential: 10, retention_potential: 10, brand_alignment: 2 }))
    expect(gated).toBeLessThan(ungated)
    // gate pulls hard toward zero (×2/6)
    expect(gated).toBeLessThan(ungated * 0.6)
  })

  it("clamps out-of-range model output", () => {
    const d = clampSuccessDimensions({ click_potential: 99, retention_potential: -5, depth: "x" })
    expect(d.click_potential).toBe(10)
    expect(d.retention_potential).toBe(0)
    expect(d.depth).toBe(5) // non-numeric → neutral
  })

  it("threshold + band + rank helpers behave", () => {
    expect(successScoreToRank(80)).toBeCloseTo(8)
    expect(passesSuccessThreshold(SUCCESS_THRESHOLD)).toBe(true)
    expect(passesSuccessThreshold(SUCCESS_THRESHOLD - 1)).toBe(false)
    expect(successBand(90)).toBe("exceptional")
    expect(successBand(50)).toBe("weak")
  })

  it("tuned threshold + bands (v2)", () => {
    expect(SUCCESS_THRESHOLD).toBe(60)
    expect(successBand(86)).toBe("exceptional")
    expect(successBand(75)).toBe("strong")
    expect(successBand(65)).toBe("solid") // at/above the acceptance bar
    expect(successBand(59)).toBe("weak") // just below the bar
  })

  it("rewards depth/originality/timelessness over raw click (brand identity)", () => {
    // A deep, original, timeless idea should out-score a clickbait-y shallow one.
    const deep = computeSuccessScore(
      dims({ depth: 9, originality: 9, timeless_value: 9, retention_potential: 8, click_potential: 5, shareability: 4 }),
    )
    const shallow = computeSuccessScore(
      dims({ depth: 3, originality: 3, timeless_value: 3, retention_potential: 5, click_potential: 9, shareability: 9 }),
    )
    expect(deep).toBeGreaterThan(shallow)
  })
})

// ─── Editorial assembly ──────────────────────────────────────────────────────

function rawCandidate(over: Partial<RawCandidate["topic"]> = {}): RawCandidate {
  return {
    topic: {
      working_title: "عنوان العمل",
      hook: "خطاف",
      why_matters: "",
      why_now: "",
      goal: "",
      description: "وصف",
      episode_type: "intellectual",
      topic_domain: "none",
      topic_angle_code: null,
      main_axes: [],
      suggested_questions: [],
      risk_level: null,
      effort_level: null,
      sponsor_appeal: null,
      category: "history",
      audience_fit: {
        regional_relevance: 5, cultural_resonance: 5, curiosity: 5, guest_potential: 5,
        discussion_potential: 5, timelessness: 5, viral_potential: 5, educational_value: 5,
        identity_alignment: 5,
      },
      regional_note: null,
      viral_angle: "زاوية",
      debate_axis: "جدل",
      subcategory: "islamic_history",
      lenses: ["historical", "power", "nonsense"],
      global_note: "صلة عالمية",
      why_this_topic: "لأنه مهم",
      titles: { premium: "راقٍ", curiosity: "فضولي", recommended: "premium", recommended_reason: "أنيق" },
      success: Object.fromEntries(
        Object.keys(neutralSuccessDimensions()).map((k) => [k, 7]),
      ),
      guest_idea: "خبير",
      ...over,
    },
    guest: null,
    editorial_score: 8,
    why_now: "",
    domain_reasoning: null,
  }
}

describe("assembleEditorial", () => {
  it("builds intel from a raw candidate (self-score path)", () => {
    const { editorial_intel, success_score, subcategory } = assembleEditorial(rawCandidate(), null)
    expect(subcategory).toBe("islamic_history")
    expect(editorial_intel.subcategory_label).toBeTruthy()
    expect(editorial_intel.lenses).toEqual(["historical", "power"]) // nonsense dropped
    expect(editorial_intel.lens_labels.length).toBe(2)
    expect(editorial_intel.recommended_title).toBe("راقٍ")
    expect(editorial_intel.titles.length).toBe(2)
    expect(editorial_intel.global_note).toBe("صلة عالمية")
    expect(editorial_intel.debate_axis).toBe("جدل")
    expect(editorial_intel.viral_angle).toBe("زاوية")
    expect(editorial_intel.guest_idea).toBe("خبير")
    expect(success_score).toBeGreaterThan(60) // all dims 7
    // self-score path → court-only fields stay null
    expect(editorial_intel.why_fail).toBeNull()
    expect(editorial_intel.is_overdone).toBeNull()
  })

  it("court verdict overrides scoring + adds critique", () => {
    const verdict: CourtVerdict = {
      index: 0,
      verdict: "accept",
      success: clampSuccessDimensions(
        Object.fromEntries(Object.keys(neutralSuccessDimensions()).map((k) => [k, 9])),
      ),
      why_succeed: "ينجح",
      why_fail: "قد يفشل",
      is_overdone: false,
      reference_potential: true,
      clip_potential: true,
      recommended_title: "عنوان المحكمة",
      recommended_reason: "أقوى",
    }
    const { editorial_intel, success_score } = assembleEditorial(rawCandidate(), verdict)
    expect(success_score).toBeGreaterThan(85) // court's 9s win over self 7s
    expect(editorial_intel.why_succeed).toBe("ينجح")
    expect(editorial_intel.why_fail).toBe("قد يفشل")
    expect(editorial_intel.reference_potential).toBe(true)
    expect(editorial_intel.recommended_title).toBe("عنوان المحكمة") // court overrides
  })
})
