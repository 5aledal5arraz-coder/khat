/**
 * Hybrid semantic selection (Phase B4 parity). Pure — no DB, no LLM.
 *
 * Guards the gap seen live: a hybrid batch stacking near-duplicates IN MEANING
 * (two "AI enslaves us" pitches, three "success has a dark side" pitches) that
 * lens/archetype counting can't catch. selectHybridOrder must:
 *   1. drop a meaning-level near-duplicate of a stronger topic,
 *   2. rank a diverse topic above a similar-but-slightly-stronger one (MMR),
 *   3. prefer white-space over saturated corpus territory at equal score,
 *   4. degrade to plain score order when embeddings are unavailable.
 */

import { describe, expect, it } from "vitest"
import { selectHybridOrder, type HybridSelectable } from "@/lib/hybrid-topics/select"

function norm(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / mag)
}

const item = (index: number, score: number, embedding: number[] | null): HybridSelectable => ({
  index,
  score,
  embedding,
})

describe("selectHybridOrder", () => {
  it("drops a meaning-level near-duplicate of a stronger topic", () => {
    const a = item(0, 0.9, norm([1, 0, 0]))
    const dup = item(1, 0.88, norm([0.999, 0.045, 0])) // cosine ≈ 0.999 vs a
    const c = item(2, 0.4, norm([0, 1, 0]))
    const { ordered, dropped } = selectHybridOrder([a, dup, c], null)
    expect(dropped).toEqual([1])
    expect(ordered).toEqual([0, 2])
  })

  it("MMR: a diverse topic outranks a similar-but-stronger one after the first pick", () => {
    const a = item(0, 0.9, norm([1, 0, 0]))
    const similar = item(1, 0.85, norm([0.75, 0.6614, 0])) // cosine 0.75 vs a → penalized
    const diverse = item(2, 0.7, norm([0, 1, 0])) // cosine 0 vs a → no penalty
    const { ordered, dropped } = selectHybridOrder([a, similar, diverse], null)
    expect(dropped).toEqual([])
    expect(ordered).toEqual([0, 2, 1])
  })

  it("prefers white-space over saturated corpus territory at equal score", () => {
    const refs = { saturated: [norm([1, 0, 0])], whiteSpace: [norm([0, 1, 0])] }
    const onSaturated = item(0, 0.8, norm([1, 0, 0]))
    const onWhiteSpace = item(1, 0.8, norm([0, 1, 0]))
    const { ordered } = selectHybridOrder([onSaturated, onWhiteSpace], refs)
    expect(ordered[0]).toBe(1)
  })

  it("degrades to plain score order when embeddings are unavailable", () => {
    const items = [item(0, 0.7, null), item(1, 0.9, null), item(2, 0.8, null)]
    const { ordered, dropped } = selectHybridOrder(items, null)
    expect(ordered).toEqual([1, 2, 0])
    expect(dropped).toEqual([])
  })

  it("never drops the strongest topic even in a batch of near-duplicates", () => {
    const base = norm([1, 0, 0])
    const items = [
      item(0, 0.9, base),
      item(1, 0.8, norm([0.999, 0.02, 0])),
      item(2, 0.7, norm([0.998, 0.06, 0])),
    ]
    const { ordered, dropped } = selectHybridOrder(items, null)
    expect(ordered).toEqual([0])
    expect(dropped.sort()).toEqual([1, 2])
  })
})
