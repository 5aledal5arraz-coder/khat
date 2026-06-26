/**
 * Regional Audience Fit (RAF) — the primary ranking objective.
 *
 * The generator's job is NOT to fill category quotas; it is to surface the
 * strongest podcast-episode opportunities for Khat's core audience — Saudi
 * Arabia, Kuwait, Iraq, and the wider GCC. RAF is the composite that encodes
 * "would this be a great Khat episode for that audience?" across nine factors,
 * weighted by the editorial priority order:
 *
 *   1. curiosity + discussion potential   (what people most want to watch/argue)
 *   2. regional + cultural relevance       (does it land in KSA/Kuwait/Iraq/GCC)
 *   3. guest attraction                    (can it land a great guest)
 *   4. timelessness                        (lasting value, not a 3-day trend)
 *   5. viral potential + quality           (spreads, while staying on-identity)
 *
 * Category balance is applied AFTER this ranking, as a diversity constraint
 * (see diversity.ts + select-by-potential.ts) — never as the driver.
 *
 * Pure math. No I/O.
 */

export interface AudienceFit {
  /** Relevance to Saudi / Kuwaiti / Iraqi / GCC audiences specifically. */
  regional_relevance: number
  /** Cultural resonance — does it touch the region's lived reality + values. */
  cultural_resonance: number
  /** Public curiosity — how badly people want to know / click. */
  curiosity: number
  /** Likelihood of landing a strong, credible guest for it. */
  guest_potential: number
  /** Conversation potential — depth + breadth of debate it generates. */
  discussion_potential: number
  /** Lasting value — still worth watching in years, not a passing trend. */
  timelessness: number
  /** Share-ability / spread potential. */
  viral_potential: number
  /** Educational payoff — does the viewer leave knowing something real. */
  educational_value: number
  /** Alignment with Khat's identity + quality bar (the gate, not just a perk). */
  identity_alignment: number
}

export type AudienceFitFactor = keyof AudienceFit

/**
 * Priority-ordered weights. The four strongest signals — curiosity, discussion
 * potential, guest potential, and regional relevance — lead by a clear margin
 * (a great episode is one people are curious about, will debate, can land a
 * strong guest, and lands in the GCC). Cultural resonance + the identity quality
 * gate sit just under; timelessness, virality, and raw educational value follow.
 * Sum need not be 1 — RAF normalizes by it.
 */
export const RAF_WEIGHTS: Record<AudienceFitFactor, number> = {
  curiosity: 1.5,
  discussion_potential: 1.45,
  guest_potential: 1.4,
  regional_relevance: 1.35,
  cultural_resonance: 1.1,
  identity_alignment: 1.1,
  timelessness: 0.95,
  viral_potential: 0.9,
  educational_value: 0.7,
}

const RAF_WEIGHT_SUM = Object.values(RAF_WEIGHTS).reduce((a, b) => a + b, 0)

const FACTORS = Object.keys(RAF_WEIGHTS) as AudienceFitFactor[]

function clampScore(v: unknown, fallback = 5): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(10, n))
}

/** Coerce raw model output into a complete AudienceFit (missing → neutral 5). */
export function clampAudienceFit(raw: unknown): AudienceFit {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const out = {} as AudienceFit
  for (const f of FACTORS) out[f] = clampScore(o[f])
  return out
}

/** Neutral fit — used when the legacy path produces no RAF block. */
export function neutralAudienceFit(): AudienceFit {
  const out = {} as AudienceFit
  for (const f of FACTORS) out[f] = 5
  return out
}

/**
 * The composite, in [0, 10]. Identity alignment also acts as a soft gate: a
 * topic that betrays Khat's quality bar (identity ≤ 3) is pulled down hard so
 * a viral-but-cheap idea can't top the ranking — "viral while maintaining
 * Khat's quality standards."
 */
export function computeRegionalAudienceFit(fit: AudienceFit): number {
  let acc = 0
  for (const f of FACTORS) acc += RAF_WEIGHTS[f] * fit[f]
  let raf = acc / RAF_WEIGHT_SUM
  if (fit.identity_alignment <= 3) {
    // Below the quality bar — dampen toward zero proportional to the miss.
    raf *= fit.identity_alignment / 6
  }
  return Math.max(0, Math.min(10, raf))
}

/** Per-factor contribution breakdown (for card explainability / debugging). */
export function rafBreakdown(fit: AudienceFit): Array<{ factor: AudienceFitFactor; score: number; weight: number }> {
  return FACTORS.map((f) => ({ factor: f, score: fit[f], weight: RAF_WEIGHTS[f] }))
}
