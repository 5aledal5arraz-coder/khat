/**
 * A grounding-provider outage must not be recorded as "every claim refuted".
 *
 * `groundClaim` used to map ANY search/verifier error to `weak` — the same
 * verdict as a genuinely unsupported claim — so a Gemini outage (spend-cap
 * 429s, as on 2026-08) produced `outcome: "ok", kept: 0` and the review tab
 * rendered nothing. The counters now separate the two, and an outage-dominated
 * run is `degraded`.
 *
 * No real AI: the router and Gemini are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { runAiTask, geminiSearchWeb, geminiJson } = vi.hoisted(() => ({
  runAiTask: vi.fn(),
  geminiSearchWeb: vi.fn(),
  geminiJson: vi.fn(),
}))

vi.mock("@/lib/ai-router", () => ({ runAiTask }))
vi.mock("@/lib/ai/preparation/research/gemini", () => ({
  geminiSearchWeb,
  geminiJson,
  isGeminiConfigured: () => true,
}))

import { runInsightGeneration, insightOutcome } from "@/lib/preparation/v2/insights"
import type { PrepV2Payload, PrepV2Question } from "@/lib/preparation/v2/types"

function q(id: string): PrepV2Question {
  return {
    id,
    section: "conflict",
    text: `سؤال ${id}`,
    types: ["factual"],
    priority: "must_ask",
    purpose: "p",
    follow_up_prompt: "f",
    risk_level: "low",
  } as PrepV2Question
}

const questions = [q("q1"), q("q2"), q("q3"), q("q4")]
const payload = {
  thesis: "t",
  axes_of_tension: [],
  episode_sections: [],
  question_bank: questions,
} as unknown as PrepV2Payload

function draftOneCardPerQuestion() {
  runAiTask.mockResolvedValue({
    status: "succeeded",
    runId: "run-1",
    parsed: {
      insights: questions.map((x) => ({
        question_id: x.id,
        type: "fact",
        text: `حقيقة قابلة للتحقق عن ${x.id}`,
        timing: "during",
        verify_query: `claim ${x.id}`,
      })),
    },
  })
}

const SOURCE = { url: "https://example.org/a", title: "A", snippet: "s" }

const input = {
  language: "ar" as const,
  preparation_id: "prep-1",
  eir_id: null,
  payload,
  guestName: null,
}

beforeEach(() => {
  runAiTask.mockReset()
  geminiSearchWeb.mockReset()
  geminiJson.mockReset()
  draftOneCardPerQuestion()
})

describe("insight grounding: provider errors are counted, not read as refutations", () => {
  it("search provider down for every claim → grounding_failed = all, outcome degraded", async () => {
    geminiSearchWeb.mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED spend cap"))
    const r = await runInsightGeneration(input)
    expect(r.ok).toBe(true)
    expect(r.stats.kept).toBe(0)
    expect(r.stats.grounded).toBe(4)
    expect(r.stats.grounding_failed).toBe(4)
    expect(insightOutcome(r)).toBe("degraded")
  })

  it("verifier down counts as a grounding failure too", async () => {
    geminiSearchWeb.mockResolvedValue([SOURCE])
    geminiJson.mockRejectedValue(new Error("503 unavailable"))
    const r = await runInsightGeneration(input)
    expect(r.stats.grounding_failed).toBe(4)
    expect(insightOutcome(r)).toBe("degraded")
  })

  it("genuinely refuted claims are NOT failures (negative control) → outcome ok, 0 failed", async () => {
    geminiSearchWeb.mockResolvedValue([SOURCE])
    geminiJson.mockResolvedValue({ verdict: "refuted", supporting_source_indices: [], note: "" })
    const r = await runInsightGeneration(input)
    expect(r.stats.kept).toBe(0)
    expect(r.stats.grounding_failed).toBe(0)
    expect(insightOutcome(r)).toBe("ok")
  })

  it("a minority of errors stays ok but is still counted", async () => {
    geminiSearchWeb
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue([SOURCE])
    geminiJson.mockResolvedValue({ verdict: "supported", supporting_source_indices: [0], note: "" })
    const r = await runInsightGeneration(input)
    expect(r.stats.grounding_failed).toBe(1)
    expect(r.stats.kept).toBe(3)
    expect(insightOutcome(r)).toBe("ok")
  })
})
