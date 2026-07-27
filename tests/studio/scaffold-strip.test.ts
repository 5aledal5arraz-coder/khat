/**
 * `stripChunkScaffold` — tested on the PATTERN, not on a captured sample.
 *
 * Checking the 17 real strings is what let the first two bugs through:
 * every one of those strings happened to be well-formed, so neither the
 * bracket-crossing bug nor the missing `من` form could show up. The rule
 * this file enforces is the one that matters:
 *
 *   REMOVE the scaffold. NEVER remove a real word.
 *
 * Deleting prose while claiming to clean markup is the worse failure of
 * the two, so the "prose survives" cases are the point of the file.
 */
import { describe, it, expect } from "vitest"
import { stripChunkScaffold } from "@/lib/studio/utils"

const SCAFFOLD_RE = /الجزء\s*\d+\s*(?:[/\\]|من)\s*\d+\s*[—–-]/

/** Every scaffold shape the two summarizer prompts can emit. */
const SCAFFOLD_FORMS = [
  "[الجزء 3/6 — تقريباً من الدقيقة 22 إلى الدقيقة 33]",
  "[الجزء 1/6 — من الدقيقة 0]",
  "[الجزء 6/6 — من الدقيقة 180 إلى 216]",
  "(الجزء 1 من 6)", // the FLAT summarizer's parenthetical
  "[الجزء 2 من 6 — من الدقيقة 36 إلى الدقيقة 72]",
  "الجزء 3/6 — من الدقيقة 72 إلى 108:",
  "الجزء 4/6 - من الدقيقة 108 الى 144", // plain hyphen, no hamza
]

describe("stripChunkScaffold — removes every scaffold shape", () => {
  it.each(SCAFFOLD_FORMS)("removes %s", (form) => {
    const out = stripChunkScaffold(`قبل ${form} بعد`)
    expect(out).not.toMatch(SCAFFOLD_RE)
    // Nothing of the numbering may survive in ANY form — `/6`, `\6`, or
    // the `من 6` spelling. Asserting only on the dashed shape let the
    // parenthesised `(الجزء 1 من 6)` pass against the broken version.
    expect(out).not.toMatch(/الجزء\s*\d+/)
    expect(out).toContain("قبل")
    expect(out).toContain("بعد")
  })

  it("removes several in one string", () => {
    const out = stripChunkScaffold(
      "[الجزء 1/6 — من الدقيقة 0] أول [الجزء 2/6 — من الدقيقة 36] ثانٍ",
    )
    expect(out).not.toMatch(SCAFFOLD_RE)
    expect(out).toContain("أول")
    expect(out).toContain("ثانٍ")
  })
})

describe("stripChunkScaffold — never eats real words", () => {
  it("survives an unclosed bracket followed by another bracket", () => {
    // The exact regression: `[^\]\n]` excluded `]` but NOT `[`, so the
    // match ran from the opening bracket all the way to a LATER `]` and
    // deleted the sentence in between.
    const out = stripChunkScaffold(
      "[الجزء 5/6 — من الدقيقة 144 إلى 180 وفاة نور الدين وصعود صلاح الدين [المصدر].",
    )
    expect(out).toContain("وفاة نور الدين")
    expect(out).toContain("صلاح الدين")
    expect(out).toContain("المصدر")
  })

  it("leaves a PARENTHESISED part reference that is ordinary prose", () => {
    // `الجزء N من M` is an entirely normal Arabic construction, and this
    // field renders on the public episode page. The parens pattern used
    // to allow arbitrary content between the brackets, so the whole
    // parenthetical — including "من السلسلة" — disappeared.
    const prose = "ذكر ذلك في مقدمته (الجزء 2 من 4 من السلسلة) وأضاف تعليقاً."
    expect(stripChunkScaffold(prose)).toBe(prose)
  })

  it("leaves a BRACKETED reference carrying real prose", () => {
    const prose = "راجع [الجزء 2 من 4 من السلسلة الوثائقية] لمزيد من التفاصيل."
    expect(stripChunkScaffold(prose)).toBe(prose)
  })

  it("leaves a bare part reference that is ordinary prose", () => {
    // No minute range → not scaffold. Stripping it would leave
    // "من الكتاب" dangling, which is worse than leaving the words alone.
    const prose = "تكلم عن الجزء 3/6 من الكتاب بالتفصيل."
    expect(stripChunkScaffold(prose)).toBe(prose)
  })

  it("leaves ordinary uses of the word الجزء", () => {
    for (const prose of [
      "تكلم عن الجزء الأول من حياته بصدق.",
      "الجزء الأصعب كان الانتظار.",
      "قرأ الجزء الثاني من الكتاب.",
    ]) {
      expect(stripChunkScaffold(prose)).toBe(prose)
    }
  })

  it("keeps text on both sides of a stripped label", () => {
    const out = stripChunkScaffold(
      "سقوط الرها [الجزء 2/6 — من الدقيقة 36 إلى 72] ثم اغتيال عماد الدين.",
    )
    expect(out).toContain("سقوط الرها")
    expect(out).toContain("اغتيال عماد الدين")
  })

  it("never returns fewer real words than it was given, minus the scaffold", () => {
    // Property check across the whole matrix: for every scaffold form
    // embedded in a fixed sentence, all sentence words must survive.
    const sentence = "وفاة نور الدين ثم صعود صلاح الدين في مصر"
    for (const form of SCAFFOLD_FORMS) {
      const out = stripChunkScaffold(`${sentence} ${form} ${sentence}`)
      for (const word of sentence.split(" ")) {
        expect(out).toContain(word)
      }
    }
  })
})

describe("stripChunkScaffold — edges", () => {
  it("passes null through", () => {
    expect(stripChunkScaffold(null)).toBeNull()
    expect(stripChunkScaffold(undefined)).toBeNull()
  })

  it("handles a string that is only scaffold", () => {
    expect(stripChunkScaffold("[الجزء 1/6 — من الدقيقة 0]")).toBe("")
  })

  it("does not leave doubled spaces or space-before-punctuation", () => {
    const out = stripChunkScaffold("نص [الجزء 1/6 — من الدقيقة 0] .")
    expect(out).not.toMatch(/ {2,}/)
    expect(out).not.toMatch(/\s[.،]/)
  })
})
