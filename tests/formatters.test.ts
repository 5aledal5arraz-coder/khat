/**
 * Pure formatter helpers (lib/shared/formatters.ts).
 */
import { describe, it, expect } from "vitest"
import {
  guestInitials,
  researchSourceLabel,
  researchSourceSnippet,
  stripInlineMarkdown,
} from "@/lib/shared/formatters"

describe("guestInitials", () => {
  it("takes the first letter of up to two words for a normal name", () => {
    expect(guestInitials("حسام مطر")).toBe("حم")
    expect(guestInitials("Steven Novella")).toBe("SN")
  })

  it("uses only the first two words for longer names", () => {
    expect(guestInitials("عبد الله البطي")).toBe("عا")
  })

  it("single-word name yields a single initial", () => {
    expect(guestInitials("Ithra")).toBe("I")
    expect(guestInitials("خط")).toBe("خ")
  })

  it("skips leading numeric/placeholder tokens (regression: '0ب' bug)", () => {
    // Junk imported name '019 بودكاست خط' must NOT render as '0ب'.
    expect(guestInitials("019 بودكاست خط")).toBe("بخ")
    expect(guestInitials("2024 سالفة")).toBe("س")
  })

  it("skips honorifics so titled guests don't share one avatar", () => {
    // Regression: all three collapsed to «اع»/«اع»/«اا» when the title counted
    // as a name word — two of three guests on /guests had identical initials.
    expect(guestInitials("الأستاذ علي دريساوي")).toBe("عد")
    expect(guestInitials("الملازم عبدالله البطي")).toBe("عا")
    expect(guestInitials("د. حسام مطر")).toBe("حم")
    expect(guestInitials("الدكتورة سارة العلي")).toBe("سا")
  })

  it("keeps an initial when the name is nothing but a title", () => {
    expect(guestInitials("الشيخ")).toBe("ا")
  })

  it("falls back to raw first chars when there are no letter-initial words", () => {
    // All-numeric name: no letter words, so use the raw tokens rather than crash.
    expect(guestInitials("019")).toBe("0")
  })

  it("handles empty / whitespace / missing names cleanly", () => {
    expect(guestInitials("")).toBe("•")
    expect(guestInitials("   ")).toBe("•")
    expect(guestInitials(undefined as unknown as string)).toBe("•")
  })
})

describe("researchSourceLabel", () => {
  it("prefers the domain as the readable label", () => {
    expect(
      researchSourceLabel({ domain: "wikipedia.org", publisher: "Wikipedia", url: "https://en.wikipedia.org/x" }),
    ).toBe("wikipedia.org")
  })

  it("falls back to the publisher when the domain is null", () => {
    expect(
      researchSourceLabel({ domain: null, publisher: "الجزيرة", url: "https://aljazeera.net/x" }),
    ).toBe("الجزيرة")
  })

  it("derives a bare hostname from the url when domain and publisher are absent", () => {
    expect(researchSourceLabel({ domain: null, url: "https://www.example.com/a/b" })).toBe("example.com")
  })

  it("returns the raw url only as a last resort", () => {
    expect(researchSourceLabel({ domain: null, url: "not-a-url" })).toBe("not-a-url")
  })
})

describe("stripInlineMarkdown", () => {
  it("strips bold/italic markers and collapses whitespace", () => {
    expect(stripInlineMarkdown("**قال**   ضيفنا…")).toBe("قال ضيفنا…")
  })

  it("strips a leading list marker (the reported operator-facing bug)", () => {
    expect(stripInlineMarkdown("* **الاتجاه والنقاش:**")).toBe("الاتجاه والنقاش:")
  })

  it("strips heading, quote, numbered-list markers and inline code", () => {
    expect(stripInlineMarkdown("### عنوان")).toBe("عنوان")
    expect(stripInlineMarkdown("> اقتباس")).toBe("اقتباس")
    expect(stripInlineMarkdown("1. أولاً")).toBe("أولاً")
    expect(stripInlineMarkdown("`code`")).toBe("code")
  })

  it("keeps the label of a markdown link and drops the url", () => {
    expect(stripInlineMarkdown("[الجزيرة](https://aljazeera.net)")).toBe("الجزيرة")
  })

  it("returns an empty string for empty input", () => {
    expect(stripInlineMarkdown(null)).toBe("")
    expect(stripInlineMarkdown(undefined)).toBe("")
    expect(stripInlineMarkdown("")).toBe("")
  })

  it("leaves clean prose untouched", () => {
    expect(stripInlineMarkdown("نقاش حول العلاقات الحديثة")).toBe(
      "نقاش حول العلاقات الحديثة",
    )
  })
})

describe("researchSourceSnippet", () => {
  it("strips markdown emphasis markers and collapses whitespace", () => {
    expect(researchSourceSnippet({ title: "**قال**   ضيفنا…" })).toBe("قال ضيفنا…")
  })

  it("returns an empty string for a missing title", () => {
    expect(researchSourceSnippet({})).toBe("")
    expect(researchSourceSnippet({ title: null })).toBe("")
  })
})
