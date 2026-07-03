/**
 * Corpus novelty at selection time (Phase B4). Pure — no DB, no LLM.
 *   1. corpusProximity: nearest-saturated + nearest-white-space similarity.
 *   2. selectByPotential prefers a WHITE-SPACE candidate over a SATURATED one
 *      when episode potential is otherwise equal (the objective grounding that
 *      replaced the prompt-injection, which primed the model toward saturation).
 */

import { describe, expect, it } from "vitest"
import { corpusProximity, maxSimilarity } from "@/lib/corpus/novelty"
import { selectByPotential } from "@/lib/khat-map/v2/select-by-potential"
import type { ScoredCandidate } from "@/lib/khat-map/v2/types"

describe("corpusProximity", () => {
  it("returns zeros when there are no refs", () => {
    expect(corpusProximity([1, 0, 0], null)).toEqual({ saturation: 0, whitespace: 0 })
    expect(corpusProximity(null, { saturated: [[1, 0, 0]], whiteSpace: [] })).toEqual({
      saturation: 0,
      whitespace: 0,
    })
  })

  it("measures nearest-centroid similarity per set", () => {
    const refs = { saturated: [[1, 0, 0]], whiteSpace: [[0, 1, 0]] }
    const onSaturated = corpusProximity([1, 0, 0], refs)
    expect(onSaturated.saturation).toBeCloseTo(1, 5)
    expect(onSaturated.whitespace).toBeCloseTo(0, 5)

    const onWhiteSpace = corpusProximity([0, 1, 0], refs)
    expect(onWhiteSpace.whitespace).toBeCloseTo(1, 5)
    expect(onWhiteSpace.saturation).toBeCloseTo(0, 5)
  })

  it("maxSimilarity takes the closest centroid and ignores dim mismatches", () => {
    expect(maxSimilarity([1, 0], [[0, 1], [1, 0], [9, 9, 9]])).toBeCloseTo(1, 5)
    expect(maxSimilarity([1, 0], [])).toBe(0)
  })
})

function scored(title: string, score: number, corpus?: { sat?: number; ws?: number }): ScoredCandidate {
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
        topic_domain: "none",
        topic_angle_code: null,
        main_axes: [],
        suggested_questions: [],
        risk_level: null,
        effort_level: null,
        sponsor_appeal: null,
        category: null,
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
    corpus_saturation: corpus?.sat,
    corpus_whitespace: corpus?.ws,
  }
}

describe("selectByPotential — corpus novelty", () => {
  const opts = { size: 1, seasonCap: 99, acceptedByCategory: {} }

  it("prefers white-space over saturated at equal potential", () => {
    const saturated = scored("saturated-topic", 8.0, { sat: 0.9 })
    const whiteSpace = scored("whitespace-topic", 8.0, { ws: 0.9 })
    const { picks } = selectByPotential([saturated, whiteSpace], opts)
    expect(picks[0].raw.topic.working_title).toBe("whitespace-topic")
  })

  it("does not override a clearly stronger topic", () => {
    // A much stronger topic wins even if it sits in saturated territory.
    const strongSaturated = scored("strong", 9.5, { sat: 0.9 })
    const weakWhiteSpace = scored("weak", 6.0, { ws: 0.9 })
    const { picks } = selectByPotential([strongSaturated, weakWhiteSpace], opts)
    expect(picks[0].raw.topic.working_title).toBe("strong")
  })
})
