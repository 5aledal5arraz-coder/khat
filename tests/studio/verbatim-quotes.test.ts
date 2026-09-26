/**
 * The verbatim guard: a Studio quote reaches the episode page under the
 * guest's name and photo, so it must be a span of what was actually said.
 * The fabricated line below is the real one that ranked #2 on Google for
 * صلاح الغزالي — absent from his 19,683-word transcript.
 */
import { describe, it, expect } from "vitest"
import {
  filterVerbatimQuotes,
  foldVerbatim,
  isVerbatimIn,
  buildVerbatimHaystack,
} from "@/lib/studio/verbatim"

// ASR orthography: no hamza on «الاسر», «اخرج» and a taa-marbuta as haa.
const TRANSCRIPT =
  "المقدم: كيف كانت البداية؟\n" +
  "الضيف: والله يوم دخلت الاسر ما كنت اعرف اني بطلع منه، " +
  "كل يوم كنت اقول لنفسي هذا اخر يوم وبعدين يجي يوم ثاني. " +
  "الحريه ما تعرف قيمتها الا اذا انسلبت منك."

describe("foldVerbatim", () => {
  it("folds hamza, taa marbuta, alef maqsura, tashkeel and punctuation", () => {
    expect(foldVerbatim("الأَسْر، إلى الحرية!")).toBe(foldVerbatim("الاسر الي الحريه"))
  })

  it("folds hamza on waw/yaa, Arabic-Indic digits, and NFC", () => {
    expect(foldVerbatim("مسؤول هيئة")).toBe("مسوول هييه")
    expect(foldVerbatim("سنة ١٩٩٠ و۱۹۹۱")).toBe("سنه 1990 و1991")
    // «آ» written decomposed (alef + combining madda) is the same letter.
    expect(foldVerbatim("\u0627\u0653خر")).toBe(foldVerbatim("آخر"))
  })
})

describe("filterVerbatimQuotes", () => {
  it("drops a fabricated quote the guest never said", () => {
    const { kept, dropped } = filterVerbatimQuotes(
      [{ text: "تجربة الأسر علمتني قيمة الحياة والحرية", theme: "حرية", speaker: "guest" }],
      TRANSCRIPT,
    )
    expect(kept).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  it("keeps a real quote even when the model restored the spelling the ASR dropped", () => {
    const { kept, dropped } = filterVerbatimQuotes(
      [
        // Model wrote «الأسر» / «الحرية» / «أعرف» with hamza + taa marbuta.
        { text: "يوم دخلت الأسر ما كنت أعرف أني بطلع منه", theme: "الأسر", speaker: "guest" },
        { text: "«الحرية ما تعرف قيمتها إلا إذا انسلبت منك»", theme: "الحرية", speaker: "guest" },
      ],
      TRANSCRIPT,
    )
    expect(dropped).toHaveLength(0)
    expect(kept).toHaveLength(2)
  })

  it("drops a quote reworded by a single word", () => {
    const { dropped } = filterVerbatimQuotes(
      [{ text: "الحرية ما تعرف قيمتها إلا إذا ضاعت منك", theme: null, speaker: "guest" }],
      TRANSCRIPT,
    )
    expect(dropped).toHaveLength(1)
  })

  it("is word-bounded — a word does not match inside a longer word", () => {
    const hay = buildVerbatimHaystack("نتكلم عن الحريات العامة في الكويت")
    expect(isVerbatimIn("عن الحري العامة", hay)).toBe(false)
    expect(isVerbatimIn("عن الحريات العامة", hay)).toBe(true)
  })

  it("is word-bounded at the START too — «كلم عن الحريات» is not inside «نتكلم»", () => {
    const hay = buildVerbatimHaystack("نتكلم عن الحريات العامة في الكويت")
    expect(isVerbatimIn("كلم عن الحريات", hay)).toBe(false)
    expect(isVerbatimIn("نتكلم عن الحريات", hay)).toBe(true)
  })

  it("tolerates a proclitic the recogniser split off, in either direction", () => {
    // The real oNyFz82BVzY case: the transcript has «ل فحني», the quote «لفحني».
    const split = buildVerbatimHaystack("أول ما نزلت من الباص ل فحني الهوا، راح صوتي")
    expect(isVerbatimIn("نزلت من الباص لفحني الهوا", split)).toBe(true)
    const joined = buildVerbatimHaystack("قال فصارت أول رحلة الساعة 8 الصبح")
    expect(isVerbatimIn("ف صارت أول رحلة", joined)).toBe(true)
    // A quote that starts right after a detached «و» still matches.
    const lead = buildVerbatimHaystack("قال و الحرية ما تعرف قيمتها")
    expect(isVerbatimIn("الحرية ما تعرف قيمتها", lead)).toBe(true)
  })

  it("the proclitic tolerance never lets a different word or a mid-word match through", () => {
    const hay = buildVerbatimHaystack("أول ما نزلت من الباص لفحني الهوا راح صوتي")
    expect(isVerbatimIn("الباص ل فحنا الهوا", hay)).toBe(false)
    // «ك لم» re-attaches to «كلم», which is still not a word of «نتكلم».
    const mid = buildVerbatimHaystack("نتكلم عن الحريات العامة")
    expect(isVerbatimIn("ك لم عن الحريات", mid)).toBe(false)
    // A match can never span the two copies inside the haystack.
    const edge = buildVerbatimHaystack("بداية النص هنا ونهاية النص هناك")
    expect(isVerbatimIn("النص هناك بداية النص", edge)).toBe(false)
  })

  it("rejects fragments too short to prove anything, and non-string text", () => {
    const { kept, dropped } = filterVerbatimQuotes(
      [{ text: "الاسر" }, { text: "" }, { text: 42 as unknown as string }],
      TRANSCRIPT,
    )
    expect(kept).toHaveLength(0)
    expect(dropped).toHaveLength(3)
  })
})
