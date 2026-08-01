/**
 * Grounding-budget selection — measured on the REAL reference preparation.
 *
 * Context: `MAX_GROUNDING_CANDIDATES` was cut 30 → 15 (Khaled, 2026-08-01) to
 * halve grounding cost. But selection was `drafted.slice(0, 15)` and the
 * drafts arrive concatenated in SECTION ORDER, so halving the budget did not
 * halve the quality evenly — it deleted the late sections outright. This file
 * measures that, and measures the replacement.
 *
 * The fixture is the question bank of `2fdb6a84-b8e5-4ae3-9630-c12d820fa5b4`
 * — the only genuine `prep_v2` run in this database (28 questions, $0.8105),
 * read out of the local DB on 2026-08-01. Section + priority are reproduced
 * verbatim; the ids are shortened, since nothing under test reads their shape.
 *
 * NO AI CALLS AND NO DATABASE: the drafting stage is modelled the way the
 * pipeline actually shapes it (`MAX_DRAFTS_PER_QUESTION = 2` candidates per
 * eligible question, emitted section by section), so the comparison isolates
 * exactly what changed — the ORDER candidates are chosen in. The insight
 * `type` a drafting model would assign is not knowable offline, so it is held
 * constant across both arms; that makes this a measurement of the section and
 * priority effects only, which is what the change is about.
 */

import { describe, it, expect } from "vitest"
import {
  isInsightEligible,
  selectGroundingCandidates,
  scoreGroundingCandidate,
} from "@/lib/preparation/v2/insights"
import type { PrepV2Question, SectionKind } from "@/lib/preparation/v2/types"

const BUDGET = 15

/** (section, priority, types) of the reference bank, in stored order. */
const REFERENCE_BANK: Array<{
  id: string
  section: SectionKind
  priority: PrepV2Question["priority"]
  types: string[]
}> = [
  { id: "q01", section: "opening", priority: "must_ask", types: ["reflective", "personal"] },
  { id: "q02", section: "opening", priority: "must_ask", types: ["philosophical", "reflective"] },
  { id: "q03", section: "opening", priority: "must_ask", types: ["reflective", "factual"] },
  { id: "q04", section: "opening", priority: "if_time", types: ["philosophical", "factual"] },
  { id: "q05", section: "build_up", priority: "must_ask", types: ["factual", "reflective"] },
  { id: "q06", section: "build_up", priority: "must_ask", types: ["factual", "reflective"] },
  { id: "q07", section: "build_up", priority: "must_ask", types: ["factual", "reflective"] },
  { id: "q08", section: "build_up", priority: "must_ask", types: ["factual", "philosophical"] },
  { id: "q09", section: "build_up", priority: "if_time", types: ["factual", "reflective"] },
  { id: "q10", section: "conflict", priority: "must_ask", types: ["confrontational", "philosophical"] },
  { id: "q11", section: "conflict", priority: "must_ask", types: ["confrontational", "philosophical", "factual"] },
  { id: "q12", section: "conflict", priority: "must_ask", types: ["confrontational", "factual"] },
  { id: "q13", section: "conflict", priority: "must_ask", types: ["confrontational", "philosophical"] },
  { id: "q14", section: "conflict", priority: "must_ask", types: ["confrontational", "factual", "reflective"] },
  { id: "q15", section: "conflict", priority: "if_time", types: ["confrontational", "philosophical"] },
  { id: "q16", section: "deep_dive", priority: "must_ask", types: ["factual", "reflective"] },
  { id: "q17", section: "deep_dive", priority: "must_ask", types: ["factual", "confrontational"] },
  { id: "q18", section: "deep_dive", priority: "must_ask", types: ["factual", "philosophical"] },
  { id: "q19", section: "deep_dive", priority: "must_ask", types: ["factual", "reflective"] },
  { id: "q20", section: "deep_dive", priority: "must_ask", types: ["philosophical", "factual"] },
  { id: "q21", section: "deep_dive", priority: "if_time", types: ["confrontational", "factual"] },
  { id: "q22", section: "emotional_peak", priority: "must_ask", types: ["emotional", "reflective"] },
  { id: "q23", section: "emotional_peak", priority: "if_time", types: ["personal", "emotional", "reflective"] },
  { id: "q24", section: "emotional_peak", priority: "must_ask", types: ["emotional", "philosophical"] },
  { id: "q25", section: "emotional_peak", priority: "must_ask", types: ["reflective"] },
  { id: "q26", section: "resolution", priority: "must_ask", types: ["factual", "reflective"] },
  { id: "q27", section: "resolution", priority: "must_ask", types: ["factual"] },
  { id: "q28", section: "resolution", priority: "if_time", types: ["confrontational"] },
]

