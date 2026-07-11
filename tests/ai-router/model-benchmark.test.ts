/**
 * Model benchmark suite — pure/offline (no network, no DB).
 *
 *   1. Fixtures — deterministic, planted facts actually present.
 *   2. Programmatic graders — extraction / long-context / consistency
 *      score exactly against the planted facts.
 *   3. Pairwise judge math — win share with position-bias cancelling.
 *   4. Scorecard aggregation + threshold decision — all three upgrade
 *      paths and the keep-current gates.
 *   5. Tier heuristics — candidate suffix → tier → baseline.
 */

import { describe, expect, it } from "vitest"
import {
  buildMediumTranscript,
  buildLongDocument,
  PLANTED_QUOTES,
  NEEDLES,
} from "@/lib/ai-router/benchmark/fixtures"
import {
  gradeExtraction,
  gradeConsistency,
  gradeLongContext,
  candidateWinShare,
  buildScorecard,
  decide,
  normalizeArabic,
  DEFAULT_THRESHOLDS,
  JUDGED_WEIGHTS,
  PROGRAMMATIC_WEIGHTS,
} from "@/lib/ai-router/benchmark/scoring"
import { tierForCandidate, tierBaselineModel } from "@/lib/ai-router/benchmark/run"
import { FALLBACK_CHAINS } from "@/lib/ai-router/registry"

describe("fixtures", () => {
  it("medium transcript is deterministic and contains all planted quotes", () => {
    const t1 = buildMediumTranscript()
    expect(t1).toBe(buildMediumTranscript())
    for (const q of PLANTED_QUOTES) expect(t1).toContain(q)
    expect(t1.length).toBeGreaterThan(4000)
  })

  it("long document contains every needle and is genuinely long", () => {
    const doc = buildLongDocument()
    expect(doc).toBe(buildLongDocument())
    expect(doc.length).toBeGreaterThan(30_000)
    for (const n of NEEDLES) expect(doc).toContain(n.text)
    // n4 (السنونو) must appear before n5 (الميزانية) — ORDER_QUESTION ground truth.
    expect(doc.indexOf(NEEDLES[3].text)).toBeLessThan(doc.indexOf(NEEDLES[4].text))
  })
})

describe("programmatic graders", () => {
  const perfectExtraction = {
    guest_name: "د. سالم الراشد",
    chapters: [{ title: "أ" }, { title: "ب" }, { title: "ج" }, { title: "د" }],
    quotes: [...PLANTED_QUOTES],
  }

  it("extraction: perfect output scores 100, garbage scores 0", () => {
    expect(gradeExtraction(perfectExtraction)).toBe(100)
    expect(gradeExtraction(null)).toBe(0)
    expect(gradeExtraction("نص حر")).toBe(0)
  })

  it("extraction: partial quote recall scores partially", () => {
    const partial = { ...perfectExtraction, quotes: [PLANTED_QUOTES[0]] }
    const s = gradeExtraction(partial)
    expect(s).toBeGreaterThan(50)
    expect(s).toBeLessThan(100)
  })

  it("extraction: normalization tolerates diacritics and digit style", () => {
    const withDiacritics = {
      ...perfectExtraction,
      quotes: [PLANTED_QUOTES[0].replace("النجاح", "النَّجاح"), PLANTED_QUOTES[1], PLANTED_QUOTES[2]],
    }
    expect(gradeExtraction(withDiacritics)).toBe(100)
    expect(normalizeArabic("٤٧٢١")).toBe("4721")
  })

  it("long-context: full recall + order = 100, empty = 0", () => {
    const perfect = { answers: [...NEEDLES.map((n) => `الجواب: ${n.expected}`), "مشروع السنونو"] }
    expect(gradeLongContext(perfect)).toBe(100)
    expect(gradeLongContext({ answers: [] })).toBe(0)
    expect(gradeLongContext(null)).toBe(0)
  })

  it("long-context: accepts Arabic-Indic digits in answers", () => {
    const answers = [...NEEDLES.map((n) => n.expected.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])), "السنونو"]
    expect(gradeLongContext({ answers })).toBe(100)
  })

  it("consistency: identical valid runs → 100; all invalid → 0; mixed penalized", () => {
    const runs = [perfectExtraction, perfectExtraction, perfectExtraction]
    expect(gradeConsistency(runs)).toBe(100)
    expect(gradeConsistency([null, null, null])).toBe(0)
    const mixed = gradeConsistency([perfectExtraction, null, perfectExtraction])
    expect(mixed).toBeGreaterThan(30)
    expect(mixed).toBeLessThan(100)
  })
})

describe("pairwise judge math", () => {
  it("candidate sweeping both orders = 1; losing both = 0", () => {
    expect(candidateWinShare("A", "B")).toBe(1) // cand is A in call1, B in call2
    expect(candidateWinShare("B", "A")).toBe(0)
  })
  it("position bias cancels: winner-by-position ends at 0.5", () => {
    // Judge always picks whatever sits in slot A.
    expect(candidateWinShare("A", "A")).toBe(0.5)
    expect(candidateWinShare("tie", "tie")).toBe(0.5)
    expect(candidateWinShare("A", "tie")).toBe(0.75)
  })
})

