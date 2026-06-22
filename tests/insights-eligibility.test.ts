import { describe, it, expect } from "vitest"
import { isInsightEligible } from "@/lib/preparation/v2/insights"
import type {
  PrepV2Question,
  QuestionType,
  QuestionPriority,
} from "@/lib/preparation/v2/types"

function q(
  types: QuestionType[],
  priority: QuestionPriority = "if_time",
): PrepV2Question {
  return {
    id: "q",
    section: "conflict",
    text: "...?",
    types,
    priority,
    purpose: "",
    follow_up_prompt: "",
    risk_level: "low",
  }
}

describe("isInsightEligible", () => {
  it("enriches factual / philosophical / confrontational / reflective questions", () => {
    expect(isInsightEligible(q(["factual"]))).toBe(true)
    expect(isInsightEligible(q(["philosophical"]))).toBe(true)
    expect(isInsightEligible(q(["confrontational"]))).toBe(true)
    expect(isInsightEligible(q(["reflective"]))).toBe(true)
  })

  it("skips a purely emotional/personal moment (facts intrude there)", () => {
    expect(isInsightEligible(q(["emotional"]))).toBe(false)
    expect(isInsightEligible(q(["personal"]))).toBe(false)
    expect(isInsightEligible(q(["emotional", "personal"]))).toBe(false)
  })

  it("vetoes a purely emotional moment even when must_ask (safety wins)", () => {
    expect(isInsightEligible(q(["emotional"], "must_ask"))).toBe(false)
    expect(isInsightEligible(q(["personal"], "must_ask"))).toBe(false)
  })

  it("enriches a mixed question that has at least one eligible type", () => {
    expect(isInsightEligible(q(["emotional", "factual"]))).toBe(true)
  })
})
