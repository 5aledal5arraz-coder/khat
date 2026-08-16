import { describe, it, expect } from "vitest"
import { episodeDescriptionProse, parseDescriptionChapters } from "@/lib/shared/formatters"

/**
 * THE FIXTURE IS THE REAL THING, copied off khatpodcast.com.
 *
 * The first version of `episodeDescriptionProse` was written against the شكل I
 * had seen on حسام مطر's page — a «الفقرات الزمنية:» heading with `00:00 title`
 * rows. It passed locally, shipped, and did nothing on صلاح الغزالي's live page,
 * because THAT episode labels the block «محاور الحلقة» and puts the time at the
 * END of the line («المقدمة 00:00»). Two episodes, two formats, and a rule built
 * from one of them.
 *
 * So the test carries the production text verbatim. A cleaner that cannot be
 * shown the real input is a cleaner that will keep being surprised by it.
 */
const LIVE_GHAZALI = `تعتبر هذه الحلقة وثيقة تاريخية مهمة جداً ، حيث تقدم شهادة عيان لأحداث الغزو العراقي الذي قاده البعثيون للكويت. يستعرض الغزالي تجربته الشخصية بصراحة وشفافية وإحترافية عالية ، ويقدم رؤى قيمة حول المقاومة الشعبية الكويتية. هذه الحلقة هي فرصة للجيل الحالي والأجيال القادمة للتعرف على هذه الحقبة التاريخية المهمة، وتقدير تضحيات الشعب الكويتي بكافة شرائحه .
محاور الحلقة:

المقدمة 00:00
سور الكويت الرابع 00:17
حياة صلاح الغزالي قبل الغزو 5:20
وصول أنباء الغزو العراقي و اتخاذ قرار العودة للكويت 24:09
الخاتمة 3:16:24

شكراً للأستاذ "صلاح الغزالي" على توفيره للنسخة الإلكترونية
من موسوعته سور الكويت الرابع :

الجزء الاول: https://bit.ly/3WmHrrS
الجزء الثاني: https://bit.ly/4fqor4H


حساب الضيف على الإنستغرام : https://bit.ly/4dsERI6
بودكاست خط على تويتر: https://bit.ly/3UAnlez


الهاشتاقات

#الغزو_العراقي_للكويت
#المقاومة_الشعبية
#بودكاست_خط`

/** The other shape, from حسام مطر — heading + leading timestamps. */
const LIVE_MATAR = `في هذه الحلقة من بودكاست "خط"، نستضيف الخطاط السوري البارز حسام مطر.

هاشتاقات:
#بودكاست_خط #حسام_مطر #الخط_العربي

الفقرات الزمنية:
00:00 حوار جانبي
07:00 بداية البودكاست
01:03:01 الوصول الى الكويت

حساب الضيف : حسام مطر
https://www.instagram.com/husam_matar/`

