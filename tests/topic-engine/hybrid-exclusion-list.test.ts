/**
 * Topic-engine defects #2 + #18 — the hybrid exclusion list.
 *
 * #2  It was `unique([...extra, ...candidates, ...consumed].slice(0, 120))`
 *     over an unordered, all-seasons read: the cap ran BEFORE de-duplication
 *     (repeats ate slots), and once the table passed 120 rows this season's
 *     own titles and every consumed original could fall off at random.
 * #18 Published episodes were in no list at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockSelectResult, resetMock } from "../db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb }))

import { mergeExclusionTitles, loadPublishedEpisodeTitles } from "@/lib/hybrid-topics/inputs"

beforeEach(() => resetMock())

describe("mergeExclusionTitles", () => {
  it("de-duplicates BEFORE the cap, so repeats never cost a slot", () => {
    const dupes = Array.from({ length: 150 }, () => "نفس العنوان")
    const out = mergeExclusionTitles([dupes, ["عنوان الموسم الحالي"], ["حلقة منشورة"]], 120)
    expect(out).toEqual(["نفس العنوان", "عنوان الموسم الحالي", "حلقة منشورة"])
  })

  it("keeps group priority: this season → published → other seasons → consumed", () => {
    const other = Array.from({ length: 200 }, (_, i) => `موسم آخر ${i}`)
    const out = mergeExclusionTitles(
      [[], ["موسمنا ١", "موسمنا ٢"], ["منشورة ١"], other, ["أصلي مستهلك"]],
      120,
    )
    expect(out).toHaveLength(120)
    expect(out.slice(0, 3)).toEqual(["موسمنا ١", "موسمنا ٢", "منشورة ١"])
    // the cap now cuts the LEAST relevant group, never this season's titles
    expect(out).not.toContain("أصلي مستهلك")
  })

  it("treats whitespace/case variants as the same title", () => {
    expect(mergeExclusionTitles([["  Same   Title "], ["same title"]], 10)).toEqual(["Same Title"])
  })
})

describe("loadPublishedEpisodeTitles", () => {
  it("strips the brand stamp and a trailing «| guest name»", async () => {
    mockSelectResult([
      { title: "قصة لجوء الخطاط السوري حسام مطر | 019 بودكاست خط", custom_title: null },
      { title: "مشاهد من داخل العراق.. مقاطع من بودكاست خط", custom_title: null },
      { title: "السفر بشكل مختلف | جاسم عباس- 003 بودكاست خط", custom_title: null },
    ])
    const out = await loadPublishedEpisodeTitles()
    expect(out).toEqual([
      "قصة لجوء الخطاط السوري حسام مطر",
      "مشاهد من داخل العراق",
      "السفر بشكل مختلف",
    ])
  })

  it("excludes BOTH the raw title and the admin's custom title", async () => {
    mockSelectResult([
      { title: "الطيار الذي عاد | 007 بودكاست خط", custom_title: "حين عاد الطيار إلى السماء" },
    ])
    const out = await loadPublishedEpisodeTitles()
    expect(out).toEqual(["الطيار الذي عاد", "حين عاد الطيار إلى السماء"])
  })
})
