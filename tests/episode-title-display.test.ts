/**
 * `displayEpisodeTitle` — the display-only strip of the YouTube brand stamp.
 *
 * Every case below is a REAL title from the 42 published rows in the local
 * database on 2026-08-02, not an invented one: the whole risk in this helper is
 * that the tail has more shapes than anyone assumed, so the fixtures have to be
 * the actual shapes.
 */
import { describe, it, expect } from "vitest"
import { displayEpisodeTitle, isBrandStampName } from "@/lib/shared/formatters"
import { searchEpisodes } from "@/lib/search"
import type { Episode } from "@/types/database"

/** The seven distinct tail shapes found across the 42 rows. */
const REAL: Array<[string, string]> = [
  // «|001 بودكاست خط» — no space after the pipe
  [
    "قصة الأسير السابق ناصر سالمين و أحداث الإعتقالات في العراق |001 بودكاست خط",
    "قصة الأسير السابق ناصر سالمين و أحداث الإعتقالات في العراق",
  ],
  // «| 019 بودكاست خط»
  ["قصة لجوء الخطاط السوري حسام مطر | 019 بودكاست خط", "قصة لجوء الخطاط السوري حسام مطر"],
  // «| 006 - بودكاست خط» — a dash between number and brand
  [
    "الشعب المنبوذ الذي سيطر على اقتصاد العالم | 006 - بودكاست خط",
    "الشعب المنبوذ الذي سيطر على اقتصاد العالم",
  ],
  // «جاسم عباس- 003 بودكاست خط» — dash glued to the preceding word
  ["السفر بشكل مختلف | جاسم عباس- 003 بودكاست خط", "السفر بشكل مختلف | جاسم عباس"],
  // «.. مقاطع من بودكاست خط»
  ["مشاهد من داخل العراق.. مقاطع من بودكاست خط", "مشاهد من داخل العراق"],
  // «! مقاطع بودكاست خط» — «مقاطع» without «من»
  [
    "ماتوقع يلقاه.. ولقاه بالمعتقل صدفه! مقاطع بودكاست خط",
    "ماتوقع يلقاه.. ولقاه بالمعتقل صدفه!",
  ],
  // «| سالفة 06» — series marker, no brand at all
  ["كيف تصبح مليونيراً .! | سالفة 06", "كيف تصبح مليونيراً .!"],
  // «| 04» — a bare number, no brand and no series word
  ["تزاحم الحجاج في رمي الجمرات | 04", "تزاحم الحجاج في رمي الجمرات"],
]