const SECTION_ORDER: SectionKind[] = [
  "opening",
  "build_up",
  "conflict",
  "deep_dive",
  "emotional_peak",
  "resolution",
]

type Cand = {
  question_id: string
  section: SectionKind
  type: "research"
  correction?: { inaccuracy: string; accurate: string }
}

/**
 * Reproduce the drafting stage: 2 candidates for every eligible question,
 * grouped section by section, in the order `runInsightGeneration` concatenates
 * them. `isInsightEligible` is the REAL predicate, not a copy.
 */
function draftedCandidates(): Cand[] {
  const out: Cand[] = []
  for (const section of SECTION_ORDER) {
    for (const q of REFERENCE_BANK.filter((x) => x.section === section)) {
      const eligible = isInsightEligible({
        types: q.types,
        priority: q.priority,
      } as PrepV2Question)
      if (!eligible) continue
      out.push({ question_id: q.id, section, type: "research" })
      out.push({ question_id: q.id, section, type: "research" })
    }
  }
  return out
}

const priorityMap = new Map(REFERENCE_BANK.map((q) => [q.id, q.priority] as const))

/** The behaviour that shipped before this change. */
const oldSelection = (drafted: Cand[]) => drafted.slice(0, BUDGET)

const sectionsCovered = (picked: Cand[]) => new Set(picked.map((c) => c.section)).size
const mustAskCount = (picked: Cand[]) =>
  picked.filter((c) => priorityMap.get(c.question_id) === "must_ask").length

describe("grounding selection on the reference preparation 2fdb6a84", () => {
  const drafted = draftedCandidates()

  it("the reference bank really does overflow the budget", () => {
    // Without this the comparison below would be measuring nothing: the
    // selector returns its input untouched when it already fits.
    expect(drafted.length).toBeGreaterThan(BUDGET)
  })

  it("old selection starved the late sections; new selection reaches all six", () => {
    const before = oldSelection(drafted)
    const after = selectGroundingCandidates(drafted, priorityMap, BUDGET)

    expect(before).toHaveLength(BUDGET)
    expect(after).toHaveLength(BUDGET)

    const beforeSections = sectionsCovered(before)
    const afterSections = sectionsCovered(after)

    // The measurement Khaled asked for, printed so the numbers are visible
    // in the run output and not just asserted.
    console.log(
      `[grounding-selection] drafted=${drafted.length} budget=${BUDGET}\n` +
        `  BEFORE: sections=${beforeSections}/${SECTION_ORDER.length} ` +
        `must_ask=${mustAskCount(before)}/${BUDGET}\n` +
        `  AFTER : sections=${afterSections}/${SECTION_ORDER.length} ` +
        `must_ask=${mustAskCount(after)}/${BUDGET}`,
    )

    expect(afterSections).toBe(SECTION_ORDER.length)
    expect(afterSections).toBeGreaterThan(beforeSections)
  })

  it("new selection never grounds fewer must_ask questions than the old one", () => {
    const before = oldSelection(drafted)
    const after = selectGroundingCandidates(drafted, priorityMap, BUDGET)
    // Coverage must not be bought by demoting the questions the host is
    // certain to ask.
    expect(mustAskCount(after)).toBeGreaterThanOrEqual(mustAskCount(before))
  })

  it("is deterministic — same input, same picks", () => {
    const a = selectGroundingCandidates(drafted, priorityMap, BUDGET)
    const b = selectGroundingCandidates(drafted, priorityMap, BUDGET)
    expect(a.map((c) => c.question_id)).toEqual(b.map((c) => c.question_id))
  })

  it("returns the input untouched when it fits inside the budget", () => {
    const few = drafted.slice(0, 5)
    expect(selectGroundingCandidates(few, priorityMap, BUDGET)).toBe(few)
  })
})

describe("scoreGroundingCandidate weights", () => {
  const q: Cand = { question_id: "q01", section: "opening", type: "research" }

  it("ranks a must_ask candidate above an if_time one", () => {
    expect(scoreGroundingCandidate(q, "must_ask")).toBeGreaterThan(
      scoreGroundingCandidate(q, "if_time"),
    )
  })

  it("ranks a correction above a plain card on the same question", () => {
    const correction = {
      ...q,
      type: "correction" as const,
      correction: { inaccuracy: "x", accurate: "y" },
    }
    expect(scoreGroundingCandidate(correction, "if_time")).toBeGreaterThan(
      scoreGroundingCandidate(q, "if_time"),
    )
  })

  it("treats an unknown question id as lowest priority rather than throwing", () => {
    expect(scoreGroundingCandidate(q, undefined)).toBeLessThan(
      scoreGroundingCandidate(q, "must_ask"),
    )
  })
})
