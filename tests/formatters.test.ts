/**
 * Pure formatter helpers (lib/shared/formatters.ts).
 */
import { describe, it, expect } from "vitest"
import {
  episodeBlurb,
  formatArabicDate,
  researchSourceLabel,
  researchSourceSnippet,
  stripInlineMarkdown,
  truncateOnWord,
} from "@/lib/shared/formatters"

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

describe("formatArabicDate", () => {
  it("prints the STORED day for a bare YYYY-MM-DD, not the UTC-shifted one", () => {
    // `episodes.release_date` is date-only. `new Date("2025-09-26")` is UTC
    // midnight, so anywhere behind UTC the naive path prints 25 سبتمبر and the
    // whole archive reads a day early. This is the regression guard.
    expect(formatArabicDate("2025-09-26")).toBe("26 سبتمبر 2025")
    expect(formatArabicDate("2025-01-01")).toBe("1 يناير 2025")
    expect(formatArabicDate("2024-12-31")).toBe("31 ديسمبر 2024")
  })

  it("still accepts a full timestamp and a Date", () => {
    expect(formatArabicDate(new Date(2025, 7, 30))).toBe("30 أغسطس 2025")
    expect(formatArabicDate("2025-08-30T13:45:00")).toBe("30 أغسطس 2025")
  })

  it("returns the em dash for missing or unparseable input", () => {
    expect(formatArabicDate(null)).toBe("—")
    expect(formatArabicDate(undefined)).toBe("—")
    expect(formatArabicDate("not a date")).toBe("—")
    expect(formatArabicDate("2025-13-01")).toBe("—")
  })
})

describe("episodeBlurb", () => {
  it("prefers summary when it exists", () => {
    expect(episodeBlurb({ summary: "ملخص محرَّر", description: "وصف يوتيوب" })).toBe(
      "ملخص محرَّر",
    )
  })

  it("falls back to description — the case that matters, since summary is NULL on all 41 published episodes", () => {
    expect(episodeBlurb({ summary: null, description: "وصف الحلقة" })).toBe("وصف الحلقة")
    expect(episodeBlurb({ summary: "   ", description: "وصف الحلقة" })).toBe("وصف الحلقة")
  })

  it("keeps only the first paragraph of a description", () => {
    expect(
      episodeBlurb({ description: "الفقرة الأولى.\n\nالفقرة الثانية." }),
    ).toBe("الفقرة الأولى.")
  })

  it("joins wrapped lines inside that paragraph rather than cutting at the first newline", () => {
    expect(episodeBlurb({ description: "سطر أول\nسطر ثانٍ\n\nفقرة أخرى" })).toBe(
      "سطر أول سطر ثانٍ",
    )
  })

  it("drops the YouTube link and hashtag lines that follow the prose", () => {
    // Shape taken from the two newest stored descriptions.
    const stored =
      "صلاح الغزالي يروي قصة اسره.\nحساب الضيف على الإنستغرام : https://bit.ly/4dsERI6\n#المرأة_والقيادة"
    const out = episodeBlurb({ description: stored })
    expect(out).toBe("صلاح الغزالي يروي قصة اسره.")
    expect(out).not.toContain("http")
    expect(out).not.toContain("#")
  })

  it("returns null — never an empty string — when nothing readable survives", () => {
    // The caller renders no <p> at all on null; "" would still occupy a line box.
    expect(episodeBlurb({ summary: null, description: null })).toBeNull()
    expect(episodeBlurb({})).toBeNull()
    expect(episodeBlurb({ description: "https://example.com" })).toBeNull()
    expect(episodeBlurb({ description: "#وسم #آخر" })).toBeNull()
  })
})

/**
 * ص-٨ — the episode hero teaser. The old `summary.slice(0, 150)` cut
 * mid-word on the reference episode ("…مشاعر الخوف والقلق التي ا…").
 */
describe("truncateOnWord", () => {
  it("returns short text untouched, with no ellipsis", () => {
    expect(truncateOnWord("نص قصير", 150)).toBe("نص قصير")
  })

  it("returns undefined for empty or missing input", () => {
    expect(truncateOnWord(null, 150)).toBeUndefined()
    expect(truncateOnWord("   ", 150)).toBeUndefined()
  })

  it("never cuts a word in half", () => {
    const text = "مشاعر الخوف والقلق التي انتابته في تلك اللحظة كانت أقوى من أي شيء"
    const out = truncateOnWord(text, 30)!
    expect(out.endsWith("…")).toBe(true)
    const body = out.slice(0, -1)
    // Every word kept must appear whole in the source.
    for (const w of body.split(" ")) expect(text.split(" ")).toContain(w)
    expect(body.length).toBeLessThanOrEqual(30)
  })

  it("strips a dangling comma or space before the ellipsis", () => {
    expect(truncateOnWord("واحد اثنان، ثلاثة أربعة", 12)).toBe("واحد اثنان…")
  })

  it("falls back to a hard cut when there is no space to back up to", () => {
    const out = truncateOnWord("ا".repeat(300), 150)!
    expect(out).toBe("ا".repeat(150) + "…")
  })
})
