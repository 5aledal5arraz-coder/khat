/**
 * Potential-first selector — the final ranking step.
 *
 * Episode potential (`final_score`) leads, but selection actively protects
 * BREADTH so a batch never stacks near-duplicates. Three diversity penalties
 * layer on top of the score, re-evaluated greedily at each pick:
 *   • semantic — the big one. A candidate too similar (by embedding cosine) to
 *     something already picked is penalized hard. This is what stops four
 *     "الخليج + macro trend" topics — which sit in four DIFFERENT categories, so
 *     category diversity alone waved them through — from all surviving.
 *   • archetype — repeating an episode SHAPE (personal_story, investigation, …)
 *     is penalized, so a batch spans shapes, not just subjects.
 *   • category — a small MMR nudge + a hard season cap (unchanged).
 * A genuinely stronger, fresher topic always wins; we never promote a weak idea
 * just to cover a slot.
 *
 * Pure function. No I/O.
 */

import { categoryDiversityPenalty } from "./diversity"
import { cosineSimilarity } from "@/lib/khat-map/learning/embeddings"
import type { ScoredCandidate } from "./types"

export interface PotentialSelection {
  picks: ScoredCandidate[]
}

// Tuned on a 0-10 `final_score` scale.
const SEMANTIC_WEIGHT = 8 // penalty per unit of (cosine − floor) vs the nearest pick
const SEMANTIC_FLOOR = 0.5 // cosine below this is "different enough" — no penalty
const ARCHETYPE_WEIGHT = 1.5 // penalty per prior pick sharing the archetype
// Corpus novelty (Phase B4): nudge selection away from saturated corpus territory
// and toward white space. Modest weights — this refines ranking, never dominates
// episode potential. Floors: only proximity ABOVE the floor moves the score.
const CORPUS_SAT_WEIGHT = 4
const CORPUS_SAT_FLOOR = 0.55
const CORPUS_WS_WEIGHT = 3
const CORPUS_WS_FLOOR = 0.55

/** Worst-case (max) cosine similarity of `c` to anything already picked. */
function maxSimilarityToPicks(c: ScoredCandidate, picks: ScoredCandidate[]): number {
  let max = 0
  const emb = c.embedding
  if (!emb || emb.length === 0) return 0
  for (const p of picks) {
    if (!p.embedding || p.embedding.length !== emb.length) continue
    const s = cosineSimilarity(emb, p.embedding)
    if (s > max) max = s
  }
  return max
}

function semanticPenalty(c: ScoredCandidate, picks: ScoredCandidate[]): number {
  const sim = maxSimilarityToPicks(c, picks)
  return Math.max(0, sim - SEMANTIC_FLOOR) * SEMANTIC_WEIGHT
}

function archetypePenalty(c: ScoredCandidate, picks: ScoredCandidate[]): number {
  const a = c.raw.topic.archetype
  if (!a) return 0
  const same = picks.filter((p) => p.raw.topic.archetype === a).length
  return same * ARCHETYPE_WEIGHT
}

/** Net corpus adjustment: penalize proximity to saturated themes, reward white space. */
function corpusAdjustment(c: ScoredCandidate): number {
  const sat = Math.max(0, (c.corpus_saturation ?? 0) - CORPUS_SAT_FLOOR) * CORPUS_SAT_WEIGHT
  const ws = Math.max(0, (c.corpus_whitespace ?? 0) - CORPUS_WS_FLOOR) * CORPUS_WS_WEIGHT
  return sat - ws // >0 penalizes (saturated); <0 boosts (white space)
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
  const pool = [...scored]

  const runPass = (respectCap: boolean) => {
    while (picks.length < size) {
      let best: ScoredCandidate | null = null
      let bestAdjusted = -Infinity
      for (const c of pool) {
        if (used.has(c)) continue
        const cat = c.raw.topic.category
        if (respectCap && cat && (catCount[cat] ?? 0) >= seasonCap) continue
        const adjusted =
          c.final_score -
          categoryDiversityPenalty(cat, pickedCats) -
          semanticPenalty(c, picks) -
          archetypePenalty(c, picks) -
          corpusAdjustment(c)
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
