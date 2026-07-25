/**
 * The public «اسأل الضيف» form — the four things Sara's 2026-07-25 review
 * asked to be covered: field direction, the 429 branch, the aria wiring, and
 * the «سؤال» plural going through `formatArabicCount`.
 *
 * Two kinds of assertion live here on purpose:
 *  - Behavioural, against `teaser-question-copy.ts` — the pure decisions were
 *    extracted from the component precisely so they could be asserted in this
 *    node-environment suite (same move as `submission-messages.ts`).
 *  - Source-level, against `teaser-question-form.tsx` — `dir` and the focus
 *    ring are JSX attributes with no runtime seam, and the repo has no DOM
 *    test environment (adding one is a new dependency, not a bug fix). These
 *    guards are narrow and named, so a regression fails here rather than in a
 *    visual review three weeks later.
 */

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"

import {
  describeSubmitFailure,
  questionCounterHint,
  RATE_LIMIT_MESSAGE,
  GENERIC_FAILURE_MESSAGE,
} from "@/components/teaser/teaser-question-copy"
import { QUESTION_LIMITS, validateQuestionContent } from "@/lib/validation/forms"
import { formatArabicCount, arabicPluralNoun } from "@/lib/shared/formatters"

const COMPONENT_DIR = path.join(process.cwd(), "components", "teaser")
const FORM_SRC = fs.readFileSync(path.join(COMPONENT_DIR, "teaser-question-form.tsx"), "utf8")

// ─── 1. Field direction — the publish blocker ────────────────────────────────

/**
 * `dir="auto"` reads the field's VALUE, and the value is empty on load, so the
 * browser fell back to LTR inside an RTL form: placeholder on the left, and the
 * caret jumping left→right on the first Arabic character. Measured on the real
 * page at 390px before the fix: textarea `direction: ltr` while the form was
 * `rtl`, flipping to `rtl` only after typing.
 */
describe("question fields open RTL", () => {
  it("pins dir=rtl on both inputs — never dir=auto", () => {
    // The prompt <label> may keep dir="auto" (it renders operator text, not an
    // empty field), so count the FIELD tags specifically.
    const textarea = FORM_SRC.slice(FORM_SRC.indexOf("<textarea"), FORM_SRC.indexOf("</div>", FORM_SRC.indexOf("<textarea")))
    const input = FORM_SRC.slice(FORM_SRC.indexOf("<input"), FORM_SRC.indexOf("/>", FORM_SRC.indexOf("<input")))

    expect(textarea).toContain('dir="rtl"')
    expect(textarea).not.toContain('dir="auto"')
    expect(input).toContain('dir="rtl"')
    expect(input).not.toContain('dir="auto"')
  })
})

// ─── 2. Focus ring inherits the global standard ──────────────────────────────

/**
 * `app/globals.css` defines `:focus-visible { ring-2 ring-ring }` (≈9.4:1). The
 * component used to override it with `focus:ring-primary/30` (≈1.7:1) — a
 * utility-layer class beats a base-layer rule, so the component was actively
 * WEAKENING the site standard below the WCAG 2.2 3:1 minimum.
 */
describe("focus ring", () => {
  it("does not override the global :focus-visible ring", () => {
    expect(FORM_SRC).not.toContain("focus:ring-primary/30")
    expect(FORM_SRC).not.toMatch(/focus:ring-\d/)
  })

  it("keeps the border cue the other site forms use", () => {
    expect(FORM_SRC).toContain("focus:border-primary")
  })
})

// ─── 3. The 429 branch ───────────────────────────────────────────────────────

describe("describeSubmitFailure — 429", () => {
  it("names the real limit and the window instead of «حاول لاحقاً»", () => {
    const fb = describeSubmitFailure(429, "لقد تجاوزت الحد المسموح. حاول لاحقاً")
    expect(fb.message).toBe(RATE_LIMIT_MESSAGE)
    expect(fb.message).toContain(String(QUESTION_LIMITS.PER_HOUR))
    expect(fb.message).toContain("الساعة")
    // The generic server copy must NOT survive — that is the whole point.
    expect(fb.message).not.toContain("حاول لاحقاً")
  })

  it("is a notice, not a destructive error — the visitor did nothing wrong", () => {
    expect(describeSubmitFailure(429).tone).toBe("notice")
  })

  it("is form-level, so it is not pinned to a field as a validation failure", () => {
    expect(describeSubmitFailure(429).field).toBeNull()
  })

  it("quotes the limit through formatArabicCount — «3 أسئلة», never «3 سؤال»", () => {
    expect(RATE_LIMIT_MESSAGE).toContain(formatArabicCount(QUESTION_LIMITS.PER_HOUR, "سؤال"))
    expect(RATE_LIMIT_MESSAGE).not.toContain(`${QUESTION_LIMITS.PER_HOUR} سؤال `)
  })
})

