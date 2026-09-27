/**
 * The question-bank editor's pure transforms (lib/preparation/v2/question-edit.ts).
 *
 * These replace `mergeMustAskQuestions`, which re-attached id / section /
 * purpose / fact cards to the edited lines BY POSITION. Every case below is a
 * way that merge put the wrong cards under the wrong question or lost data.
 */

import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"
import {
  addQuestion,
  canonicalQuestionText,
  carryOverAuthoredQuestions,
  classifyTextChange,
  deleteQuestion,
  editQuestion,
  moveQuestion,
  questionCardCounts,
  questionEditContext,
  questionOrigin,
  reorderQuestion,
  TEXT_CHANGED_REVIEW_NOTE,
} from "@/lib/preparation/v2/question-edit"
import type {
  PrepV2Insight,
  PrepV2Payload,
  PrepV2Question,
  SectionKind,
} from "@/lib/preparation/v2/types"
import { prepV2Schema } from "@/lib/db/validators"

function card(id: string, over: Partial<PrepV2Insight> = {}): PrepV2Insight {
  return {
    id,
    type: "fact",
    text: `بطاقة ${id}`,
    timing: "during",
    sources: [{ title: "s", url: "https://example.com/" + id }],
    confidence: "verified",
    generated_at: "2026-09-01T00:00:00Z",
    ...over,
  }
}

function q(id: string, section: SectionKind, over: Partial<PrepV2Question> = {}): PrepV2Question {
  return {
    id,
    section,
    text: `سؤال ${id}`,
    types: ["reflective"],
    priority: "must_ask",
    purpose: `هدف ${id}`,
    follow_up_prompt: `متابعة ${id}`,
    risk_level: "low",
    insights: [card(`${id}-c1`, { live_status: "approved" })],
    ...over,
  }
}

const STORY_SECTIONS: SectionKind[] = ["opening", "build_up", "conflict", "deep_dive", "emotional_peak", "resolution"]
const STORY = { sections: STORY_SECTIONS }

/** Five must-asks in deep_dive + if-time questions interleaved elsewhere. */
function storyBank(): PrepV2Question[] {
  return [
    q("q1", "deep_dive"),
    q("t1", "opening", { priority: "if_time" }),
    q("q2", "deep_dive"),
    q("q3", "deep_dive"),
    q("t2", "resolution", { priority: "if_time" }),
    q("q4", "deep_dive"),
    q("q5", "deep_dive"),
  ]
}

const ids = (b: PrepV2Question[], section?: SectionKind) =>
  b.filter((x) => !section || x.section === section).map((x) => x.id)

function payload(sections: SectionKind[], bank: PrepV2Question[], over: Partial<PrepV2Payload> = {}): PrepV2Payload {
  return {
    thesis: "t",
    axes_of_tension: [],
    guest_extraction_strategy: "",
    episode_sections: sections.map((kind) => ({
      kind,
      intent: "",
      target_emotion: "",
      estimated_minutes: 10,
      transition_goal: "",
    })),
    question_bank: bank,
    host_guidance: { overall_tone: "", do_list: [], dont_list: [], energy_curve: "" },
    director_guidance: { shot_priorities: [], silence_moments: [], cut_warnings: [] },
    sensitive_zones: [],
    opening_options: [],
    closing_options: [],
    total_estimated_minutes: 60,
    generator_version: "v2.1",
    generated_at: "2026-09-01T00:00:00Z",
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
      pass5_insights: null,
    },
    ...over,
  }
}

describe("insert / delete keep every other question intact", () => {
  it("inserting before #2 leaves ids, sections, text and cards of #2..n untouched", () => {
    const bank = storyBank()
    const r = addQuestion(bank, "deep_dive", "q1", { text: "سؤال جديد", id: "manual-0000-new" }, STORY)
    expect(r.changed).toBe(true)
    expect(ids(r.bank, "deep_dive")).toEqual(["q1", "manual-0000-new", "q2", "q3", "q4", "q5"])
    for (const orig of bank) {
      const now = r.bank.find((x) => x.id === orig.id)!
      expect(now).toBe(orig) // same object: nothing about it moved
    }
    expect(r.question).toMatchObject({ origin: "manual", section: "deep_dive" })
    expect(r.question!.insights).toBeUndefined()
  })

  it("deleting a middle question removes ONLY that id — the last keeps its cards", () => {
    const bank = storyBank()
    const r = deleteQuestion(bank, "q3")
    expect(r.changed).toBe(true)
    expect(ids(r.bank)).toEqual(["q1", "t1", "q2", "t2", "q4", "q5"])
    expect(r.bank.find((x) => x.id === "q5")!.insights).toEqual(bank[6].insights)
    expect(r.bank.find((x) => x.id === "q4")!.text).toBe("سؤال q4")
    expect(r.removed?.id).toBe("q3")
  })
})

