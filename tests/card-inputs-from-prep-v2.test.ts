/**
 * `cardInputsFromPrepV2` — the prep_v2 → interview_cards adapter.
 *
 * Wave 1 fixed the GATE (`hasCardQuestionSource`: the "توليد البطاقات" button
 * was permanently disabled because it asked whether the dead prep-V1 column
 * `question_system` was populated). Noura's review pointed out that only the
 * gate was covered: this function, which decides what every generated card
 * actually CONTAINS — bucket, Arabic section label, follow-ups, and the three
 * content-potential flags — had no test at all. Opening the gate onto an
 * untested adapter just moves where the damage happens.
 *
 * Pure function, no DB: it is exported from `lib/ai/interview-cards.ts` for
 * exactly this reason. The flags mirror the v1 path's `bucket`-based
 * derivation on purpose — a card's content potential must not depend on which
 * generator produced it.
 */

import { describe, it, expect } from "vitest"
import { cardInputsFromPrepV2 } from "@/lib/ai/interview-cards"
import { QUESTION_PRIORITIES, SECTION_KINDS } from "@/lib/preparation/v2/types"
import type { InterviewCardBucket } from "@/types/collaboration"
import type {
  PrepV2Question,
  QuestionPriority,
  SectionKind,
} from "@/lib/preparation/v2/types"

const PREP = "prep-1"

/**
 * The expected label and bucket for EVERY section kind, written out.
 *
 * Wave 2 §3 — Noura swapped the «الافتتاح» text for «الخاتمة» in the
 * implementation and all 23 tests here stayed green: four of the six Arabic
 * labels had no assertion at all, only a `/[ء-ي]/` "is it Arabic" check that
 * any Arabic string satisfies. These cards are printed on the host's screen
 * during a LIVE recording, so a mislabelled section reaches the air, not an
 * admin panel.
 *
 * `Record<SectionKind, …>` makes a seventh section kind a compile error here,
 * and `covers exactly SECTION_KINDS` below makes it a test failure at runtime
 * too — so the table cannot quietly fall behind the enum.
 */
const EXPECTED: Record<
  SectionKind,
  { label: string; bucket: InterviewCardBucket }
> = {
  opening: { label: "افتتاحية", bucket: "opening" },
  build_up: { label: "بناء التوتر", bucket: "deep" },
  conflict: { label: "المواجهة", bucket: "escalation" },
  deep_dive: { label: "الغوص العميق", bucket: "deep" },
  emotional_peak: { label: "الذروة العاطفية", bucket: "escalation" },
  resolution: { label: "الخاتمة", bucket: "deep" },
}

function q(over: Partial<PrepV2Question> = {}): PrepV2Question {
  return {
    id: "q1",
    section: "deep_dive",
    text: "ليش قررت تترك الوظيفة الحكومية بعد خمستعشر سنة؟",
    types: ["philosophical"],
    priority: "must_ask",
    purpose: "يفتح باب القرار المفصلي",
    follow_up_prompt: "وشلون كان رد فعل أهلك؟",
    risk_level: "low",
    ...over,
  }
}