describe("describeSubmitFailure — everything else", () => {
  it("attributes a 422 to the question field so aria-invalid lands there", () => {
    const fb = describeSubmitFailure(422, "يحتوي السؤال على ألفاظ غير لائقة")
    expect(fb.field).toBe("question")
    expect(fb.tone).toBe("error")
    expect(fb.message).toBe("يحتوي السؤال على ألفاظ غير لائقة")
  })

  it("falls back to generic copy when the server sends no usable error", () => {
    expect(describeSubmitFailure(500).message).toBe(GENERIC_FAILURE_MESSAGE)
    expect(describeSubmitFailure(500, "").message).toBe(GENERIC_FAILURE_MESSAGE)
    expect(describeSubmitFailure(500, "   ").message).toBe(GENERIC_FAILURE_MESSAGE)
    expect(describeSubmitFailure(500, { nested: true }).message).toBe(GENERIC_FAILURE_MESSAGE)
  })

  it("leaves a 500 form-level — it is not the visitor's field to fix", () => {
    expect(describeSubmitFailure(500).field).toBeNull()
  })
})

// ─── 4. aria-invalid / aria-describedby wiring ───────────────────────────────

describe("error message is wired to its field", () => {
  it("sets aria-invalid + aria-describedby on the question field", () => {
    expect(FORM_SRC).toContain("aria-invalid={questionMessage ? true : undefined}")
    expect(FORM_SRC).toContain("aria-describedby={questionMessage ? feedbackId : undefined}")
  })

  it("sets aria-invalid + aria-describedby on the name field", () => {
    expect(FORM_SRC).toContain("aria-invalid={nameMessage ? true : undefined}")
    expect(FORM_SRC).toContain("aria-describedby={nameMessage ? feedbackId : undefined}")
  })

  it("keeps role=alert and gives the message a stable id to point at", () => {
    expect(FORM_SRC).toContain('role="alert"')
    expect(FORM_SRC).toContain("const feedbackId = `teaser-err-${teaserId}`")
    expect(FORM_SRC).toContain("id={feedbackId}")
  })

  it("renders the question error under the question field, above the name label", () => {
    const errorPos = FORM_SRC.indexOf("{questionMessage ? feedbackBlock(questionMessage) : null}")
    const nameLabelPos = FORM_SRC.indexOf("htmlFor={nameId}")
    expect(errorPos).toBeGreaterThan(-1)
    expect(nameLabelPos).toBeGreaterThan(-1)
    expect(errorPos).toBeLessThan(nameLabelPos)
  })
})

// ─── 5. The minimum-length hint ──────────────────────────────────────────────

describe("questionCounterHint", () => {
  it("states the minimum while it is unmet — including an untouched field", () => {
    expect(questionCounterHint(0)).toContain(String(QUESTION_LIMITS.MIN_CHARS))
    expect(questionCounterHint(QUESTION_LIMITS.MIN_CHARS - 1)).toContain(
      String(QUESTION_LIMITS.MIN_CHARS),
    )
  })

  it("gets out of the way once the minimum is met", () => {
    expect(questionCounterHint(QUESTION_LIMITS.MIN_CHARS)).toBe("")
    expect(questionCounterHint(QUESTION_LIMITS.MAX_CHARS)).toBe("")
  })

  it("agrees with the validator it is warning about", () => {
    const justUnder = "ا".repeat(QUESTION_LIMITS.MIN_CHARS - 1)
    const justAt = "ا".repeat(QUESTION_LIMITS.MIN_CHARS)
    expect(validateQuestionContent(justUnder).valid).toBe(false)
    expect(questionCounterHint(justUnder.length)).not.toBe("")
    expect(validateQuestionContent(justAt).valid).toBe(true)
    expect(questionCounterHint(justAt.length)).toBe("")
  })
})

// ─── 6. One numeral system ───────────────────────────────────────────────────

/**
 * The counter renders Latin («3/280») while the validation error 40px below it
 * used Arabic-Indic («١٠ أحرف»). `formatArabicCount` emits Latin digits, so
 * Latin is the codebase's system and the messages were the odd ones out.
 */