describe("episodeDescriptionProse strips the YouTube tail, not the writing", () => {
  it("keeps the prose paragraph on the live الغزالي description", () => {
    const out = episodeDescriptionProse({ summary: LIVE_GHAZALI, description: null })
    expect(out).toBeTruthy()
    expect(out).toContain("تعتبر هذه الحلقة وثيقة تاريخية")
    expect(out).toContain("تضحيات الشعب الكويتي")
  })

  it("removes every link, hashtag and chapter row from BOTH shapes", () => {
    for (const [name, src] of [
      ["ghazali", LIVE_GHAZALI],
      ["matar", LIVE_MATAR],
    ] as const) {
      const out = episodeDescriptionProse({ summary: src, description: null }) ?? ""
      expect(out, `${name}: a URL survived`).not.toMatch(/https?:\/\//)
      expect(out, `${name}: a hashtag survived`).not.toMatch(/#[\p{L}_]+/u)
      // A chapter row, whichever end the clock sits on.
      expect(out, `${name}: a leading timestamp survived`).not.toMatch(/^\d{1,2}:\d{2}/m)
      expect(out, `${name}: a trailing timestamp survived`).not.toMatch(/\d{1,2}:\d{2}(:\d{2})?\s*$/m)
      expect(out, `${name}: a boilerplate heading survived`).not.toMatch(
        /محاور الحلقة|الفقرات الزمنية|الهاشتاقات|هاشتاقات:/,
      )
      // «حساب الضيف : حسام مطر» — the LABEL for a link that sits on the next
      // line, so it outlived the URL and shipped as the last visible sentence
      // of the summary. Found on the live مطر page after the first fix.
      expect(out, `${name}: an account label survived`).not.toMatch(/^حساب/m)
      // The dangling lead-in to a link list must go with the list it introduces.
      expect(out, `${name}: an orphaned colon lead-in survived`).not.toMatch(/:\s*$/)
    }
  })

  it("SCRUBS `summary` too, not only `description`", () => {
    // The production bug in one assertion: `summary` used to be returned
    // untouched, and in production it is a pre-override copy of `description`.
    const out = episodeDescriptionProse({ summary: LIVE_GHAZALI, description: "clean" })
    expect(out).not.toMatch(/bit\.ly/)
  })

  it("leaves a description that is only prose completely alone", () => {
    const prose = "فقرة أولى تحكي القصة.\n\nفقرة ثانية تكملها."
    expect(episodeDescriptionProse({ summary: null, description: prose })).toBe(prose)
  })

  it("returns null rather than an empty string when nothing survives", () => {
    expect(
      episodeDescriptionProse({ summary: null, description: "#tag\nhttps://x.co" }),
    ).toBeNull()
  })
})

describe("parseDescriptionChapters reads the producer's real index", () => {
  it("prefers real times over the AI's invented ones on الغزالي", () => {
    const rows = parseDescriptionChapters(LIVE_GHAZALI)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows[0]).toEqual({ title: "المقدمة", seconds: 0 })
    // «الخاتمة 3:16:24» — the enrichment claimed the episode ended at 40:00.
    expect(rows[rows.length - 1]).toEqual({ title: "الخاتمة", seconds: 3 * 3600 + 16 * 60 + 24 })
  })

  it("reads the other shape, where the clock leads", () => {
    const rows = parseDescriptionChapters(LIVE_MATAR)
    expect(rows.map((r) => r.seconds)).toEqual([0, 420, 3781])
    expect(rows[2].title).toBe("الوصول الى الكويت")
  })

  it("refuses a stray time rather than inventing an index", () => {
    expect(parseDescriptionChapters("قابلت 85 شخصية في 2:30 من الحديث.")).toEqual([])
    expect(parseDescriptionChapters(null)).toEqual([])
  })

  it("refuses a list that runs backwards — that means it mis-parsed", () => {
    expect(parseDescriptionChapters("أ 10:00\nب 5:00\nج 20:00")).toEqual([])
  })
})

describe("the three real chapter formats on this channel", () => {
  it("bulleted rows with a leading clock — 017 حلويات الفيصل", () => {
    const src = "نصّ.\n\nالفواصل الزمنية:\n\n • 00:00 المقدمة\n • 01:35 بداية البودكاست\n • 03:45 فكرة إنشاء حلويات الفيصل"
    expect(parseDescriptionChapters(src).map((r) => r.seconds)).toEqual([0, 95, 225])
    expect(episodeDescriptionProse({ summary: src, description: null })).toBe("نصّ.")
  })

  it("a clock GLUED to the title with no space — 004 and 005", () => {
    // Ordered, as a real list is — my first fixture had them backwards and the
    // monotonic check correctly threw the whole list away.
    // Three rows minimum — the parser refuses a shorter list rather than treat
    // a stray time in a sentence as an index. My first fixture had two.
    const src =
      "نصّ.\n\nمحاور الحلقة:\nالمقدمة 0:00\nالولاء بدون تسويق34:00\nكيف أثرت الكتب على فكرة الزواج ؟1:18:19"
    expect(parseDescriptionChapters(src).map((r) => r.seconds)).toEqual([0, 2040, 4699])
    expect(episodeDescriptionProse({ summary: src, description: null })).toBe("نصّ.")
  })
})
