/**
 * Lens re-scope approved by Khaled on 2026-10-03 (rashid's recommendation):
 *
 *   - `controversy` «جدلي» is RETIRED — dispute for its own sake is not Khat.
 *     The id + label stay so stored chips still render.
 *   - `power` «سلطة» is power inside the guest's own family or work — never
 *     states, governments or public figures.
 *   - `media` «إعلامي» is the guest's own experience of being seen / the price
 *     of fame (constitution field `media_price_of_fame`) — not narrative-making.
 *   - `crime_conflict` «النجاة والعودة» (label renamed from «جريمة وصراع») is
 *     survival / prison re-entry as lived experience — no scandal, never naming
 *     a third party.
 */
import { describe, it, expect } from "vitest"

import {
  OFFERED_THINKING_LENSES,
  RETIRED_LENS_IDS,
  clampLenses,
  lensById,
  lensLabel,
} from "@/lib/khat-map/v2/lenses"
import { buildLensesBlock } from "@/lib/khat-map/v2/prompts-editorial"
import { buildEnrichSystemPrompt } from "@/lib/khat-map/v2/prompts-enrich"

const offeredIds = () => OFFERED_THINKING_LENSES.map((l) => l.id)

describe("retired `controversy` lens", () => {
  it("is retired and absent from the offered menu", () => {
    expect(RETIRED_LENS_IDS.has("controversy")).toBe(true)
    expect(offeredIds()).not.toContain("controversy")
  })

  it("is absent from the prompt menu both engines embed", () => {
    for (const text of [buildLensesBlock(), buildEnrichSystemPrompt()]) {
      // The menu line, not the word: the creative brief legitimately warns
      // against "controversy for its own sake", and the constitution says «جدلي».
      expect(text).not.toMatch(/·\s*controversy\b/)
      expect(text).not.toContain("(جدلي)")
    }
  })

  it("is stripped from new model output — by id and by Arabic label", () => {
    expect(clampLenses(["controversy", "psychological"])).toEqual(["psychological"])
    expect(clampLenses(["جدلي", "نفسي"])).toEqual(["psychological"])
    expect(clampLenses(['["controversy"]', "power"])).toEqual(["power"])
  })

  it("still renders a stored chip", () => {
    expect(lensById("controversy")?.label_ar).toBe("جدلي")
    expect(lensLabel("controversy")).toBe("جدلي")
  })
})

describe("re-scoped lenses stay offered with lived-experience hints", () => {
  it("power, media and crime_conflict are still offered and accepted", () => {
    for (const id of ["power", "media", "crime_conflict"]) {
      expect(offeredIds()).toContain(id)
      expect(RETIRED_LENS_IDS.has(id)).toBe(false)
    }
    expect(clampLenses(["power", "media", "crime_conflict"])).toEqual([
      "power",
      "media",
      "crime_conflict",
    ])
  })

  it("power = the guest's family or work, never states or public figures", () => {
    const hint = lensById("power")!.hint_ar
    expect(hint).toContain("أسرته")
    expect(hint).toContain("عمله")
    expect(hint).toMatch(/لا دول ولا حكومات ولا شخصيات عامة/)
  })

  it("media = the guest's own experience of fame, not narrative/propaganda", () => {
    const hint = lensById("media")!.hint_ar
    expect(hint).toContain("الشهرة")
    expect(hint).toContain("الثمن")
    expect(hint).toMatch(/لا صناعة رواية ولا دعاية/)
    expect(hint).not.toContain("كيف تُصاغ الرواية")
  })

  it("crime_conflict = survival / prison re-entry, no scandal, no third party", () => {
    const hint = lensById("crime_conflict")!.hint_ar
    expect(hint).toContain("النجاة")
    expect(hint).toContain("السجن والعودة للمجتمع")
    expect(hint).toContain("لا فضائح")
    expect(hint).toContain("طرف ثالث")
  })

  it("crime_conflict is labelled «النجاة والعودة» — same id, old label gone", () => {
    expect(lensLabel("crime_conflict")).toBe("النجاة والعودة")
    expect(clampLenses(["النجاة والعودة"])).toEqual(["crime_conflict"])
    expect(buildLensesBlock()).not.toContain("جريمة وصراع")
  })

  it("the prompt menu carries the re-scoped hints", () => {
    const menu = buildLensesBlock()
    for (const id of ["power", "media", "crime_conflict"]) {
      expect(menu).toContain(`· ${id} (${lensById(id)!.label_ar}): ${lensById(id)!.hint_ar}`)
    }
  })

  it("the menu's worked example scopes power to the family business", () => {
    const menu = buildLensesBlock()
    expect(menu).not.toContain("history + power + psychology")
    expect(menu).toContain("who decides inside")
    expect(menu).toContain("the family business")
  })
})