describe("numeral system", () => {
  const ARABIC_INDIC = /[٠-٩]/

  it("keeps Arabic-Indic digits out of the question validation messages", () => {
    expect(validateQuestionContent("قصير").error).not.toMatch(ARABIC_INDIC)
    expect(validateQuestionContent("ا".repeat(QUESTION_LIMITS.MAX_CHARS + 1)).error).not.toMatch(
      ARABIC_INDIC,
    )
  })

  it("keeps them out of the form's own copy too", () => {
    expect(RATE_LIMIT_MESSAGE).not.toMatch(ARABIC_INDIC)
    expect(questionCounterHint(0)).not.toMatch(ARABIC_INDIC)
  })

  it("states the real limits", () => {
    expect(validateQuestionContent("قصير").error).toContain("10")
    expect(validateQuestionContent("ا".repeat(281)).error).toContain("280")
  })
})

// ─── 7. «سؤال» plural through the single formatter source ────────────────────

describe("formatArabicCount with «سؤال»", () => {
  it("stops printing «3 سؤال» — 3-10 take the plural", () => {
    expect(formatArabicCount(3, "سؤال")).toBe("3 أسئلة")
    expect(formatArabicCount(10, "سؤال")).toBe("10 أسئلة")
  })

  it("handles zero, one and two the Arabic way", () => {
    expect(formatArabicCount(0, "سؤال")).toBe("لا أسئلة")
    expect(formatArabicCount(1, "سؤال")).toBe("سؤال واحد")
    expect(formatArabicCount(2, "سؤال")).toBe("سؤالان")
  })

  it("returns to the singular tamyiz at 11+", () => {
    expect(formatArabicCount(11, "سؤال")).toBe("11 سؤال")
  })
})

describe("arabicPluralNoun — for the tile that renders its numeral separately", () => {
  it("agrees with the count without repeating the digit", () => {
    expect(arabicPluralNoun(0, "سؤال")).toBe("أسئلة")
    expect(arabicPluralNoun(1, "سؤال")).toBe("سؤال")
    expect(arabicPluralNoun(2, "سؤال")).toBe("سؤالان")
    expect(arabicPluralNoun(3, "سؤال")).toBe("أسئلة")
    expect(arabicPluralNoun(10, "سؤال")).toBe("أسئلة")
    expect(arabicPluralNoun(11, "سؤال")).toBe("سؤال")
  })

  it("never emits a digit — the layout already renders one", () => {
    for (const n of [0, 1, 2, 3, 11, 250]) {
      expect(arabicPluralNoun(n, "سؤال")).not.toMatch(/\d/)
    }
  })

  it("falls back to the given word for an untabled noun", () => {
    expect(arabicPluralNoun(3, "تيزر")).toBe("تيزر")
  })
})

// ─── 8. Success state ────────────────────────────────────────────────────────

describe("success state", () => {
  it("uses primary/indigo like every other site form — not the orange accent", () => {
    const success = FORM_SRC.slice(FORM_SRC.indexOf("if (done)"), FORM_SRC.indexOf("const submit"))
    expect(success).toContain("border-primary/15")
    expect(success).toContain("text-primary")
    expect(success).not.toContain("accent")
  })

  it("offers a way back into the form without a page reload", () => {
    expect(FORM_SRC).toContain("اسأل سؤالًا ثانيًا")
    expect(FORM_SRC).toContain("const askAnother = ()")
  })

  it("takes focus so a keyboard user is not dropped back on <body>", () => {
    const success = FORM_SRC.slice(FORM_SRC.indexOf("if (done)"), FORM_SRC.indexOf("const submit"))
    expect(success).toContain("tabIndex={-1}")
    expect(success).toContain("ref={doneRef}")
    expect(FORM_SRC).toContain("doneRef.current?.focus()")
  })
})

// ─── 9. The limit the visitor is quoted is the limit the route enforces ──────

describe("QUESTION_LIMITS is the single source", () => {
  const ROUTE_SRC = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "teaser", "[id]", "questions", "route.ts"),
    "utf8",
  )

  it("the rate-limit route reads the constant rather than a literal 3", () => {
    expect(ROUTE_SRC).toContain("QUESTION_LIMITS.PER_HOUR")
    expect(ROUTE_SRC).toContain("QUESTION_LIMITS.WINDOW_MS")
    expect(ROUTE_SRC).not.toContain('"submit_teaser_question", 3, 3600000')
  })

  it("one hour really is one hour", () => {
    expect(QUESTION_LIMITS.WINDOW_MS).toBe(60 * 60 * 1000)
  })
})
