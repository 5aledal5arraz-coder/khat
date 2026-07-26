/**
 * Registry pricing — cost telemetry is only honest if every model we can
 * actually reach has rates. `lookupPricing` returning null writes a NULL
 * `cost_usd`, and `sum()` in Postgres skips NULLs, so an unpriced model reads
 * as a discount in every cost report. These tests pin the known rates and the
 * guard that makes an unknown model visible.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest"
import {
  lookupPricing,
  getUnpricedModels,
  resetUnpricedModels,
  registerRuntimePricing,
} from "@/lib/ai-router/registry"

describe("Gemini pricing coverage", () => {
  // Rates verified against ai.google.dev/gemini-api/docs/pricing on
  // 2026-07-25 (page last updated 2026-07-21).
  it("prices gemini-3.5-flash", () => {
    expect(lookupPricing("gemini", "gemini-3.5-flash")).toEqual({
      inputCostPer1M: 1.5,
      outputCostPer1M: 9,
    })
  })

  it("prices gemini-3.1-pro-preview", () => {
    expect(lookupPricing("gemini", "gemini-3.1-pro-preview")).toEqual({
      inputCostPer1M: 2,
      outputCostPer1M: 12,
    })
  })

  it("still prices the models that were already covered", () => {
    expect(lookupPricing("gemini", "gemini-3.6-flash")).toEqual({
      inputCostPer1M: 1.5,
      outputCostPer1M: 7.5,
    })
    expect(lookupPricing("openai", "gpt-5.6-terra")).toEqual({
      inputCostPer1M: 2.5,
      outputCostPer1M: 15,
    })
  })
})

/**
 * The four models that were reachable on our keys but unregistered — the
 * exact failure the guard above was built to expose. gemini-3.5-flash-lite
 * had already run 7 times with a NULL cost, and a model_benchmarks row for it
 * reported cost_delta_pct = null: the cost gate never ran at all.
 *
 * Rates read 2026-07-26 from the official pricing pages only
 * (ai.google.dev/gemini-api/docs/pricing, page last updated 2026-07-21;
 * developers.openai.com/api/docs/pricing, which publishes no date).
 * Standard tier, short context — the floor, never the batch rate.
 */
describe("previously unpriced but reachable models", () => {
  it("prices gemini-3.5-flash-lite — the one that actually ran uncosted", () => {
    expect(lookupPricing("gemini", "gemini-3.5-flash-lite")).toEqual({
      inputCostPer1M: 0.3,
      outputCostPer1M: 2.5,
    })
  })

  it("prices gemini-3.1-flash-lite", () => {
    expect(lookupPricing("gemini", "gemini-3.1-flash-lite")).toEqual({
      inputCostPer1M: 0.25,
      outputCostPer1M: 1.5,
    })
  })

  it("prices the OpenAI -pro tiers at the short-context floor", () => {
    for (const model of ["gpt-5.5-pro", "gpt-5.4-pro"]) {
      expect(lookupPricing("openai", model), model).toEqual({
        inputCostPer1M: 30,
        outputCostPer1M: 180,
      })
    }
  })

  it("keeps the -pro tiers dearer than every default, so a mis-pin is loud", () => {
    // The whole point of registering these: an override onto a -pro model is a
    // 6×/30× cost event, and before this it registered as $0.00.
    const pro = lookupPricing("openai", "gpt-5.4-pro")!
    const sol = lookupPricing("openai", "gpt-5.6-sol")!
    const luna = lookupPricing("openai", "gpt-5.6-luna")!
    expect(pro.inputCostPer1M).toBeGreaterThan(sol.inputCostPer1M)
    expect(pro.inputCostPer1M).toBeGreaterThan(luna.inputCostPer1M)
  })
})

describe("unpriced-model guard", () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetUnpricedModels()
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
    resetUnpricedModels()
  })

  it("still returns null rather than inventing a price", () => {
    expect(lookupPricing("gemini", "gemini-9.9-unknown")).toBeNull()
  })

  it("records the miss so it can be surfaced instead of passing silently", () => {
    lookupPricing("gemini", "gemini-9.9-unknown")
    expect(getUnpricedModels()).toContain("gemini:gemini-9.9-unknown")
  })

  it("warns on first use only, not on every call", () => {
    lookupPricing("openai", "gpt-9-nonexistent")
    lookupPricing("openai", "gpt-9-nonexistent")
    lookupPricing("openai", "gpt-9-nonexistent")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain("gpt-9-nonexistent")
  })

  it("says which direction the totals are wrong", () => {
    lookupPricing("openai", "gpt-9-nonexistent")
    expect(String(warn.mock.calls[0][0])).toContain("UNDER-report")
  })

  it("does not flag a model whose price was registered at runtime", () => {
    registerRuntimePricing("gemini", "gemini-x-custom", {
      inputCostPer1M: 1,
      outputCostPer1M: 2,
    })
    expect(lookupPricing("gemini", "gemini-x-custom")).toEqual({
      inputCostPer1M: 1,
      outputCostPer1M: 2,
    })
    expect(getUnpricedModels()).not.toContain("gemini:gemini-x-custom")
    expect(warn).not.toHaveBeenCalled()
  })
})
