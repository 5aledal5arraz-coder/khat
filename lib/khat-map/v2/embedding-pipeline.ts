/**
 * Khat Map v2 — shared embedding-pipeline primitives.
 *
 * The two embedding-based season engines compose the helpers below instead
 * of each carrying its own copy:
 *
 *   • batch-engine.ts       (`generateBatch`)        — season-state driven
 *   • guest-first-engine.ts (`generateGuestFirstCards`) — guest-anchored
 *
 * Both run the same skeleton once they have raw candidates: embed each one,
 * scan it against the negative-fingerprint memory, compute the legacy
 * editorial × taste × balance × similarity composite, then greedily pick the
 * top N with a within-batch domain-diversity penalty. That shared middle is
 * here so a change to the similarity gate or the composite lands in one place.
 *
 * NOT shared by lib/hybrid-topics: that engine is a distinct market-signal
 * pipeline (clusters + original-thinking → single editorial call → judge/reject
 * → enrich). It already reuses the editorial-intelligence layer via
 * `enrichTopicsEditorially`, but it has no embedding/similarity stage, so it
 * deliberately doesn't compose these primitives.
 */

import {
  classifySimilarity,
  cosineSimilarity,
  type SimilarityVerdict,
} from "@/lib/khat-map/learning/embeddings"
import {
  computeFinalScore,
  withinBatchDomainPenalty,
} from "./scoring"
import { domainWeightMultiplier } from "./editorial-filter"
import type { RawCandidate, ScoredCandidate } from "./types"
import type {
  KhatMapEditorialControls,
  KhatMapTopicFingerprint,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"

/**
 * A neutral taste profile for callers with no `admin_id` — every dimension at
 * its 0.5 midpoint so taste alignment neither helps nor hurts any candidate.
 */
export function neutralTaste(): KhatMapUserTasteProfile {
  const now = new Date().toISOString()
  return {
    user_id: "",
    preferred_domains: [],
    rejected_patterns: [],
    depth_score: 0.5,
    controversy_tolerance: 0.5,
    emotional_preference: 0.5,
    kuwait_relevance_weight: 0.5,
    total_decisions: 0,
    last_recomputed_at: null,
    created_at: now,
    updated_at: now,
  }
}

/**
 * Scan one candidate embedding against every negative fingerprint and return
 * the worst verdict (hard_block > soft_avoid > ok), the maximum cosine
 * similarity, and the fingerprint that triggered the worst verdict.
 */
export function scanNegatives(
  candidate: number[],
  negatives: KhatMapTopicFingerprint[],
): {
  verdict: SimilarityVerdict
  max: number
  trigger: KhatMapTopicFingerprint | null
} {
  let verdict: SimilarityVerdict = "ok"
  let max = 0
  let trigger: KhatMapTopicFingerprint | null = null
  for (const n of negatives) {
    if (n.embedding.length !== candidate.length) continue
    const s = cosineSimilarity(candidate, n.embedding)
    if (s > max) {
      max = s
      trigger = n
    }
    const v = classifySimilarity(s)
    if (v === "hard_block") verdict = "hard_block"
    else if (v === "soft_avoid" && verdict !== "hard_block") verdict = "soft_avoid"
  }
  return { verdict, max, trigger }
}

/**
 * The legacy composite for one candidate: editorial × taste × balance ×
 * similarity, then multiplied by the admin's per-domain editorial weight and
 * the closed-loop performance band. Used by Phase B (guests), strict
 * angle-bank, required-role completion, and the whole guest-first path. The
 * editorial Success-Probability path bypasses this entirely.
 */
export function legacyCandidateScore(params: {
  raw: RawCandidate
  taste_alignment: number
  domain_load: number
  similarity_verdict: SimilarityVerdict
  similarity_max: number
  controls: KhatMapEditorialControls
  /** Closed-loop performance multiplier (1.0 when a domain lacks enough data). */
  perfFactor: number
}): number {
  const base = computeFinalScore({
    editorial_score: params.raw.editorial_score,
    taste_alignment: params.taste_alignment,
    domain_load: params.domain_load,
    similarity_verdict: params.similarity_verdict,
    similarity_max: params.similarity_max,
  })
  return (
    base *
    domainWeightMultiplier(params.raw.topic.topic_domain, params.controls) *
    params.perfFactor
  )
}

/**
 * Greedy top-N selection with a soft within-batch domain penalty: repeatedly
 * take the highest-scoring remaining candidate after subtracting a penalty for
 * domains already represented in the picks, so a batch doesn't stack five cards
 * from one domain. Does not mutate the input array.
 */
export function greedyPickByScore(
  scored: ScoredCandidate[],
  size: number,
): ScoredCandidate[] {
  const picks: ScoredCandidate[] = []
  const remaining = [...scored].sort((a, b) => b.final_score - a.final_score)
  while (picks.length < size && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const adjusted =
        remaining[i].final_score - withinBatchDomainPenalty(remaining[i], picks)
      if (adjusted > bestScore) {
        bestScore = adjusted
        bestIdx = i
      }
    }
    picks.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }
  return picks
}