describe("displayEpisodeTitle", () => {
  it.each(REAL)("strips the stamp from %s", (input, expected) => {
    expect(displayEpisodeTitle(input)).toBe(expected)
  })

  it("keeps «سالفة» when it is the subject, not a series marker", () => {
    // «سالفة» + a WORD is content; only «سالفة» + digits is the stamp. Both of
    // these rows exist, and an earlier draft that keyed on the word alone ate
    // half of each title.
    expect(displayEpisodeTitle("كلنا نخطئ فـ نحن بشر.. سالفة الخـطّـاؤون | 02")).toBe(
      "كلنا نخطئ فـ نحن بشر.. سالفة الخـطّـاؤون",
    )
    expect(displayEpisodeTitle("سالفة الشيخ صباح الأحمد وغلاء المهور | 01")).toBe(
      "سالفة الشيخ صباح الأحمد وغلاء المهور",
    )
  })

  it("leaves a guest name that happens to sit in the tail", () => {
    // Only 1 of 42 rows has a linked guest, so for the rest the name inside the
    // title is the ONLY place it appears — removing it would delete data from
    // the page, not repetition.
    expect(
      displayEpisodeTitle(
        'قصة "كافيه دوز" ورحلتها من 15 ألف إلى 12 مليون دولار | جاسم العبوة - 002 بودكاست خط',
      ),
    ).toBe('قصة "كافيه دوز" ورحلتها من 15 ألف إلى 12 مليون دولار | جاسم العبوة')
  })

  it("never removes a number that is part of the sentence", () => {
    // A bare number is only a stamp behind a PIPE. A hyphen would also match
    // «كوفيد - 19», and four digits are never an episode number.
    expect(displayEpisodeTitle("ما حدث في عام 2024")).toBe("ما حدث في عام 2024")
    expect(displayEpisodeTitle("كوفيد - 19 وما بعده")).toBe("كوفيد - 19 وما بعده")
    expect(displayEpisodeTitle("قصة كوفيد - 19")).toBe("قصة كوفيد - 19")
  })

  it("never returns an empty string", () => {
    // If the stamp IS the whole title, the number is the only identifier left
    // and the original has to survive.
    expect(displayEpisodeTitle("بودكاست خط")).toBe("بودكاست خط")
    expect(displayEpisodeTitle("| 03")).toBe("| 03")
    expect(displayEpisodeTitle("سالفة 06")).toBe("سالفة 06")
  })

  it("leaves a title with no stamp untouched", () => {
    expect(displayEpisodeTitle("smoke-ux3b-published-episode")).toBe(
      "smoke-ux3b-published-episode",
    )
  })

  it("handles null/undefined/blank", () => {
    expect(displayEpisodeTitle(null)).toBe("")
    expect(displayEpisodeTitle(undefined)).toBe("")
    expect(displayEpisodeTitle("   ")).toBe("")
  })

  it("is stable — running it twice changes nothing", () => {
    for (const [input] of REAL) {
      const once = displayEpisodeTitle(input)
      expect(displayEpisodeTitle(once)).toBe(once)
    }
  })

  it("produces no collisions across the real archive", () => {
    // Two cards that read identically would be worse than the repetition.
    const cleaned = REAL.map(([input]) => displayEpisodeTitle(input))
    expect(new Set(cleaned).size).toBe(cleaned.length)
  })
})

/**
 * The peel loop — `for (let i = 0; i < 4; i++)` in displayEpisodeTitle.
 *
 * Every fixture above is stripped by a SINGLE pass, so the loop was untested
 * headroom: mutating the bound to `i < 1` left the whole suite green. Measured
 * against the 42 stored titles in the local database on 2026-08-02, the
 * histogram of passes-to-stable is {0: 11, 1: 31} — the archive has never
 * needed a second pass, so the 4 is deliberate headroom for a COMPOUND stamp,
 * not a number the data asked for.
 *
 * Headroom still has to be a number someone can defend, so these tests pin it:
 * a two-pass shape and a four-pass shape make `i < 1`, `i < 2` and `i < 3` all
 * fail, and the five-repeat case documents where the ceiling actually is
 * instead of implying there is none.
 */
describe("displayEpisodeTitle peels a compound stamp until it is stable", () => {
  const BRAND = "بودكاست خط"

  it("strips a doubled stamp that one pass would leave half-eaten", () => {
    // «مقاطع من بودكاست خط» behind «| 019 بودكاست خط». Pass 1 removes the
    // numbered stamp and EXPOSES the clips stamp; only pass 2 removes that.
    const input = `لقاء مميز مقاطع من ${BRAND} | 019 ${BRAND}`
    expect(displayEpisodeTitle(input)).toBe("لقاء مميز")
  })

  it("peels four repetitions — the exact bound the loop declares", () => {
    const input = `حوار عميق ${BRAND} ${BRAND} ${BRAND} ${BRAND}`
    expect(displayEpisodeTitle(input)).toBe("حوار عميق")
  })

  it("stops at four and returns a sane string rather than looping", () => {
    // The ceiling, stated rather than implied: a fifth repetition survives.
    // It still returns real text, never an empty string — that is the
    // guarantee, and it is what makes a bounded loop acceptable here.
    const input = `حوار عميق ${BRAND} ${BRAND} ${BRAND} ${BRAND} ${BRAND}`
    const out = displayEpisodeTitle(input)
    expect(out).toBe(`حوار عميق ${BRAND}`)
    expect(out.length).toBeGreaterThan(0)
  })

  it("is idempotent within the bound", () => {
    // The property the loop exists to provide, and the honest scope of it: a
    // BOUNDED peel cannot be idempotent past its own bound — the five-repeat
    // case above is stripped further on a second call, by construction. That
    // is precisely why the bound is a documented number with tests on it
    // rather than a silent `4`. Everything at or under the bound is stable.
    const inputs = [
      ...REAL.map(([i]) => i),
      `لقاء مميز مقاطع من ${BRAND} | 019 ${BRAND}`,
      `حوار عميق ${BRAND} ${BRAND} ${BRAND} ${BRAND}`,
      "ما حدث في عام 2024",
      "| 03",
    ]
    for (const input of inputs) {
      const once = displayEpisodeTitle(input)
      expect(displayEpisodeTitle(once)).toBe(once)
    }
  })
})

