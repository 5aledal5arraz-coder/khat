/**
 * Potential-first selector — the final ranking step.
 *
 * Episode potential (Regional Audience Fit, in `final_score`) comes first.
 * Category diversity is only a constraint layered on top:
 *   • a small MMR penalty breaks near-ties toward breadth, and
 *   • a hard season cap stops any one category from dominating.
 * A genuinely stronger topic always wins over a weaker one from a fresher
 * category — we never promote a weak idea just to cover a category.
 *
 * Pure function. No I/O.
 */

import { categoryDiversityPenalty } from "./diversity"
import type { ScoredCandidate } from "./types"

export interface PotentialSelection {
  picks: ScoredCandidate[]
}

export function selectByPotential(
  scored: ScoredCandidate[],
  opts: {
    size: number
    seasonCap: number
    acceptedByCategory: Record<string, number>
  },
): PotentialSelection {
  const { size, seasonCap, acceptedByCategory } = opts

  const picks: ScoredCandidate[] = []
  const pickedCats: Array<string | null> = []
  const used = new Set<ScoredCandidate>()
  // Running per-category total = already accepted this season + picked this batch.
  const catCount: Record<string, number> = { ...acceptedByCategory }
  // RAF descending is the base order; the greedy loop re-evaluates with the
  // diversity penalty each pick.
  const pool = [...scored]

  const runPass = (respectCap: boolean) => {
    while (picks.length < size) {
      let best: ScoredCandidate | null = null
      let bestAdjusted = -Infinity
      for (const c of pool) {
        if (used.has(c)) continue
        const cat = c.raw.topic.category
        if (respectCap && cat && (catCount[cat] ?? 0) >= seasonCap) continue
        const adjusted = c.final_score - categoryDiversityPenalty(cat, pickedCats)
        if (adjusted > bestAdjusted) {
          bestAdjusted = adjusted
          best = c
        }
      }
      if (!best) break
      used.add(best)
      picks.push(best)
      const cat = best.raw.topic.category
      pickedCats.push(cat)
      if (cat) catCount[cat] = (catCount[cat] ?? 0) + 1
    }
  }

  // First respect the season cap; if the batch still can't be filled (tight cap
  // or thin pool), relax it so a generation is never short.
  runPass(true)
  if (picks.length < size) runPass(false)

  return { picks }
}
