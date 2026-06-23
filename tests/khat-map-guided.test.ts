import { describe, it, expect } from "vitest"
import { buildBatchSystemPrompt } from "@/lib/khat-map/v2/prompts"
import {
  isNearDuplicateTitle,
  jaccardSimilarity,
  normalizeTitleTokens,
} from "@/lib/khat-map/v2/title-similarity"
import type { CandidateGenInput } from "@/lib/khat-map/v2/types"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"

function genInput(over: Partial<CandidateGenInput> = {}): CandidateGenInput {
  return {
    season_id: "s1",
    target_count: 8,
    season_target: 10,
    accepted_domain_counts: {} as CandidateGenInput["accepted_domain_counts"],
    accepted_titles: [],
    rejected_titles: [],
    rejected_reason_categories: [],
    taste_profile: {
      user_id: "",
      preferred_domains: [],
      rejected_patterns: [],
      depth_score: 0.5,
      controversy_tolerance: 0.5,
      emotional_preference: 0.5,
      kuwait_relevance_weight: 0.5,
      total_decisions: 0,
      last_recomputed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    invasion_policy: "optional",
    editorial_controls: KHAT_EDITORIAL_CONTROLS_DEFAULTS,
    phase: "topics",
    extra_system_blocks: [],
    ...over,
  }
}

describe("buildBatchSystemPrompt — already-chosen (Guided seeds)", () => {
  it("lists the accepted titles in an 'Already chosen' block", () => {
    const prompt = buildBatchSystemPrompt(
      genInput({ accepted_titles: ["الذكاء الاصطناعي والهوية", "مستقبل العمل"] }),
    )
    expect(prompt).toContain("Already chosen for this season")
    expect(prompt).toContain("الذكاء الاصطناعي والهوية")
    expect(prompt).toContain("مستقبل العمل")
  })

  it("rule #1 forbids duplicating the already-chosen list", () => {
    const prompt = buildBatchSystemPrompt(genInput({ accepted_titles: ["أ"] }))
    expect(prompt).toMatch(/Already chosen.*Negative memory|paraphrase, near-duplicate/i)
  })

  it("shows a placeholder when nothing is chosen yet", () => {
    const prompt = buildBatchSystemPrompt(genInput({ accepted_titles: [] }))
    expect(prompt).toContain("Already chosen for this season")
    expect(prompt).toContain("(none yet)")
  })
})

describe("isNearDuplicateTitle — the engine post-filter core", () => {
  it("flags a near-duplicate of an already-chosen title", () => {
    expect(
      isNearDuplicateTitle("تأثير الذكاء الاصطناعي على المجتمع", [
        "تأثير الذكاء الاصطناعي على المجتمع الحديث",
      ]),
    ).toBe(true)
  })

  it("does NOT flag a genuinely distinct title", () => {
    expect(
      isNearDuplicateTitle("رحلة في أعماق المحيط", [
        "تأثير الذكاء الاصطناعي على المجتمع",
      ]),
    ).toBe(false)
  })

  it("never flags an empty/whitespace title", () => {
    expect(isNearDuplicateTitle("   ", ["أي عنوان هنا موجود"])).toBe(false)
  })

  it("normalizes Arabic diacritics + hamza variants for matching", () => {
    // diacritized vs plain → identical token sets
    expect([...normalizeTitleTokens("الذَّكاء")]).toEqual([...normalizeTitleTokens("الذكاء")])
    // أ / إ / آ → bare alef ا
    expect([...normalizeTitleTokens("أثر التقنية")]).toEqual([...normalizeTitleTokens("اثر التقنية")])
    // a diacritized / hamza-variant seed is still caught by the dedup
    expect(
      isNearDuplicateTitle("تأثير الذكاء الاصطناعي على المجتمع", [
        "تاثير الذكاء الاصطناعي على المجتمع الحديث",
      ]),
    ).toBe(true)
  })

  it("jaccard is symmetric and bounded", () => {
    const a = normalizeTitleTokens("الخوف من الفشل")
    const b = normalizeTitleTokens("الخوف من النجاح")
    const s = jaccardSimilarity(a, b)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(1)
    expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a))
  })
})