describe("adding into a chosen section", () => {
  it("into the opening of a story prep", () => {
    const r = addQuestion(storyBank(), "opening", null, { text: "كيف بدأت؟", id: "manual-open-1" }, STORY)
    expect(ids(r.bank, "opening")).toEqual(["t1", "manual-open-1"])
  })

  it("into a chosen module of a 4-module course — never into a slot the course lacks", () => {
    const sections: SectionKind[] = ["opening", "build_up", "conflict", "resolution"]
    const ctx = { sections, format: "course" as const }
    const bank = [q("o1", "opening"), q("m1", "build_up"), q("m2", "conflict"), q("r1", "resolution")]
    const r = addQuestion(bank, "conflict", null, { text: "طبّقها كيف؟", id: "manual-c-1", types: ["confrontational"] }, ctx)
    expect(ids(r.bank, "conflict")).toEqual(["m2", "manual-c-1"])
    expect(r.question!.types).toEqual(["reflective"]) // course-safe
    expect(addQuestion(bank, "deep_dive", null, { text: "x" }, ctx).reason).toBe("bad_section")
  })

  it("the same id twice is one question (double click / repeated guest add)", () => {
    const once = addQuestion(storyBank(), "opening", null, { text: "a", id: "guest-s1", origin: "guest" }, STORY)
    const twice = addQuestion(once.bank, "opening", null, { text: "a", id: "guest-s1", origin: "guest" }, STORY)
    expect(twice.changed).toBe(false)
    expect(twice.reason).toBe("exists")
    expect(twice.bank.filter((x) => x.id === "guest-s1")).toHaveLength(1)
  })

  it("empty text is refused", () => {
    expect(addQuestion(storyBank(), "opening", null, { text: "   " }, STORY).reason).toBe("empty")
  })
})

describe("move / reorder", () => {
  it("move to a section the prep does not have is rejected", () => {
    const r = moveQuestion(storyBank(), "q1", "conflict", null, { sections: ["opening", "deep_dive", "resolution"] })
    expect(r.changed).toBe(false)
    expect(r.reason).toBe("bad_section")
  })

  it("move carries the cards and lands at the end of the target (or before a given question)", () => {
    const bank = storyBank()
    const r = moveQuestion(bank, "q3", "opening", null, STORY)
    expect(ids(r.bank, "opening")).toEqual(["t1", "q3"])
    expect(r.bank.find((x) => x.id === "q3")!.insights).toBe(bank[3].insights)
    const r2 = moveQuestion(bank, "q5", "deep_dive", "q2", STORY)
    expect(ids(r2.bank, "deep_dive")).toEqual(["q1", "q5", "q2", "q3", "q4"])
  })

  it("reorder swaps only within the section and stops at the edges", () => {
    const bank = storyBank()
    const up = reorderQuestion(bank, "q2", "up")
    expect(ids(up.bank, "deep_dive")).toEqual(["q2", "q1", "q3", "q4", "q5"])
    expect(ids(up.bank, "opening")).toEqual(["t1"])
    expect(reorderQuestion(bank, "q1", "up").changed).toBe(false)
    expect(reorderQuestion(bank, "q5", "down").changed).toBe(false)
  })
})

