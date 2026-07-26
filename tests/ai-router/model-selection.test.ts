/**
 * Dynamic model selection — pure/offline (no network, no DB).
 *
 *   1. Registry consistency — every task kind has a fallback chain whose
 *      head IS the registry default (single source of truth).
 *   2. pickModel — precedence (env > config > default), availability
 *      fallback down the chain, fail-open when the catalog is unknown or
 *      exhausted.
 *   3. Catalog helpers — relevant-model filtering, family grouping,
 *      newer-family detection (drives the "adopt via config" banner).
 *   4. Runtime pricing — an override's pricing reaches lookupPricing so
 *      ai_runs cost accounting works for models the registry doesn't know.
 */

import { describe, expect, it } from "vitest"
import {
  DEFAULT_MODELS,
  FALLBACK_CHAINS,
  lookupPricing,
  registerRuntimePricing,
} from "@/lib/ai-router/registry"
import { pickModel, AI_TASK_KINDS } from "@/lib/ai-router/model-selection"
import {
  relevantTextModels,
  detectGptFamilies,
  newerFamilyThanKnown,
} from "@/lib/ai-router/model-catalog"
import type { AiTaskKind } from "@/lib/ai-router/types"

describe("registry ↔ fallback-chain consistency", () => {
  it("every task kind has a chain whose head is the registry default", () => {
    for (const kind of Object.keys(DEFAULT_MODELS) as AiTaskKind[]) {
      const chain = FALLBACK_CHAINS[kind]
      expect(chain?.length, `chain for ${kind}`).toBeGreaterThan(1)
      expect(chain[0], `chain head for ${kind}`).toBe(DEFAULT_MODELS[kind].modelName)
    }
    expect(AI_TASK_KINDS.sort()).toEqual(Object.keys(FALLBACK_CHAINS).sort())
  })

  it("all chain entries have known pricing (cost telemetry never null on fallback)", () => {
    for (const chain of Object.values(FALLBACK_CHAINS)) {
      for (const model of chain) {
        expect(lookupPricing("openai", model), model).not.toBeNull()
      }
    }
  })

  /**
   * Ordering rule: a model we have NO quality evidence for must never sit
   * ahead of one we do. A chain is only ever consulted when something is
   * already broken, so its order is the decision nobody is watching — and
   * an arbitrary rank there quietly degrades output for as long as the
   * fallback lasts.
   *
   * Evidence: Artificial Analysis / AA-Omniscience, read 2026-07-25.
   */
  describe("evidence-based ordering", () => {
    /** Models with a published score. Anything absent is UNSCORED. */
    const SCORED: Record<string, number> = {
      "gpt-5.6-sol": 21.7,
      "gpt-5.6-terra": -0.22,
    }

    /**
     * The rule is one-directional, and the asymmetry is the point:
     * a model with GOOD evidence must never sit below an unscored one —
     * that trades a known-good for a guess. The reverse does NOT hold. A
     * model measured to be BAD (terra, −0.22: it produces more wrong facts
     * than right ones from memory) has not earned a promotion over an
     * unmeasured peer just because we happen to have measured it. So
     * `gpt-5.5` legitimately sits ahead of terra in the editorial chain.
     */
    const isProvenGood = (m: string) => (SCORED[m] ?? -Infinity) > 0

    it("research falls back to the best-scored model before any unscored one", () => {
      const chain = FALLBACK_CHAINS.research
      const sol = chain.indexOf("gpt-5.6-sol")
      const unscored = chain.indexOf("gpt-5.4")
      expect(sol).toBeGreaterThan(-1)
      expect(unscored).toBeGreaterThan(-1)
      // The regression this pins: the chain used to read
      // terra → gpt-5.4 → sol, putting an unscored model ahead of the
      // single best-scored model available to us, on no basis at all.
      expect(sol).toBeLessThan(unscored)
    })

    it("no chain places an unscored model ahead of a PROVEN-GOOD one", () => {
      for (const [kind, chain] of Object.entries(FALLBACK_CHAINS)) {
        // Position 0 is exempt: the head is pinned to the registry default,
        // chosen on cost + grounding policy rather than on this score.
        const tail = chain.slice(1)
        const firstGood = tail.findIndex(isProvenGood)
        if (firstGood === -1) continue
        expect(
          tail.slice(0, firstGood).filter((m) => !(m in SCORED)),
          `${kind}: unscored models ahead of a proven-good one in ${JSON.stringify(chain)}`,
        ).toEqual([])
      }
    })

    it("documents which chains have NO on-point evidence at all (not reordered on a guess)", () => {
      const unevidenced = Object.entries(FALLBACK_CHAINS)
        .filter(([, chain]) => chain.every((m) => !(m in SCORED)))
        .map(([kind]) => kind)
        .sort()
      // These three share one chain shape and no member has an
      // AA-Omniscience score. Their order is the pre-existing
      // newest-generation-first ordering, left untouched deliberately:
      // settling it needs a benchmark run, not a coin flip.
      expect(unevidenced).toEqual(["analysis", "structural", "verification"])
    })
  })
})

