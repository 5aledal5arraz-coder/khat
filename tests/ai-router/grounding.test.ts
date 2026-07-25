/**
 * Mandatory grounding contract — the guarantee that research-grade output is
 * traceable to retrieved sources rather than to the model's memory.
 *
 * Pure-function scope: contract pre-flight, citation collection, and output
 * verification. The router wiring (pre-flight throw, directive injection,
 * failed-run bookkeeping) is asserted through the registry flag below and
 * exercised end-to-end by the preparation research pipeline.
 */

import { describe, expect, it } from "vitest"
import {
  assertGroundingContract,
  collectCitedSourceIds,
  verifyGroundedOutput,
  GroundingContractError,
  MANDATORY_GROUNDING_DIRECTIVE,
  UNGROUNDED_ERROR_CLASS,
} from "@/lib/ai-router/grounding"
import { DEFAULT_MODELS } from "@/lib/ai-router/registry"

describe("registry policy", () => {
  it("marks `research` as grounding-required (terra scores below zero on AA-Omniscience)", () => {
    expect(DEFAULT_MODELS.research.requiresGrounding).toBe(true)
    expect(DEFAULT_MODELS.research.modelName).toBe("gpt-5.6-terra")
  })

  it("does not impose the contract on kinds that don't retrieve", () => {
    expect(DEFAULT_MODELS.structural.requiresGrounding).toBeUndefined()
    expect(DEFAULT_MODELS.editorial.requiresGrounding).toBeUndefined()
  })
})

describe("assertGroundingContract", () => {
  it("throws when a grounding-required call declares nothing at all", () => {
    expect(() => assertGroundingContract("research", undefined)).toThrow(
      GroundingContractError,
    )
  })

  it("throws when the corpus is empty — no sources means no research call", () => {
    expect(() =>
      assertGroundingContract("research", { mode: "required", sourceIds: [] }),
    ).toThrow(GroundingContractError)
  })

  it("throws when an exemption carries no written reason", () => {
    expect(() =>
      assertGroundingContract("research", { mode: "exempt", reason: "  " }),
    ).toThrow(GroundingContractError)
  })

  it("accepts a corpus and a reasoned exemption", () => {
    expect(
      assertGroundingContract("research", { mode: "required", sourceIds: [1, 2] }),
    ).toEqual({ mode: "required", sourceIds: [1, 2] })
    expect(
      assertGroundingContract("research", {
        mode: "exempt",
        reason: "benchmark fixture",
      }).mode,
    ).toBe("exempt")
  })

  it("names the task kind in the error so the caller knows what to fix", () => {
    try {
      assertGroundingContract("research", undefined)
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(GroundingContractError)
      expect((err as GroundingContractError).taskKind).toBe("research")
      expect((err as Error).message).toContain("research")
    }
  })
})

describe("collectCitedSourceIds", () => {
  it("finds citations anywhere in the tree, whatever the output shape", () => {
    const parsed = {
      claims: [{ claim: "أ", source_ids: [1, 2] }],
      quotes: [{ text: "ب", source_ids: [3] }],
      nested: { deep: [{ extra: { source_id: 4 } }] },
    }
    expect(collectCitedSourceIds(parsed).sort()).toEqual(["1", "2", "3", "4"])
  })

  it("normalises numeric and string ids to the same space", () => {
    expect(collectCitedSourceIds({ a: { source_ids: [1, "2"] } })).toEqual([
      "1",
      "2",
    ])
  })

  it("returns nothing for output with no citations at all", () => {
    expect(collectCitedSourceIds({ claims: [{ claim: "أ" }] })).toEqual([])
    expect(collectCitedSourceIds(null)).toEqual([])
    expect(collectCitedSourceIds("نص")).toEqual([])
  })
})

describe("verifyGroundedOutput", () => {
  const corpus = [1, 2, 3]

  it("accepts output whose every citation resolves to the corpus", () => {
    const v = verifyGroundedOutput(
      { claims: [{ claim: "أ", source_ids: [1, 3] }] },
      corpus,
    )
    expect(v.ok).toBe(true)
    expect(v.citedCount).toBe(2)
  })

  it("rejects an answer with zero citations — the from-memory failure mode", () => {
    const v = verifyGroundedOutput(
      { claims: [{ claim: "ادعاء واثق بلا مصدر" }] },
      corpus,
    )
    expect(v.ok).toBe(false)
    expect(v.citedCount).toBe(0)
    expect(v.reason).toContain("لا يستشهد")
  })

  it("rejects a fabricated source id even when other citations are valid", () => {
    const v = verifyGroundedOutput(
      {
        claims: [
          { claim: "أ", source_ids: [1] },
          { claim: "ب", source_ids: [99] },
        ],
      },
      corpus,
    )
    expect(v.ok).toBe(false)
    expect(v.unknownIds).toEqual(["99"])
    expect(v.reason).toContain("99")
  })

  it("rejects empty source_ids arrays as uncited", () => {
    const v = verifyGroundedOutput({ claims: [{ claim: "أ", source_ids: [] }] }, corpus)
    expect(v.ok).toBe(false)
    expect(v.citedCount).toBe(0)
  })

  it("matches string ids against a numeric corpus", () => {
    expect(
      verifyGroundedOutput({ a: { source_ids: ["2"] } }, corpus).ok,
    ).toBe(true)
  })
})

describe("MANDATORY_GROUNDING_DIRECTIVE", () => {
  it("forbids internal knowledge and makes abstention the correct answer", () => {
    expect(MANDATORY_GROUNDING_DIRECTIVE).toContain("معرفتك الداخلية ليست مصدراً")
    expect(MANDATORY_GROUNDING_DIRECTIVE).toContain("الامتناع صحيح")
    expect(MANDATORY_GROUNDING_DIRECTIVE).toContain("source_ids")
  })
})

describe("UNGROUNDED_ERROR_CLASS", () => {
  it("is a stable string downstream code can branch on", () => {
    expect(UNGROUNDED_ERROR_CLASS).toBe("ungrounded_output")
  })
})