describe("weights", () => {
  it("judged + programmatic weights sum to 1 per tier", () => {
    for (const w of Object.values(JUDGED_WEIGHTS)) {
      expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    }
    for (const w of Object.values(PROGRAMMATIC_WEIGHTS)) {
      expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    }
  })
})

describe("scorecard + decision", () => {
  const baseInput = {
    tier: "flagship" as const,
    judged: { discovery: 0.75, editorial: 0.75, research: 0.5 },
    programmatic: {
      extraction: { baseline: 80, candidate: 85 },
      long_context: { baseline: 84, candidate: 90 },
      consistency: { baseline: 90, candidate: 92 },
    },
    measured: {
      cost: { baseline: 1.0, candidate: 1.1 },
      latencyMs: { baseline: 8000, candidate: 9000 },
      tokensOut: { baseline: 10_000, candidate: 9_000 },
    },
  }

  it("aggregates: quality_net, deltas, ratios computed correctly", () => {
    const { aggregates, dimensions } = buildScorecard(baseInput)
    // (0.75-0.5)*200*0.4 + (0.75-0.5)*200*0.4 + 0*0.2 = 40
    expect(aggregates.quality_net).toBeCloseTo(40, 5)
    expect(aggregates.cost_delta_pct).toBeCloseTo(10, 5)
    expect(aggregates.latency_delta_pct).toBeCloseTo(12.5, 5)
    expect(aggregates.token_ratio).toBeCloseTo(0.9, 5)
    expect(dimensions).toHaveLength(9)
  })

  it("quality-led upgrade when net preference clears the bar and gates pass", () => {
    const { aggregates } = buildScorecard(baseInput)
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("upgrade")
    expect(d.rule).toBe("quality_led")
  })

  it("keep_current when quality is flat", () => {
    const { aggregates } = buildScorecard({
      ...baseInput,
      judged: { discovery: 0.5, editorial: 0.5, research: 0.5 },
      programmatic: {
        extraction: { baseline: 80, candidate: 81 },
        long_context: { baseline: 84, candidate: 84 },
        consistency: { baseline: 90, candidate: 90 },
      },
    })
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("keep_current")
    expect(d.reasons.length).toBeGreaterThan(0)
  })

  it("latency gate blocks an otherwise-winning candidate", () => {
    const { aggregates } = buildScorecard({
      ...baseInput,
      measured: { ...baseInput.measured, latencyMs: { baseline: 8000, candidate: 16_000 } },
    })
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("keep_current")
    expect(d.reasons.join(" ")).toContain("زمن الاستجابة")
  })

  it("cost-led upgrade: much cheaper with no quality loss", () => {
    const { aggregates } = buildScorecard({
      ...baseInput,
      judged: { discovery: 0.5, editorial: 0.5, research: 0.55 },
      measured: { ...baseInput.measured, cost: { baseline: 1.0, candidate: 0.4 } },
    })
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("upgrade")
    expect(d.rule).toBe("cost_led")
  })

  it("accuracy-led upgrade for programmatic gains without judge preference", () => {
    const { aggregates } = buildScorecard({
      ...baseInput,
      tier: "efficient",
      judged: { discovery: 0.5, editorial: 0.5, research: 0.5 },
      programmatic: {
        extraction: { baseline: 70, candidate: 85 },
        long_context: { baseline: 70, candidate: 82 },
        consistency: { baseline: 85, candidate: 90 },
      },
    })
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("upgrade")
    expect(d.rule).toBe("accuracy_led")
  })

  it("consistency floor blocks upgrades", () => {
    const { aggregates } = buildScorecard({
      ...baseInput,
      programmatic: {
        ...baseInput.programmatic,
        consistency: { baseline: 92, candidate: 70 },
      },
    })
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("keep_current")
    expect(d.reasons.join(" ")).toContain("ثبات")
  })

  it("unknown cost doesn't block a quality-led upgrade but is surfaced", () => {
    const { aggregates, dimensions } = buildScorecard({
      ...baseInput,
      measured: { ...baseInput.measured, cost: { baseline: null, candidate: null } },
    })
    expect(dimensions.find((d) => d.key === "cost")?.note).toBeTruthy()
    const d = decide(aggregates, DEFAULT_THRESHOLDS)
    expect(d.recommendation).toBe("upgrade")
  })
})

describe("tier heuristics", () => {
  it("maps candidate suffixes to tiers and baselines to chain heads", () => {
    expect(tierForCandidate("gpt-5.7-luna")).toBe("efficient")
    expect(tierForCandidate("gpt-5.7-mini")).toBe("efficient")
    expect(tierForCandidate("gpt-5.7-terra")).toBe("balanced")
    expect(tierForCandidate("gpt-5.7-sol")).toBe("flagship")
    expect(tierForCandidate("gpt-6")).toBe("flagship")
    expect(tierBaselineModel("flagship")).toBe(FALLBACK_CHAINS.editorial[0])
    expect(tierBaselineModel("balanced")).toBe(FALLBACK_CHAINS.research[0])
    expect(tierBaselineModel("efficient")).toBe(FALLBACK_CHAINS.structural[0])
  })
})
