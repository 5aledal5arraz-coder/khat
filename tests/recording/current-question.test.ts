import { describe, expect, it } from "vitest"

/**
 * «الآن» and «التالي» for the director and the editor.
 *
 * Khalid, 2026-08-05: «فيصل وشاهين لازم يشوفون السؤال اللي بيطرحه المحاور عشان
 * يتابعون مع المحاور ويعرفون اي سؤال الان وماهو السؤال التالي».
 *
 * The room recorded only which questions were DONE, so the participants
 * inferred "he is on the first undone one". That inference is correct right up
 * until the host skips a question or doubles back — which is exactly when a
 * director needs to know where he is, and exactly the case that has no test if
 * you only check the happy path.
 *
 * The derivation is pure, so it is tested directly rather than through a
 * render: the failure mode is a wrong question highlighted on someone else's
 * screen, which no type check and no exception ever reports.
 */

import { resolveCurrentQuestion } from "@/lib/recording-v2/marker-types"

type Q = { id: string }

/**
 * THE REAL FUNCTION, not a copy of it. This test first re-implemented the four
 * lines that lived in the component — which would have passed forever while the
 * component drifted away from it. The derivation was extracted so this exercises
 * what actually ships.
 */
const resolve = (questions: Q[], completed: string[], publishedNow: string | null) =>
  resolveCurrentQuestion(questions, completed, publishedNow)

const qs: Q[] = [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }]

describe("what the host published wins", () => {
  it("marks the published question as «الآن», not the first undone one", () => {
    // The host jumped ahead to q3 while q1 is still unasked. The old inference
    // would have pointed the whole crew at q1.
    expect(resolve(qs, [], "q3")).toEqual({ currentQuestionId: "q3", nextQuestionId: "q1" })
  })

  it("follows the host BACKWARDS when he returns to an earlier question", () => {
    // He asked q1 and q2, then went back to q1 to push on an answer. «الآن»
    // must be q1 even though it is already marked done.
    expect(resolve(qs, ["q1", "q2"], "q1").currentQuestionId).toBe("q1")
  })

  it("«التالي» is the next UNDONE question, skipping answered ones", () => {
    const r = resolve(qs, ["q1", "q2"], "q3")
    expect(r.currentQuestionId).toBe("q3")
    expect(r.nextQuestionId).toBe("q4")
  })

  it("«التالي» is never the same as «الآن»", () => {
    for (const now of ["q1", "q2", "q3", "q4", null]) {
      const r = resolve(qs, [], now)
      expect(r.nextQuestionId).not.toBe(r.currentQuestionId)
    }
  })
})

describe("the fallback, which is what everyone had before", () => {
  it("uses the first undone question when the host has published nothing", () => {
    expect(resolve(qs, ["q1"], null)).toEqual({ currentQuestionId: "q2", nextQuestionId: "q3" })
  })

  it("ignores a published id that is NOT in this section", () => {
    // The host moved to another section; his hero id belongs to a question this
    // participant list does not contain. Highlighting nothing — or worse,
    // crashing on a lookup — is not acceptable, so it falls back.
    expect(resolve(qs, [], "q-from-another-section").currentQuestionId).toBe("q1")
  })

  it("survives an empty section", () => {
    expect(resolve([], [], null)).toEqual({ currentQuestionId: null, nextQuestionId: null })
  })

  it("returns null for «التالي» when only one question remains", () => {
    expect(resolve(qs, ["q1", "q2", "q3"], null)).toEqual({
      currentQuestionId: "q4",
      nextQuestionId: null,
    })
  })

  it("returns nulls when every question is done", () => {
    expect(resolve(qs, ["q1", "q2", "q3", "q4"], null)).toEqual({
      currentQuestionId: null,
      nextQuestionId: null,
    })
  })
})