describe("editing text and the fact cards under it", () => {
  function withCards() {
    return [
      q("q1", "deep_dive", {
        insights: [
          card("gen-approved", { live_status: "approved" }),
          card("gen-pending"),
          card("gen-hidden", { live_status: "hidden" }),
          card("man-approved", { live_status: "approved", manual: true }),
        ],
      }),
      q("t1", "opening", { priority: "if_time" }),
    ]
  }

  it("a real rewording sends approved GENERATED cards back to review; manual cards stay approved", () => {
    const r = editQuestion(withCards(), "q1", { text: "سؤال مختلف تماماً" }, "سؤال q1")
    expect(r.changed).toBe(true)
    const byId = Object.fromEntries(r.bank[0].insights!.map((i) => [i.id, i]))
    expect(byId["gen-approved"].live_status).toBe("pending")
    expect(byId["gen-approved"].review_note).toBe(TEXT_CHANGED_REVIEW_NOTE)
    expect(byId["gen-hidden"].live_status).toBe("hidden")
    expect(byId["man-approved"].live_status).toBe("approved")
    expect(r.bank[0].insights).toHaveLength(4) // cards are kept
  })

  it("whitespace-only is a no-op; punctuation-only saves but keeps approvals", () => {
    const bank = withCards()
    const ws = editQuestion(bank, "q1", { text: "  سؤال   q1 \n" })
    expect(ws.changed).toBe(false)
    expect(ws.reason).toBe("noop")
    const punct = editQuestion(bank, "q1", { text: "سؤال q1؟" })
    expect(punct.changed).toBe(true)
    expect(punct.bank[0].text).toBe("سؤال q1؟")
    expect(punct.bank[0].insights![0].live_status).toBe("approved")
    expect(classifyTextChange("a b", "a  b")).toBe("none")
    expect(canonicalQuestionText("é")).toBe("é")
  })

  it("editing a must-ask never reorders the if-time questions (or anything)", () => {
    const bank = storyBank()
    const r = editQuestion(bank, "q2", { text: "نص جديد" })
    expect(ids(r.bank)).toEqual(ids(bank))
    expect(r.bank.filter((x) => x.priority === "if_time").map((x) => x.id)).toEqual(["t1", "t2"])
  })

  it("priority chip, purpose, follow-up", () => {
    const r = editQuestion(storyBank(), "q1", { priority: "if_time", purpose: " هدف جديد ", follow_up_prompt: "تابع" })
    expect(r.bank[0]).toMatchObject({ priority: "if_time", purpose: "هدف جديد", follow_up_prompt: "تابع" })
    expect(questionCardCounts(r.bank[0])).toEqual({ total: 1, approved: 1, approvedGenerated: 1 })
  })
})

describe("stale and unknown ids never guess", () => {
  it("unknown id → changed:false for every transform", () => {
    const bank = storyBank()
    expect(editQuestion(bank, "gone", { text: "x" })).toMatchObject({ changed: false, reason: "not_found" })
    expect(deleteQuestion(bank, "gone")).toMatchObject({ changed: false, reason: "not_found" })
    expect(moveQuestion(bank, "gone", "opening", null, STORY)).toMatchObject({ changed: false, reason: "not_found" })
    expect(reorderQuestion(bank, "gone", "up")).toMatchObject({ changed: false, reason: "not_found" })
    expect(addQuestion(bank, "opening", "gone", { text: "x" }, STORY)).toMatchObject({ changed: false, reason: "not_found" })
  })

  it("an edit made against text someone else changed is refused with the current text", () => {
    const bank = storyBank()
    const theirs = editQuestion(bank, "q2", { text: "نسخة الزميل" }).bank
    const mine = editQuestion(theirs, "q2", { text: "نسختي" }, "سؤال q2")
    expect(mine).toMatchObject({ changed: false, reason: "stale", current: "نسخة الزميل" })
    expect(mine.bank).toBe(theirs)
    expect(deleteQuestion(theirs, "q2", "سؤال q2").reason).toBe("stale")
    // Whitespace differences in what the editor saw are not "stale".
    expect(editQuestion(bank, "q2", { text: "نص" }, " سؤال  q2 ").changed).toBe(true)
  })
})

