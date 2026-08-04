import { describe, expect, it } from "vitest"

import { parseChapters, parseIsoDuration } from "@/scripts/sync-youtube-content"

/**
 * Chapters copied out of a YouTube description, for episodes already published.
 *
 * The defect being fixed: episode 018's live page carried a GENERATED index
 * whose last two entries (1:40:00 and 2:00:00 «الختام») sat past the end of an
 * 86:18 episode, while the description carried Khaled's own 16-chapter index
 * ending at 1:23:30. So the two properties that matter here are: read the real
 * ones, and never emit one that cannot exist.
 */

// Verbatim from https://www.youtube.com/watch?v=knyKlUZIwYQ — note the mixed
// styles: some lines use " - " after the stamp, some don't; some are H:MM:SS.
const EP_018 = `في هذه الحلقة المميزة من بودكاست خط، نستضيف رائد الأعمال الكويتي جاسم الزراعي.

هاشتاقات:
#بودكاست_خط #ريادة_الأعمال

00:00 المقدمه
03:33 - البدايات: تجربة جاسم الدراسية في الخارج وقرار العودة للكويت.
08:44 - علاقة الجسم الصحي على تكوين الشخصية.
13:55 العودة من امريكا بعد التخرج.
1:09:00 فاصل مع فلاش
1:23:30 ماهي القرارات التي ندمت عليها

بودكاست خط على تويتر: https://bit.ly/3UAnlez`

const EP_018_DURATION = 86 * 60 + 18

describe("parseIsoDuration", () => {
  it.each([
    ["PT1H26M18S", 5178],
    ["PT2H13M41S", 8021],
    ["PT8M44S", 524],
    ["PT4M57S", 297],
    ["PT3H", 10800],
  ])("%s → %i seconds", (iso, seconds) => {
    expect(parseIsoDuration(iso as string)).toBe(seconds)
  })

  it("returns 0 rather than guessing on an unparseable value", () => {
    expect(parseIsoDuration("garbage")).toBe(0)
  })
})

describe("parseChapters — reads the real index", () => {
  const { chapters, dropped } = parseChapters(EP_018, EP_018_DURATION)

  it("finds every chapter line and nothing else", () => {
    expect(chapters).toHaveLength(6)
    expect(dropped).toHaveLength(0)
  })

  it("reads H:MM:SS and MM:SS alike", () => {
    expect(chapters[0]).toEqual({ time_seconds: 0, title: "المقدمه" })
    expect(chapters[4]).toEqual({ time_seconds: 69 * 60, title: "فاصل مع فلاش" })
    expect(chapters[5].time_seconds).toBe(83 * 60 + 30)
  })

  it("strips the optional dash separator from the title", () => {
    expect(chapters[1].title).toBe(
      "البدايات: تجربة جاسم الدراسية في الخارج وقرار العودة للكويت.",
    )
    expect(chapters[1].title.startsWith("-")).toBe(false)
  })

  it("ignores prose, hashtags and links", () => {
    const titles = chapters.map((c) => c.title)
    expect(titles.some((t) => t.includes("bit.ly"))).toBe(false)
    expect(titles.some((t) => t.startsWith("#"))).toBe(false)
  })

  it("returns chapters in ascending time order", () => {
    const times = chapters.map((c) => c.time_seconds)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe("parseChapters — never emits a chapter that cannot exist", () => {
  // The shape of the generated index this replaces.
  const FABRICATED = `0:00 المقدمة
1:00:00 الانتقال
1:40:00 نصائح للنجاح
2:00:00 الختام`

  it("drops a chapter at or past the video's duration, and says so", () => {
    const { chapters, dropped } = parseChapters(FABRICATED, EP_018_DURATION)
    expect(chapters.map((c) => c.title)).toEqual(["المقدمة", "الانتقال"])
    expect(dropped.map((d) => d.title)).toEqual(["نصائح للنجاح", "الختام"])
    expect(dropped.every((d) => d.reason === "past the end of the video")).toBe(true)
  })

  it("treats a chapter exactly at the duration as past the end", () => {
    const { chapters, dropped } = parseChapters("10:00 نهاية", 600)
    expect(chapters).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  it("skips the duration check when the duration is unknown", () => {
    const { chapters, dropped } = parseChapters("10:00 نهاية", 0)
    expect(chapters).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })

  it("keeps the first of two chapters sharing a timestamp", () => {
    const { chapters, dropped } = parseChapters("05:00 الأول\n05:00 الثاني", 3600)
    expect(chapters).toEqual([{ time_seconds: 300, title: "الأول" }])
    expect(dropped[0]).toMatchObject({ title: "الثاني", reason: "duplicate timestamp" })
  })
})

describe("parseChapters — empty beats invented", () => {
  it("returns nothing for a description with no chapter lines", () => {
    const { chapters } = parseChapters(
      "حلقة عن ريادة الأعمال.\n\n#بودكاست_خط\nتويتر: https://bit.ly/3UAnlez",
      5000,
    )
    expect(chapters).toEqual([])
  })

  it("returns nothing for an empty description", () => {
    expect(parseChapters("", 5000).chapters).toEqual([])
  })

  it("ignores a timestamp with no title after it", () => {
    expect(parseChapters("12:34", 5000).chapters).toEqual([])
    expect(parseChapters("12:34   ", 5000).chapters).toEqual([])
  })

  it("does not read a timestamp that is mid-sentence rather than a chapter", () => {
    // A duration mentioned in prose must not become a chapter.
    expect(parseChapters("الحلقة تبدأ فعلياً عند 02:32 تقريباً", 5000).chapters).toEqual([])
  })
})
