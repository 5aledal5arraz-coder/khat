/**
 * Exploration frames — the generation-time variety mechanism. Pure, seeded.
 *
 * Guards the root cause of repetitive seasons: without harness-assigned
 * territories, generation collapses to the model's habitual attractors. The
 * builder must produce distinct territories, skip a season's already-used
 * ground (sampling without replacement across batches), spread categories and
 * archetypes, favor corpus white-space, and never under-deliver frames.
 */

import { describe, expect, it } from "vitest"
import {
  buildExplorationFrames,
  renderExplorationBlock,
  type WhiteSpaceTheme,
} from "@/lib/khat-map/v2/exploration"
import { ARCHETYPE_IDS } from "@/lib/khat-map/v2/creative-brief"
import { ALL_SUBCATEGORY_IDS } from "@/lib/khat-map/v2/knowledge-universe"

/** Deterministic LCG so tests are reproducible. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const WS: WhiteSpaceTheme[] = [
  { slug: "ws-ottoman", label_ar: "التاريخ العثماني", description_ar: "..." },
  { slug: "ws-arabic-lang", label_ar: "اللغة العربية", description_ar: null },
]

describe("buildExplorationFrames", () => {
  it("returns `count` frames with all-distinct territories", () => {
    const frames = buildExplorationFrames({ count: 10, rng: seededRng(7) })
    expect(frames).toHaveLength(10)
    const ids = frames.map((f) => f.territory.id)
    expect(new Set(ids).size).toBe(10)
  })

  it("never re-samples a season's already-used territories while fresh ones exist", () => {
    const used = new Set(ALL_SUBCATEGORY_IDS.slice(0, 50))
    const frames = buildExplorationFrames({ count: 10, usedTerritoryIds: used, rng: seededRng(3) })
    for (const f of frames) expect(used.has(f.territory.id)).toBe(false)
  })

  it("spreads across categories (per-category cap)", () => {
    const frames = buildExplorationFrames({ count: 10, rng: seededRng(11) })
    const perCat = new Map<string, number>()
    for (const f of frames) {
      perCat.set(f.territory.category, (perCat.get(f.territory.category) ?? 0) + 1)
    }
    for (const n of perCat.values()) expect(n).toBeLessThanOrEqual(2)
  })

  it("covers many archetypes (round-robin from a shuffled deck)", () => {
    const frames = buildExplorationFrames({ count: 9, rng: seededRng(5) })
    const shapes = new Set(frames.map((f) => f.archetype))
    expect(shapes.size).toBe(Math.min(9, ARCHETYPE_IDS.length))
  })

  it("includes white-space themes (weighted 3x) and marks them", () => {
    // With heavy weighting and a small draw, white space should show up across seeds.
    let seen = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const frames = buildExplorationFrames({ count: 8, whiteSpace: WS, rng: seededRng(seed) })
      if (frames.some((f) => f.territory.kind === "white_space")) seen++
    }
    expect(seen).toBeGreaterThan(0)
  })

  it("refills from used territories rather than under-delivering when the pool is exhausted", () => {
    const used = new Set<string>([...ALL_SUBCATEGORY_IDS])
    const frames = buildExplorationFrames({ count: 6, usedTerritoryIds: used, rng: seededRng(9) })
    expect(frames).toHaveLength(6)
  })

  it("is deterministic under the same seed", () => {
    const a = buildExplorationFrames({ count: 8, whiteSpace: WS, rng: seededRng(42) })
    const b = buildExplorationFrames({ count: 8, whiteSpace: WS, rng: seededRng(42) })
    expect(a.map((f) => `${f.territory.id}:${f.archetype}`)).toEqual(
      b.map((f) => `${f.territory.id}:${f.archetype}`),
    )
  })
})

describe("renderExplorationBlock", () => {
  it("renders one slot per frame with territory + archetype", () => {
    const frames = buildExplorationFrames({ count: 4, rng: seededRng(1) })
    const block = renderExplorationBlock(frames)
    expect(block).toContain("slot 1:")
    expect(block).toContain("slot 4:")
    for (const f of frames) {
      expect(block).toContain(f.territory.label_ar)
      expect(block).toContain(f.archetype)
    }
  })

  it("is empty for zero frames", () => {
    expect(renderExplorationBlock([])).toBe("")
  })
})
