/**
 * Reading OUR price back out of the package text.
 *
 * ── WHY THIS FILE IS LONG ──────────────────────────────────────────────────
 * The negotiation screen prints «سعرنا مقابل اقتراحهم» with a difference in
 * dinars and a percentage. One side of that subtraction is a `numeric` column;
 * the other is FREE TEXT Khaled typed — «٢٧٥ د.ك للحلقة», «2,750 د.ك للموسم
 * (10 حلقات)», «1,000 – 1,500 د.ك». Every one of those is a chance to derive a
 * confident, wrong number, and a wrong number here is a price decision made on
 * a lie the screen told.
 *
 * So the cases below are not "does it parse" — they are the specific ways it
 * could parse and be wrong: the episode count read as money, the thousands
 * separator splitting one number into two, the Arabic-Indic digits falling
 * through, the range silently collapsing to one end.
 *
 * ── AND THE REFUSALS ARE PAIRED ────────────────────────────────────────────
 * Every case that must come back `unparsed` is followed by the SAME string with
 * only the ambiguity removed, which must parse. Without that pair, a parser
 * that stopped reading anything at all would satisfy every negative assertion
 * in this file and go green.
 */

import { describe, expect, it } from "vitest"
import { comparePrice, parsePackagePrice, perEpisode } from "@/lib/partnerships/price-compare"

describe("parsePackagePrice — the number", () => {
  it("reads a plain Latin figure", () => {
    const p = parsePackagePrice("1500 د.ك")
    expect(p.kind).toBe("single")
    expect(p.amount).toBe(1500)
  })

  it("reads Arabic-Indic digits", () => {
    // ٢٧٥ is U+0662 U+0667 U+0665 — not ASCII. Without the digit fold this
    // returns `unparsed` and the whole comparison silently disappears from the
    // screen for every price Khaled typed on an Arabic keyboard.
    const p = parsePackagePrice("٢٧٥ د.ك")
    expect(p.kind).toBe("single")
    expect(p.amount).toBe(275)
  })

  it("keeps a thousands-separated figure as ONE number", () => {
    // «2,750» must not become 2 and 750 — which would be two candidates, i.e.
    // `unparsed`, i.e. no comparison on the most common price format we use.
    const p = parsePackagePrice("2,750 د.ك")
    expect(p.kind).toBe("single")
    expect(p.amount).toBe(2750)
  })

  it("reads the Arabic decimal separator", () => {
    expect(parsePackagePrice("١٥٠٠٫٧٥٠ د.ك").amount).toBe(1500.75)
  })

  it("returns unparsed for text with no number at all", () => {
    expect(parsePackagePrice("حسب الاتفاق").kind).toBe("unparsed")
    expect(parsePackagePrice("").kind).toBe("unparsed")
    expect(parsePackagePrice(null).kind).toBe("unparsed")
  })

  it("SIGHT: the same sentence WITH a number parses", () => {
    // If this failed, the three assertions above were rejecting something other
    // than "no number".
    expect(parsePackagePrice("حسب الاتفاق — 900 د.ك").amount).toBe(900)
  })
})

describe("parsePackagePrice — the episode count is not money", () => {
  it("does not mistake «10 حلقات» for a second price", () => {
    // THE BUG THIS EXISTS TO PREVENT. Two numbers in the string means
    // "ambiguous" means no comparison — or, worse, an implementation that took
    // the last number would anchor the entire negotiation on 10.
    const p = parsePackagePrice("2,750 د.ك للموسم (10 حلقات)")
    expect(p.kind).toBe("single")
    expect(p.amount).toBe(2750)
    expect(p.episodes).toBe(10)
  })

  it("SIGHT: remove the count and the price is unchanged", () => {
    const p = parsePackagePrice("2,750 د.ك للموسم")
    expect(p.amount).toBe(2750)
    expect(p.episodes).toBeNull()
  })

  it("ignores a count of one — dividing by it would fake a derivation", () => {
    // «350 د.ك — 1 حلقة» must not print «350 للحلقة» as if something had been
    // computed. Nothing was.
    const p = parsePackagePrice("350 د.ك — 1 حلقة")
    expect(p.episodes).toBeNull()
    expect(perEpisode(350, p)).toBeNull()
  })

  it("SIGHT: a count of three DOES divide", () => {
    const p = parsePackagePrice("900 د.ك — 3 حلقات")
    expect(p.episodes).toBe(3)
    expect(perEpisode(900, p)).toBe(300)
  })
})

