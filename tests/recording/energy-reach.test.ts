/**
 * What the energy indicator can and cannot reach.
 *
 * Two properties, both behind Khaled's "the indicator has no effect on the
 * episode":
 *
 *   1. the hero PIN — the question on screen must survive a re-rank, which is
 *      what makes approving a director's cue safe;
 *   2. REACH HONESTY — measured on the real prep, four of the six sections hold
 *      no sharp question at all (an editorial choice, not a bug), so in those
 *      the dial genuinely cannot reorder anything and the screen has to say so
 *      rather than let the host discover it by moving the dial into silence.
 */

import { describe, expect, it } from "vitest"
import { rankQuestionsByEnergy, sectionRespondsToEnergy } from "@/lib/recording-v2/energy"
import { resolveHero } from "@/lib/recording-v2/energy-handshake"
import type {
  PrepV2Question,
  QuestionPriority,
  QuestionRiskLevel,
  QuestionType,
} from "@/lib/preparation/v2/types"

function q(
  id: string,
  types: QuestionType[],
  risk: QuestionRiskLevel = "low",
  priority: QuestionPriority = "if_time",
): PrepV2Question {
  return {
    id,
    section: "opening",
    text: `نص ${id}`,
    types,
    priority,
    purpose: "",
    follow_up_prompt: "",
    risk_level: risk,
  }
}

describe("resolveHero — the pin survives a re-rank", () => {
  const hot = q("hot", ["confrontational"], "high")
  const calm = q("calm", ["reflective"], "low")
  const mid = q("mid", ["personal"], "medium")
  const bank = [hot, calm, mid]

  it("keeps the SAME question on screen through every band — this is approval", () => {
    // Approving a cue re-ranks the deck. With the on-screen question pinned
    // first, the hero cannot move: only the "next up" row changes.
    for (const band of ["low", "medium", "high"] as const) {
      const ranked = rankQuestionsByEnergy(bank, band)
      expect(resolveHero(ranked, "calm")?.id).toBe("calm")
    }
  })

  it("follows the ranking when nothing is pinned", () => {
    expect(resolveHero(rankQuestionsByEnergy(bank, "low"), null)?.id).toBe("hot")
    expect(resolveHero(rankQuestionsByEnergy(bank, "high"), null)?.id).toBe("calm")
  })

  it("falls back to the top when the pinned question is gone (asked/answered)", () => {
    const remaining = rankQuestionsByEnergy([hot, mid], "low")
    expect(resolveHero(remaining, "calm")?.id).toBe("hot")
  })

  it("returns null on an empty section instead of throwing", () => {
    expect(resolveHero([], "anything")).toBeNull()
  })
})

describe("sectionRespondsToEnergy — say it when the dial cannot reach", () => {
  it("is FALSE for a section with no intensity contrast", () => {
    // The shape of four of the six real sections: same types, same risk.
    const flat = [
      q("a", ["factual"], "low"),
      q("b", ["factual"], "low"),
      q("c", ["factual"], "low"),
    ]
    expect(sectionRespondsToEnergy(flat)).toBe(false)
  })

  it("is FALSE for a section of one question — nothing to reorder", () => {
    expect(sectionRespondsToEnergy([q("only", ["confrontational"], "high")])).toBe(false)
  })

  it("is TRUE for a mixed section — the dial really does reorder it", () => {
    const mixed = [
      q("calm", ["reflective"], "low"),
      q("hot", ["confrontational"], "high"),
    ]
    expect(sectionRespondsToEnergy(mixed)).toBe(true)
    expect(rankQuestionsByEnergy(mixed, "low")[0].id).toBe("hot")
    expect(rankQuestionsByEnergy(mixed, "high")[0].id).toBe("calm")
  })

  it("ignores questions already asked — it answers about what is LEFT", () => {
    const mixed = [
      q("calm", ["reflective"], "low"),
      q("hot", ["confrontational"], "high"),
      q("calm2", ["reflective"], "low"),
    ]
    expect(sectionRespondsToEnergy(mixed)).toBe(true)
    // Once the only sharp question is asked, the rest are homogeneous again.
    expect(sectionRespondsToEnergy(mixed, (id) => id === "hot")).toBe(false)
  })

  it("is FALSE when contrast exists but priority pins the order at every grade", () => {
    // must_ask outranks energy, so a single must_ask + a single if_time can
    // never swap however the dial moves. Claiming otherwise would be the same
    // lie in a smaller box.
    const pinned = [
      q("must", ["reflective"], "low", "must_ask"),
      q("hot", ["confrontational"], "high", "if_time"),
    ]
    expect(sectionRespondsToEnergy(pinned)).toBe(false)
  })
})
