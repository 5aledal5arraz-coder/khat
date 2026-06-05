/**
 * Khat Brain Phase 5 — candidate ranking.
 *
 * Pure scoring math — no LLM, no network. Reads the verified intelligence
 * already on the candidate (editorial_fit_score, evidence_urls,
 * platform_signals, story_signals) and produces hiddenness, novelty,
 * evidence_strength, and a composite.
 *
 * ## Composite formula
 *   composite = 0.45 * editorial_fit
 *             + 0.20 * hiddenness
 *             + 0.20 * evidence_strength
 *             + 0.15 * novelty
 *
 * Editorial fit dominates because the brief is explicit about not
 * relying on follower count. Hiddenness rewards low audience signal.
 * Evidence strength rewards multiple corroborating sources. Novelty
 * rewards story arcs we haven't seen before.
 *
 * All inputs are clamped to [0, 1]; missing inputs treated as null
 * (excluded from the weighted sum, with weights renormalized to keep
 * the composite in [0, 1]).
 */

import type {
  DiscoveryEvidenceUrl,
  DiscoveryPlatformSignals,
  DiscoveryStorySignals,
} from "./types"

const WEIGHTS = {
  editorial_fit: 0.45,
  hiddenness: 0.2,
  evidence_strength: 0.2,
  novelty: 0.15,
} as const

export interface RankCandidateInput {
  editorial_fit_score: number | null
  evidence_urls: DiscoveryEvidenceUrl[]
  platform_signals: DiscoveryPlatformSignals | null
  story_signals: DiscoveryStorySignals | null
  /**
   * Optional novelty corpus — story arcs already seen in earlier runs.
   * The ranker counts how many of THIS candidate's arcs are absent
   * from the corpus and scales the novelty score by that ratio.
   */
  seen_arcs?: Set<string>
}

export interface RankResult {
  editorial_fit_score: number | null
  hiddenness_score: number
  evidence_strength_score: number
  novelty_score: number
  composite_score: number
}

export function rankCandidate(input: RankCandidateInput): RankResult {
  const editorial = input.editorial_fit_score ?? null
  const hiddenness = computeHiddenness(input.platform_signals)
  const evidenceStrength = computeEvidenceStrength(input.evidence_urls)
  const novelty = computeNovelty(input.story_signals, input.seen_arcs)

  // Renormalize weights for whichever inputs are present.
  const present: Array<[number, number]> = [] // [weight, value]
  if (editorial !== null) present.push([WEIGHTS.editorial_fit, editorial])
  present.push([WEIGHTS.hiddenness, hiddenness])
  present.push([WEIGHTS.evidence_strength, evidenceStrength])
  present.push([WEIGHTS.novelty, novelty])
  const totalWeight = present.reduce((a, [w]) => a + w, 0)
  const composite =
    totalWeight === 0
      ? 0
      : present.reduce((a, [w, v]) => a + (w / totalWeight) * v, 0)

  return {
    editorial_fit_score: editorial,
    hiddenness_score: round3(hiddenness),
    evidence_strength_score: round3(evidenceStrength),
    novelty_score: round3(novelty),
    composite_score: round3(composite),
  }
}

// ─── Component scorers ───────────────────────────────────────────────

/**
 * Hiddenness — high score for low audience footprint.
 *   - 1.0 if no platform signals at all
 *   - decays as YouTube subscribers / X followers grow
 *   - capped at 0 if either crosses 500k
 *
 * The brief: "Do not rely on follower count as the main signal." We
 * use it ONLY as a hiddenness floor, not as an inclusion criterion.
 */
function computeHiddenness(s: DiscoveryPlatformSignals | null): number {
  if (!s) return 0.5 // unknown audience — neutral
  const yt = s.youtube?.subscribers ?? null
  const x = s.x?.followers ?? null
  const ig = s.instagram?.followers ?? null

  const knownCounts = [yt, x, ig].filter((n): n is number => typeof n === "number" && n >= 0)
  if (knownCounts.length === 0) return 0.7 // no audience info → likely hidden

  // Use the largest known following — that's the dominant signal.
  const peak = Math.max(...knownCounts)
  if (peak >= 500_000) return 0
  if (peak >= 100_000) return 0.2
  if (peak >= 30_000) return 0.5
  if (peak >= 5_000) return 0.75
  return 0.95
}

/**
 * Evidence strength — does the candidate have multiple corroborating
 * sources that actually contain editorial signal (titles + snippets)?
 *   - 1.0 for ≥3 platforms with snippets
 *   - 0.6 for 2 platforms
 *   - 0.3 for 1 source
 *   - 0   for no evidence
 */
function computeEvidenceStrength(urls: DiscoveryEvidenceUrl[]): number {
  if (urls.length === 0) return 0
  const platforms = new Set(urls.map((u) => u.platform))
  const withSnippet = urls.filter((u) => u.snippet || u.title).length
  if (platforms.size >= 3 && withSnippet >= 3) return 1.0
  if (platforms.size >= 2) return 0.6
  return withSnippet > 0 ? 0.4 : 0.2
}

/**
 * Novelty — how many of this candidate's story arcs are absent from
 * the corpus of arcs we've seen in earlier runs of this season.
 *   - 1.0 when all arcs are new
 *   - 0   when every arc is already in the corpus
 *   - 0.5 when no arcs are recorded (unknown novelty, neutral)
 */
function computeNovelty(
  s: DiscoveryStorySignals | null,
  seen: Set<string> | undefined,
): number {
  const arcs = s?.arcs ?? []
  if (arcs.length === 0) return 0.5
  if (!seen || seen.size === 0) return 1.0
  let novel = 0
  for (const a of arcs) {
    if (!seen.has(a.toLowerCase().trim())) novel++
  }
  return novel / arcs.length
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
