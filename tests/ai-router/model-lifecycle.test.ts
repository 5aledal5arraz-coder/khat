/**
 * Model end-of-life detection.
 *
 * Two failure modes this guards, and they pull in OPPOSITE directions:
 *   • Silence — a model we depend on gets switched off and nothing warned.
 *   • Noise   — a retirement 80+ days out shouting every morning until the
 *     operator stops reading the band, at which point the real alert is
 *     invisible too. The 30-day threshold and the "only models we actually
 *     depend on" filter exist to hold that line, so both are pinned here.
 *
 * Pure: `findEolRisks` takes the clock and both dependency sets as
 * arguments, so every case below is deterministic — no fake timers, no DB.
 */

import { describe, expect, it } from "vitest"
import {
  EOL_WARN_DAYS,
  MODEL_RETIREMENTS,
  daysUntil,
  findEolRisks,
  type ModelRetirement,
} from "@/lib/ai-router/model-lifecycle"

const NOW = new Date("2026-07-26T12:00:00Z")

/** A small, explicit table so threshold tests don't move when reality does. */
const TABLE: readonly ModelRetirement[] = [
  { provider: "gemini", modelName: "retires-in-10", retiresOn: "2026-08-05", source: "test" },
  { provider: "gemini", modelName: "retires-in-30", retiresOn: "2026-08-25", source: "test" },
  { provider: "gemini", modelName: "retires-in-31", retiresOn: "2026-08-26", source: "test" },
  { provider: "gemini", modelName: "retires-in-82", retiresOn: "2026-10-16", source: "test" },
  { provider: "gemini", modelName: "already-gone", retiresOn: "2026-06-01", source: "test" },
]

describe("daysUntil", () => {
  it("counts whole UTC days and goes negative once the date has passed", () => {
    expect(daysUntil("2026-08-05", NOW)).toBe(10)
    expect(daysUntil("2026-07-26", NOW)).toBe(0)
    expect(daysUntil("2026-06-01", NOW)).toBe(-55)
  })

  it("does not drift with the time of day the page is loaded", () => {
    const earlyMorning = new Date("2026-07-26T00:00:01Z")
    const lateNight = new Date("2026-07-26T23:59:59Z")
    expect(daysUntil("2026-08-05", earlyMorning)).toBe(daysUntil("2026-08-05", lateNight))
  })

  it("returns null for an unparseable date rather than a misleading number", () => {
    expect(daysUntil("not-a-date", NOW)).toBeNull()
  })
})

describe("findEolRisks — the 30-day threshold", () => {
  const allUsed = TABLE.map((t) => t.modelName)

  it("warns at exactly 30 days, stays silent at 31", () => {
    const risks = findEolRisks({
      selectedModels: [],
      recentlyUsedModels: allUsed,
      now: NOW,
      retirements: TABLE,
    })
    const names = risks.map((r) => r.modelName)
    expect(names).toContain("retires-in-30")
    expect(names).not.toContain("retires-in-31")
    expect(EOL_WARN_DAYS).toBe(30)
  })

  it("something 82 days out does NOT shout — that is the whole anti-noise rule", () => {
    const risks = findEolRisks({
      selectedModels: [],
      recentlyUsedModels: ["retires-in-82"],
      now: NOW,
      retirements: TABLE,
    })
    expect(risks).toEqual([])
  })

  it("flags an already-retired model as retired, with negative days left", () => {
    const risks = findEolRisks({
      selectedModels: [],
      recentlyUsedModels: ["already-gone"],
      now: NOW,
      retirements: TABLE,
    })
    expect(risks).toHaveLength(1)
    expect(risks[0]).toMatchObject({ modelName: "already-gone", retired: true })
    expect(risks[0].daysLeft).toBeLessThan(0)
  })

  it("sorts most urgent first — retired models lead", () => {
    const risks = findEolRisks({
      selectedModels: [],
      recentlyUsedModels: allUsed,
      now: NOW,
      retirements: TABLE,
    })
    expect(risks.map((r) => r.modelName)).toEqual([
      "already-gone",
      "retires-in-10",
      "retires-in-30",
    ])
  })
})

describe("findEolRisks — only models we actually depend on", () => {
  it("says NOTHING about a retiring model we neither select nor call", () => {
    const risks = findEolRisks({
      selectedModels: ["some-other-model"],
      recentlyUsedModels: ["yet-another"],
      now: NOW,
      retirements: TABLE,
    })
    expect(risks).toEqual([])
  })

  it("flags a model that is currently SELECTED even with zero recent calls", () => {
    const risks = findEolRisks({
      selectedModels: ["retires-in-10"],
      recentlyUsedModels: [],
      now: NOW,
      retirements: TABLE,
    })
    expect(risks).toHaveLength(1)
    expect(risks[0].reason).toBe("selected")
  })

  it("flags a model that was USED recently even if nothing selects it now", () => {
    const risks = findEolRisks({
      selectedModels: [],
      recentlyUsedModels: ["retires-in-10"],
      now: NOW,
      retirements: TABLE,
    })
    expect(risks[0].reason).toBe("used")
  })

  it("`selected` outranks `used` when both apply — it is the actionable one", () => {
    const risks = findEolRisks({
      selectedModels: ["retires-in-10"],
      recentlyUsedModels: ["retires-in-10"],
      now: NOW,
      retirements: TABLE,
    })
    expect(risks[0].reason).toBe("selected")
  })
})

describe("the shipped retirement table", () => {
  it("every entry carries a parseable date and dated provenance", () => {
    expect(MODEL_RETIREMENTS.length).toBeGreaterThan(0)
    for (const entry of MODEL_RETIREMENTS) {
      expect(daysUntil(entry.retiresOn, NOW), entry.modelName).not.toBeNull()
      // An undated claim about the future is not evidence.
      expect(entry.source, entry.modelName).toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it("carries gemini-2.0-flash, which is ALREADY retired and still priced in the registry", () => {
    const entry = MODEL_RETIREMENTS.find((m) => m.modelName === "gemini-2.0-flash")
    expect(entry).toBeDefined()
    expect(daysUntil(entry!.retiresOn, NOW)!).toBeLessThan(0)
  })

  /**
   * The gemini-2.5 family carried 2026-10-16 (read 2026-07-24). Re-checked
   * 2026-08-07: Google's deprecations page now says "No shutdown date
   * announced" for all three, so the entries were REMOVED. This test is the
   * guard against someone re-adding a withdrawn date from memory — the
   * banner it would have fired on 2026-09-16 is exactly the false alarm this
   * module says costs more trust than the warning is worth.
   */
  it("carries NO gemini-2.5 entry — Google withdrew the date", () => {
    const twoFive = MODEL_RETIREMENTS.filter((m) => m.modelName.startsWith("gemini-2.5"))
    expect(twoFive).toEqual([])

    // And an undated model must stay silent even when it IS what we run.
    const risks = findEolRisks({
      selectedModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
      recentlyUsedModels: [],
      now: NOW,
    })
    expect(risks).toEqual([])
  })

  it("carries gemini-3.1-flash-lite's real date, which the table was missing", () => {
    const entry = MODEL_RETIREMENTS.find((m) => m.modelName === "gemini-3.1-flash-lite")
    expect(entry).toBeDefined()
    expect(entry!.retiresOn).toBe("2027-05-07")
    // Far out, so it must NOT warn today — the 30-day rule, on a real date.
    expect(
      findEolRisks({
        selectedModels: ["gemini-3.1-flash-lite"],
        recentlyUsedModels: [],
        now: NOW,
      })
    ).toEqual([])
  })
})