describe("the EXPECTED table itself stays in step with the enum", () => {
  it("covers exactly SECTION_KINDS — no more, no fewer", () => {
    // The previous version of the coverage test hardcoded its own list of six
    // and then asserted `typeof bucket === "string"`, which is true of every
    // possible return value. It could not fail. This one is driven off the
    // exported enum, so a seventh kind breaks it instead of slipping through
    // the implementation's `?? "deep"` guard (and with it quote_potential).
    expect(Object.keys(EXPECTED).sort()).toEqual([...SECTION_KINDS].sort())
  })

  it("gives every section a DISTINCT Arabic label", () => {
    // The specific failure mode: two sections printing the same words on the
    // host's screen. A swap between them would otherwise be undetectable.
    const labels = Object.values(EXPECTED).map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe("cardInputsFromPrepV2 — section → bucket", () => {
  it.each(SECTION_KINDS)("maps section %s to its deliberate bucket", (section) => {
    const [card] = cardInputsFromPrepV2(PREP, [q({ section })])
    expect(card.bucket).toBe(EXPECTED[section].bucket)
  })

  it("assigns every SectionKind a bucket in one pass, in order", () => {
    const cards = cardInputsFromPrepV2(
      PREP,
      SECTION_KINDS.map((section, i) => q({ id: `q${i}`, section })),
    )
    expect(cards).toHaveLength(SECTION_KINDS.length)
    expect(cards.map((c) => c.bucket)).toEqual(
      SECTION_KINDS.map((s) => EXPECTED[s].bucket),
    )
  })

  it("sends if_time questions to the backup bucket whatever their section", () => {
    // "احتياطي" is exactly what if_time means — the host reaches for these
    // only when the conversation leaves room. Section must not override it.
    const cards = cardInputsFromPrepV2(PREP, [
      q({ id: "a", section: "conflict", priority: "if_time" }),
      q({ id: "b", section: "opening", priority: "if_time" }),
    ])
    expect(cards.map((c) => c.bucket)).toEqual(["backup", "backup"])
  })

  it("does NOT send must_ask questions to backup", () => {
    // `QUESTION_PRIORITIES` is exactly ["must_ask", "if_time"], so this is the
    // complete other side of the rule above — asserted off the constant so a
    // third priority added later shows up here as a compile error, not as a
    // silent gap.
    const others = QUESTION_PRIORITIES.filter(
      (p): p is QuestionPriority => p !== "if_time",
    )
    expect(others).toEqual(["must_ask"])
    for (const priority of others) {
      const [card] = cardInputsFromPrepV2(PREP, [
        q({ section: "conflict", priority }),
      ])
      expect(card.bucket, priority).toBe("escalation")
    }
  })
})

describe("cardInputsFromPrepV2 — content-potential flags", () => {
  const flagsFor = (section: SectionKind) => {
    const [c] = cardInputsFromPrepV2(PREP, [q({ section })])
    return {
      clip: c.clip_potential,
      quote: c.quote_potential,
      peak: c.emotional_peak,
    }
  }

  it("marks escalation questions as clip + quote + peak", () => {
    expect(flagsFor("conflict")).toEqual({ clip: true, quote: true, peak: true })
    expect(flagsFor("emotional_peak")).toEqual({
      clip: true,
      quote: true,
      peak: true,
    })
  })

  it("marks deep questions as quote-only", () => {
    expect(flagsFor("deep_dive")).toEqual({
      clip: false,
      quote: true,
      peak: false,
    })
  })

  it("leaves opening questions with no potential flags", () => {
    // The opening is small talk and framing; flagging it as clip-worthy would
    // push the whole Studio clip pass toward the least interesting minute.
    expect(flagsFor("opening")).toEqual({
      clip: false,
      quote: false,
      peak: false,
    })
  })

  it("clears every flag once a question is demoted to backup", () => {
    // backup is in none of the three flag sets — an if_time question in the
    // conflict section must lose the flags its section would have given it.
    const [card] = cardInputsFromPrepV2(PREP, [
      q({ section: "conflict", priority: "if_time" }),
    ])
    expect(card.clip_potential).toBe(false)
    expect(card.quote_potential).toBe(false)
    expect(card.emotional_peak).toBe(false)
  })
})

describe("cardInputsFromPrepV2 — labels, follow-ups, ordering", () => {
  it.each(SECTION_KINDS)(
    "labels section %s with its own exact Arabic text",
    (section) => {
      // Exact equality on all SIX, not `/[ء-ي]/`. This text is printed on the
      // host's screen mid-recording: labelling the opening «الخاتمة» tells him
      // to wrap up ninety seconds into the episode.
      const [card] = cardInputsFromPrepV2(PREP, [q({ section })])
      expect(card.section_label).toBe(EXPECTED[section].label)
    },
  )

  it("never labels one section with another section's text", () => {
    // Kills the exact mutation Noura used: swap two labels in the source and
    // every per-section assertion above is still individually satisfiable only
    // by the right string, but this states the property directly.
    const cards = cardInputsFromPrepV2(
      PREP,
      SECTION_KINDS.map((section, i) => q({ id: `q${i}`, section })),
    )
    expect(cards.map((c) => c.section_label)).toEqual(
      SECTION_KINDS.map((s) => EXPECTED[s].label),
    )
    for (const card of cards) {
      // An English enum key leaking through the `?? q.section` fallback would
      // be printed verbatim onto the card.
      expect(card.section_label).not.toMatch(/[A-Za-z_]/)
      expect(card.section_label).toMatch(/[ء-ي]/)
    }
  })

  it("pairs each label with the bucket that belongs to it", () => {
    // Label and bucket are read off the same `section`, so a section handled
    // inconsistently between the two maps shows up here rather than as a card
    // that says «افتتاحية» while behaving like an escalation question.
    for (const section of SECTION_KINDS) {
      const [card] = cardInputsFromPrepV2(PREP, [q({ section })])
      expect([card.section_label, card.bucket], section).toEqual([
        EXPECTED[section].label,
        EXPECTED[section].bucket,
      ])
      expect(card.section_id).toBe(`v2-${section}`)
    }
  })

  it("namespaces section_id so v2 cards can never collide with v1 ones", () => {
    const [card] = cardInputsFromPrepV2(PREP, [q({ section: "conflict" })])
    expect(card.section_id).toBe("v2-conflict")
  })

  it("carries the follow-up prompt as a single follow-up", () => {
    const [card] = cardInputsFromPrepV2(PREP, [
      q({ id: "q7", follow_up_prompt: "وشلون كان رد فعل أهلك؟" }),
    ])
    expect(card.follow_ups).toEqual([
      { id: "fu-q7-0", text: "وشلون كان رد فعل أهلك؟" },
    ])
  })

  it.each([["", "empty"], ["   ", "whitespace-only"]])(
    "produces NO follow-up for a %s prompt (%s)",
    (prompt) => {
      const [card] = cardInputsFromPrepV2(PREP, [
        q({ follow_up_prompt: prompt }),
      ])
      // An empty follow-up bubble on a card during a recording is noise the
      // host has to read and discard.
      expect(card.follow_ups).toEqual([])
    },
  )

  it("keeps the question bank's order in sort_order", () => {
    const cards = cardInputsFromPrepV2(
      PREP,
      ["a", "b", "c"].map((id) => q({ id })),
    )
    expect(cards.map((c) => c.sort_order)).toEqual([0, 1, 2])
    expect(cards.map((c) => c.source_question_id)).toEqual(["a", "b", "c"])
  })

  it("truncates short_title at 80 chars while spoken_kuwaiti keeps the full text", () => {
    const long = "س".repeat(200)
    const [card] = cardInputsFromPrepV2(PREP, [q({ text: long })])
    expect(card.short_title).toHaveLength(80)
    expect(card.spoken_kuwaiti).toHaveLength(200)
  })

  it("omits why_this_matters rather than storing an empty string", () => {
    const [withPurpose] = cardInputsFromPrepV2(PREP, [
      q({ purpose: "يفتح باب القرار المفصلي" }),
    ])
    const [without] = cardInputsFromPrepV2(PREP, [q({ purpose: "" })])
    expect(withPurpose.why_this_matters).toBe("يفتح باب القرار المفصلي")
    expect(without.why_this_matters).toBeUndefined()
  })

  it("stamps every card with the preparation it belongs to", () => {
    const cards = cardInputsFromPrepV2("prep-42", [q({ id: "a" }), q({ id: "b" })])
    expect(cards.every((c) => c.preparation_id === "prep-42")).toBe(true)
  })

  it("returns an empty array for an empty question bank", () => {
    expect(cardInputsFromPrepV2(PREP, [])).toEqual([])
  })
})