describe("search still matches the stored title, not the display title", () => {
  const episodes = REAL.map(([title], i) => ({
    id: `e${i}`,
    title,
    slug: `s${i}`,
  })) as unknown as Episode[]

  it("finds an episode by a word that only exists in the stripped stamp", () => {
    // This is the regression that would make the strip a data bug rather than
    // a display change: `searchEpisodes` reads `episode.title`, so the stamp
    // must remain searchable even though it is no longer painted.
    expect(searchEpisodes(episodes, "بودكاست خط").length).toBeGreaterThan(0)
    expect(searchEpisodes(episodes, "019").length).toBe(1)
    expect(searchEpisodes(episodes, "مقاطع").length).toBe(2)
  })

  it("still finds an episode by words that survive into the display title", () => {
    const hits = searchEpisodes(episodes, "الخطاط")
    expect(hits).toHaveLength(1)
    expect(displayEpisodeTitle(hits[0].title)).toBe("قصة لجوء الخطاط السوري حسام مطر")
  })

  it("would MISS the stamp if the display title were ever indexed", () => {
    // Guards the inverse mistake: someone "simplifying" by storing the clean
    // title. Searching the cleaned corpus for the brand finds nothing.
    const cleaned = episodes.map((e) => ({ ...e, title: displayEpisodeTitle(e.title) }))
    expect(searchEpisodes(cleaned, "019")).toHaveLength(0)
  })
})

describe("isBrandStampName — the guest badge that was never a guest", () => {
  it("rejects every derived name the archive actually rendered", () => {
    // All 34 non-person badges seen on /episodes on 2026-08-02, reduced to
    // their distinct shapes.
    for (const junk of [
      "019 بودكاست خط",
      "001 بودكاست خط",
      "بودكاست خط",
      "مقاطع من بودكاست خط",
      "مقاطع بودكاست خط",
      "006 - بودكاست خط",
      "سالفة 06",
      "سالفة 01",
      "بودكاست خط 003",
      "بودكاست خط 006",
      "بودكاست خط - 007",
      "01",
      "04",
      "٠٣",
      "",
      "   ",
    ]) {
      expect(isBrandStampName(junk), junk).toBe(true)
    }
  })

  it("keeps a real person, including one with a title or a digit", () => {
    for (const person of [
      "الأستاذ علي دريساوي",
      "الدكتور الحارث المزيدي",
      "الملازم عبدالله البطي",
      "جاسم العبوة",
      "حسام مطر",
      "محمد 2",       // a digit inside a name is not a stamp
      "خط بودكاست الثاني",
    ]) {
      expect(isBrandStampName(person), person).toBe(false)
    }
  })

  it("does NOT catch a title fragment that reads like prose", () => {
    // Documented limitation: «سالفة فيصل مع العملاء في البنك» is sliced by the
    // `مع …` pattern into «العملاء في البنك», which is indistinguishable from
    // a name. It needs the title fixed, not a cleverer regex.
    expect(isBrandStampName("العملاء في البنك")).toBe(false)
  })
})