describe("pickModel", () => {
  const chain = ["gpt-5.6-sol", "gpt-5.5", "gpt-4o"] as const
  const all = new Set(["gpt-5.6-sol", "gpt-5.5", "gpt-4o", "gpt-9-custom"])

  it("default: chain head when nothing is configured", () => {
    const r = pickModel({ chain, envModel: null, overrideModel: null, catalogIds: all })
    expect(r).toMatchObject({ modelName: "gpt-5.6-sol", source: "default", fallbackReason: null })
  })

  it("config override wins over default; env wins over config", () => {
    const config = pickModel({ chain, envModel: null, overrideModel: "gpt-9-custom", catalogIds: all })
    expect(config).toMatchObject({ modelName: "gpt-9-custom", source: "config" })
    const env = pickModel({ chain, envModel: "gpt-5.5", overrideModel: "gpt-9-custom", catalogIds: all })
    expect(env).toMatchObject({ modelName: "gpt-5.5", source: "env" })
  })

  it("unavailable selection falls back to the first available chain entry", () => {
    const partial = new Set(["gpt-5.5", "gpt-4o"])
    const r = pickModel({ chain, envModel: null, overrideModel: "gpt-6-sol", catalogIds: partial })
    expect(r.modelName).toBe("gpt-5.5")
    expect(r.source).toBe("fallback")
    expect(r.requestedModel).toBe("gpt-6-sol")
    expect(r.fallbackReason).toContain("not available")
  })

  it("fail-open: catalog unknown → selection used unchecked", () => {
    const r = pickModel({ chain, envModel: null, overrideModel: "gpt-7-new", catalogIds: null })
    expect(r).toMatchObject({ modelName: "gpt-7-new", source: "config", fallbackReason: null })
  })

  it("fail-open: whole chain unavailable → requested model kept, reason recorded", () => {
    const empty = new Set(["something-else"])
    const r = pickModel({ chain, envModel: null, overrideModel: null, catalogIds: empty })
    expect(r.modelName).toBe("gpt-5.6-sol")
    expect(r.fallbackReason).toContain("fail-open")
  })
})

describe("model catalog helpers", () => {
  const ids = [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.4-mini",
    "gpt-5.2-chat-latest", // excluded: -chat- line
    "gpt-4o",
    "gpt-4o-transcribe", // excluded: transcription
    "gpt-realtime-2.1", // excluded: realtime (also fails ^gpt-\d)
    "o4-mini",
    "text-embedding-3-small", // excluded: embeddings
    "whisper-1", // excluded
  ]

  it("relevantTextModels keeps chat/reasoning text models only", () => {
    const r = relevantTextModels(ids)
    expect(r).toContain("gpt-5.6-sol")
    expect(r).toContain("o4-mini")
    expect(r).toContain("gpt-4o")
    expect(r).not.toContain("gpt-4o-transcribe")
    expect(r).not.toContain("gpt-5.2-chat-latest")
    expect(r).not.toContain("text-embedding-3-small")
    expect(r).not.toContain("whisper-1")
  })

  it("detectGptFamilies groups and sorts newest-first", () => {
    const fams = detectGptFamilies(ids)
    expect(fams[0].family).toBe("5.6")
    expect(fams[0].models).toHaveLength(3)
    const names = fams.map((f) => f.family)
    expect(names.indexOf("5.6")).toBeLessThan(names.indexOf("5.4"))
  })

  it("newerFamilyThanKnown flags a family beyond 5.6, silent otherwise", () => {
    expect(newerFamilyThanKnown(detectGptFamilies(ids))).toBeNull()
    expect(newerFamilyThanKnown(detectGptFamilies([...ids, "gpt-5.7-sol"]))).toBe("5.7")
  })
})

describe("runtime pricing registration", () => {
  it("registered pricing is visible to lookupPricing", () => {
    expect(lookupPricing("openai", "gpt-9-hypothetical")).toBeNull()
    registerRuntimePricing("openai", "gpt-9-hypothetical", {
      inputCostPer1M: 7,
      outputCostPer1M: 42,
    })
    expect(lookupPricing("openai", "gpt-9-hypothetical")).toEqual({
      inputCostPer1M: 7,
      outputCostPer1M: 42,
    })
    // Static entries are untouched.
    expect(lookupPricing("openai", "gpt-5.6-sol")?.inputCostPer1M).toBe(5)
  })
})
