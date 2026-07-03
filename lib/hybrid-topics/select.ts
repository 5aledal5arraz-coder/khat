/**
 * Hybrid batch selection — semantic diversity + corpus novelty (Phase B4 parity
 * with the editorial engine's select-by-potential).
 *
 * The hybrid generator previously diversified only by lens + archetype COUNTS,
 * so a batch could stack near-duplicates in meaning (two "AI enslaves us"
 * episodes, three "success has a dark side" episodes) that share neither lens
 * nor archetype. This module re-ranks the accepted pool by EMBEDDING:
 *
 *   • greedy MMR — each pick penalizes candidates semantically close to what's
 *     already picked, so the operator sees a spread of MEANINGS, not shapes only.
 *   • hard near-dup drop — a candidate ≥ NEAR_DUP_CUTOFF cosine to a stronger
 *     pick is moved to the rejected list (reason "semantic_near_dup") instead of
 *     wasting an operator review slot.
 *   • corpus novelty — proximity to SATURATED corpus themes is penalized and
 *     WHITE-SPACE proximity boosted, same mechanism as the editorial engine
 *     (objective, selection-time — never prompt text).
 *
 * Pure function over (scores, embeddings, corpus refs) — unit-tested, no I/O.
 * Embeddings may be null (embed call failed / not configured): the candidate
 * simply takes no semantic or corpus adjustment, and ordering degrades to the
 * existing score sort.
 */

import { cosineSimilarity } from "@/lib/khat-map/learning/embeddings"
import { corpusProximity, type CorpusNoveltyRefs } from "@/lib/corpus/novelty"

export interface HybridSelectable {
  /** Caller's index into its own accepted[] array. */
  index: number
  /** Final 0-1 hybrid score (rescoreHybridCandidate output). */
  score: number
  /** Embedding of the topic (title+hook+conflict), or null when unavailable. */
  embedding: number[] | null
}

export interface HybridSelection {
  /** Kept candidates, best-first after diversity/novelty re-ranking. */
  ordered: number[]
  /** Near-duplicates of a stronger kept candidate (reason: semantic_near_dup). */
  dropped: number[]
}

// Tuned for the hybrid 0-1 score scale (editorial uses 0-10; ratios match).
const SEMANTIC_FLOOR = 0.5 // below this cosine, candidates are "different enough"
const SEMANTIC_WEIGHT = 0.8 // penalty per unit of (cosine − floor) vs nearest pick
const NEAR_DUP_CUTOFF = 0.85 // at/above this vs a kept pick → drop outright
const CORPUS_SAT_FLOOR = 0.55
const CORPUS_SAT_WEIGHT = 0.35
const CORPUS_WS_FLOOR = 0.55
const CORPUS_WS_WEIGHT = 0.25

function maxSimToPicked(c: HybridSelectable, picked: HybridSelectable[]): number {
  if (!c.embedding || c.embedding.length === 0) return 0
  let max = 0
  for (const p of picked) {
    if (!p.embedding || p.embedding.length !== c.embedding.length) continue
    const s = cosineSimilarity(c.embedding, p.embedding)
    if (s > max) max = s
  }
  return max
}

export function selectHybridOrder(
  items: HybridSelectable[],
  refs: CorpusNoveltyRefs | null,
): HybridSelection {
  const remaining = [...items]
  const picked: HybridSelectable[] = []
  const dropped: number[] = []

  // Corpus adjustment is pick-independent — compute once per candidate.
  const corpusAdj = new Map<number, number>()
  for (const c of items) {
    const prox = corpusProximity(c.embedding, refs)
    const sat = Math.max(0, prox.saturation - CORPUS_SAT_FLOOR) * CORPUS_SAT_WEIGHT
    const ws = Math.max(0, prox.whitespace - CORPUS_WS_FLOOR) * CORPUS_WS_WEIGHT
    corpusAdj.set(c.index, sat - ws) // >0 penalizes, <0 boosts
  }

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestAdjusted = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]
      const semantic = Math.max(0, maxSimToPicked(c, picked) - SEMANTIC_FLOOR) * SEMANTIC_WEIGHT
      const adjusted = c.score - semantic - (corpusAdj.get(c.index) ?? 0)
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIdx = i
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1)
    // A chosen candidate that is a near-dup of something already kept doesn't
    // deserve an operator slot — divert it to the rejected list.
    if (picked.length > 0 && maxSimToPicked(chosen, picked) >= NEAR_DUP_CUTOFF) {
      dropped.push(chosen.index)
      continue
    }
    picked.push(chosen)
  }

  return { ordered: picked.map((p) => p.index), dropped }
}