describe("parsePackagePrice — the basis", () => {
  it.each(["275 د.ك للحلقة", "275 د.ك لكل حلقة", "275 د.ك / حلقة", "275 د.ك في الحلقة"])(
    "reads «%s» as per-episode",
    (text) => {
      const p = parsePackagePrice(text)
      expect(p.basis).toBe("per_episode")
      expect(perEpisode(p.amount!, p)).toBe(275)
    },
  )

  it("SIGHT: without the marker the same figure is a total, not per-episode", () => {
    const p = parsePackagePrice("275 د.ك")
    expect(p.basis).toBe("total")
    expect(perEpisode(275, p)).toBeNull()
  })
})

describe("parsePackagePrice — a range stays a range", () => {
  it.each(["1,000 – 1,500 د.ك", "1000-1500 د.ك", "1000 إلى 1500 د.ك"])(
    "reads «%s» as two numbers, not one",
    (text) => {
      const p = parsePackagePrice(text)
      expect(p.kind).toBe("range")
      expect(p.min).toBe(1000)
      expect(p.max).toBe(1500)
      // And it refuses to pick one. Silently comparing against the low end
      // would make every counter-offer look better than it is.
      expect(p.amount).toBeNull()
    },
  )

  it("orders the bounds even when they were typed backwards", () => {
    const p = parsePackagePrice("1500 – 1000 د.ك")
    expect([p.min, p.max]).toEqual([1000, 1500])
  })

  it("refuses two numbers that are NOT a range", () => {
    // Prose between them: we do not know which is the price.
    expect(parsePackagePrice("500 د.ك مقدماً ثم 700 د.ك عند البث").kind).toBe("unparsed")
  })

  it("SIGHT: the same string with one figure parses", () => {
    expect(parsePackagePrice("700 د.ك عند البث").amount).toBe(700)
  })
})

describe("comparePrice — the difference on screen", () => {
  it("computes the gap in dinars and in percent", () => {
    const c = comparePrice("2,750 د.ك", 2000)
    expect(c.delta).toBe(-750)
    expect(c.deltaPct).toBe(-27)
  })

  it("is positive when they offer MORE than we asked", () => {
    const c = comparePrice("1,000 د.ك", 1200)
    expect(c.delta).toBe(200)
    expect(c.deltaPct).toBe(20)
  })

  it("restates both sides per episode when the text allows it", () => {
    const c = comparePrice("2,750 د.ك للموسم (10 حلقات)", 2000)
    expect(c.ourPerEpisode).toBe(275)
    expect(c.theirPerEpisode).toBe(200)
  })

  it("refuses to compute a difference against a range", () => {
    const c = comparePrice("1,000 – 1,500 د.ك", 1200)
    expect(c.delta).toBeNull()
    expect(c.deltaPct).toBeNull()
    // The raw text survives so the screen can still show what we wrote.
    expect(c.our.raw).toBe("1,000 – 1,500 د.ك")
  })

  it("refuses to compute a difference when they named no figure", () => {
    const c = comparePrice("2,750 د.ك", null)
    expect(c.delta).toBeNull()
    expect(c.deltaPct).toBeNull()
  })

  it("SIGHT: the identical price text DOES compare once both sides are single figures", () => {
    // The control for the two refusals above. If this failed, they were
    // refusing for some reason other than the one being asserted.
    expect(comparePrice("1,200 د.ك", 1200).delta).toBe(0)
  })

  it("keeps the dinar's third decimal", () => {
    expect(comparePrice("1500.750 د.ك", 1500.5).delta).toBe(-0.25)
  })
})
