/**
 * Batch-diversity constraints the hybrid prompt states but nothing enforced
 * (topic-engine defect #6):
 *
 *   R10 — "no single lens > 40% of the batch; "none" is always allowed and
 *         exempt"
 *   R12 — "The batch MUST span at least 4 different archetypes"
 *
 * Enforced as RANKING constraints, not rejections: every topic here was
 * already paid for, and a batch that breaks a variety rule still holds good
 * individual topics. So:
 *
 *   • lens cap — within one lens, the topics past the cap (lowest-ranked
 *     first to go) are moved to the END of the order and flagged
 *     `lens_over_cap`. Nothing is dropped.
 *   • archetype span — the first MIN_BATCH_ARCHETYPES positions are re-dealt
 *     to distinct archetypes (the strongest topic of each shape). When the
 *     WHOLE batch spans fewer than the minimum, re-ordering can't create
 *     shapes the model didn't return; that becomes a batch-level warning the
 *     operator sees, not a silent pass.
 *
 * Pure — input order is the score order produced upstream; output keeps the
 * same items, re-ordered.
 */

export const MAX_LENS_SHARE = 0.4
export const MIN_BATCH_ARCHETYPES = 4

export type DiversityFlag = "lens_over_cap"
export type DiversityWarning = "archetype_span_below_min"

export interface DiversityItem {
  original_lens: string
  archetype?: string
}

export interface DiversityResult<T> {
  ordered: T[]
  /** Per-item flags, keyed by the item (identity). */
  flags: Map<T, DiversityFlag[]>
  warnings: DiversityWarning[]
  /** Distinct archetypes across the whole batch. */
  archetype_span: number
}

/** Lens cap for a batch of `n` (≥ 1 so a tiny batch can still use a lens). */
export function lensCap(n: number): number {
  return Math.max(1, Math.floor(n * MAX_LENS_SHARE))
}

function isExemptLens(lens: string): boolean {
  const l = (lens ?? "").trim().toLowerCase()
  return l === "" || l === "none"
}

export function enforceBatchDiversity<T extends DiversityItem>(
  ranked: T[],
): DiversityResult<T> {
  const flags = new Map<T, DiversityFlag[]>()
  const n = ranked.length
  const cap = lensCap(n)

  // 1. Lens cap — keep the first `cap` of each lens, demote the rest.
  const lensSeen = new Map<string, number>()
  const head: T[] = []
  const demoted: T[] = []
  for (const item of ranked) {
    if (isExemptLens(item.original_lens)) {
      head.push(item)
      continue
    }
    const used = lensSeen.get(item.original_lens) ?? 0
    lensSeen.set(item.original_lens, used + 1)
    if (used < cap) head.push(item)
    else {
      demoted.push(item)
      flags.set(item, ["lens_over_cap"])
    }
  }

  // 2. Archetype span — the first MIN_BATCH_ARCHETYPES positions go to the
  //    strongest topic of each distinct shape (score order kept among them);
  //    everything else follows in its original order. Only as much
  //    re-ordering as the rule needs.
  const seenShapes = new Set<string>()
  const front: T[] = []
  const rest: T[] = []
  for (const item of head) {
    const shape = item.archetype?.trim()
    if (shape && !seenShapes.has(shape) && seenShapes.size < MIN_BATCH_ARCHETYPES) {
      seenShapes.add(shape)
      front.push(item)
    } else rest.push(item)
  }

  const allShapes = new Set(
    ranked.map((t) => t.archetype?.trim()).filter((s): s is string => Boolean(s)),
  )
  const warnings: DiversityWarning[] = []
  if (n > 0 && allShapes.size < Math.min(MIN_BATCH_ARCHETYPES, n)) {
    warnings.push("archetype_span_below_min")
  }

  return {
    ordered: [...front, ...rest, ...demoted],
    flags,
    warnings,
    archetype_span: allShapes.size,
  }
}