describe("regeneration carry-over", () => {
  it("manual and guest questions survive into their section; generated ones are replaced", () => {
    const prev = payload(STORY_SECTIONS, [
      q("old-gen", "deep_dive"),
      q("manual-1", "opening", { origin: "manual" }),
      q("guest-s1", "resolution", { origin: "guest", priority: "if_time" }),
    ])
    const next = payload(STORY_SECTIONS, [q("n1", "opening"), q("n2", "deep_dive"), q("n3", "resolution")])
    const r = carryOverAuthoredQuestions(prev, next)
    expect(r.carried).toBe(2)
    expect(ids(r.payload.question_bank)).toEqual(["n1", "manual-1", "n2", "n3", "guest-s1"])
    expect(r.payload.question_bank.find((x) => x.id === "manual-1")!.insights).toEqual(prev.question_bank[1].insights)
    expect(ids(r.payload.question_bank)).not.toContain("old-gen")
    expect(prepV2Schema.safeParse(r.payload).success).toBe(true)
  })

  it("a question whose section no longer exists is dropped and counted; nothing to carry ⇒ same object", () => {
    const prev = payload(STORY_SECTIONS, [q("manual-x", "emotional_peak", { origin: "manual", types: ["emotional"] })])
    const course = payload(["opening", "build_up", "resolution"], [q("n1", "opening")], { format: "course" })
    expect(carryOverAuthoredQuestions(prev, course)).toMatchObject({ carried: 0, dropped: 1 })
    const plain = payload(STORY_SECTIONS, [q("n1", "opening")])
    expect(carryOverAuthoredQuestions(payload(STORY_SECTIONS, [q("g", "opening")]), plain).payload).toBe(plain)
    expect(carryOverAuthoredQuestions(null, plain).payload).toBe(plain)
  })

  it("questions added by hand BEFORE `origin` existed (inline-* / guest-<hex> / manual-*) are carried too", () => {
    // Shapes live preps carry today, e.g. EIR 3e045378: the old textarea merge
    // wrote `inline-<8>`, the old guest add wrote `guest-<8hex>`, no origin.
    const prev = payload(STORY_SECTIONS, [
      q("inline-a1b2c3d4", "deep_dive"),
      q("guest-9f8e7d6c", "resolution", { priority: "if_time" }),
      q("manual-00000000-legacy", "opening"),
      q("q7", "deep_dive"),
    ])
    const next = payload(STORY_SECTIONS, [q("n1", "opening"), q("n2", "deep_dive"), q("n3", "resolution")])
    const r = carryOverAuthoredQuestions(prev, next)
    expect(r.carried).toBe(3)
    expect(ids(r.payload.question_bank)).toEqual([
      "n1",
      "manual-00000000-legacy",
      "n2",
      "inline-a1b2c3d4",
      "n3",
      "guest-9f8e7d6c",
    ])
    expect(questionOrigin({ id: "inline-a1b2c3d4" })).toBe("manual")
    expect(questionOrigin({ id: "guest-9f8e7d6c" })).toBe("guest")
    expect(questionOrigin({ id: "q7" })).toBe("generated")
    expect(questionOrigin({ id: "inline-x", origin: "generated" })).toBe("generated") // stored field wins
  })

  it("carried into a course, types become course-safe", () => {
    const prev = payload(STORY_SECTIONS, [q("manual-y", "build_up", { origin: "manual", types: ["confrontational", "factual"] })])
    const course = payload(["opening", "build_up", "resolution"], [], { format: "course" })
    const r = carryOverAuthoredQuestions(prev, course)
    expect(r.payload.question_bank[0].types).toEqual(["reflective", "factual"])
  })

  it("questionEditContext reads the prep's own sections", () => {
    expect(questionEditContext(payload(["opening", "resolution"], [])).sections).toEqual(["opening", "resolution"])
  })
})

describe("the position merge is gone", () => {
  it("prep-actions.ts no longer merges must-ask questions by index", () => {
    const src = readFileSync("app/admin/khat-brain/episodes/[eirId]/prep-actions.ts", "utf8")
    expect(src).not.toContain("mustAsk[i]")
    expect(src).not.toContain("mergeMustAskQuestions")
    expect(src).not.toContain('"must_ask_questions"')
  })
})

describe("card counts read as Arabic", () => {
  it("iḍāfa dual drops the nūn; gender follows the head noun", async () => {
    const { formatArabicCount } = await import("@/lib/shared/formatters")
    expect(formatArabicCount(2, "بطاقة إسناد")).toBe("بطاقتَي إسناد")
    expect(formatArabicCount(1, "بطاقة إسناد")).toBe("بطاقة إسناد واحدة")
    expect(formatArabicCount(4, "بطاقة إسناد")).toBe("4 بطاقات إسناد")
    expect(formatArabicCount(2, "بطاقة معتمدة")).toBe("بطاقتَين معتمدتَين")
    // Same head-noun rule fixes an existing phrase key.
    expect(formatArabicCount(1, "عملية استرجاع")).toBe("عملية استرجاع واحدة")
    expect(formatArabicCount(1, "استدعاء فاشل")).toBe("استدعاء فاشل واحد")
  })
})
