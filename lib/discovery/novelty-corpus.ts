/**
 * Khat Brain Phase 7 — cross-run + cross-season novelty corpus.
 *
 * Builds a "we've already seen this" corpus from prior completed
 * discovery runs. The ranker uses it to down-score candidates whose
 * arcs/topics/names/evidence_domains/archetype already appear in
 * history.
 *
 * ## Weighting
 *   - Same-season prior runs        → weight 1.0
 *   - Other-season completed runs   → weight = max(SEASON_FLOOR, 1.0 − log10(daysOld/14 + 1) × SEASON_DECAY)
 *
 * With SEASON_DECAY = 0.4 and SEASON_FLOOR = 0.2:
 *   - 14d old : ~0.88×
 *   - 6 mo    : ~0.45×
 *   - 18 mo   :  0.20× (floor — old signal still matters but less)
 *
 * Corpus entries are stored as Map<key, weight>. The penalty function
 * scales each axis's base contribution by the strongest applicable
 * weight in the corpus, so a single very-old hit can't dominate a
 * fresh same-season repeat.
 */

import { and, eq, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  discoveryRuns,
  guestDiscoveryCandidates,
} from "@/lib/db/schema/discovery"

const SEASON_DECAY = 0.4
const SEASON_FLOOR = 0.2
const DECAY_REFERENCE_DAYS = 14

export type WeightedSet = Map<string, number>

export interface NoveltyCorpus {
  arcs: WeightedSet
  topics: WeightedSet
  names: WeightedSet
  evidence_domains: WeightedSet
  archetype_ids: WeightedSet
}

const EMPTY: NoveltyCorpus = {
  arcs: new Map(),
  topics: new Map(),
  names: new Map(),
  evidence_domains: new Map(),
  archetype_ids: new Map(),
}

function normalize(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().trim().replace(/\s+/g, " ")
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

function ageWeight(daysOld: number, sameSeason: boolean): number {
  if (sameSeason) return 1.0
  if (daysOld <= 0) return 1.0
  const decayed = 1.0 - Math.log10(daysOld / DECAY_REFERENCE_DAYS + 1) * SEASON_DECAY
  return Math.max(SEASON_FLOOR, Math.min(1.0, decayed))
}

function bumpWeighted(target: WeightedSet, key: string, weight: number) {
  if (!key) return
  const prev = target.get(key) ?? 0
  // Use the strongest signal — if the same arc appears in same-season
  // and an old season, we want the same-season weight, not their sum.
  if (weight > prev) target.set(key, weight)
}

/**
 * Build a corpus from every completed discovery run except the current,
 * weighted by season + age. Returns EMPTY when there are no completed
 * runs at all.
 */
export async function buildNoveltyCorpus(input: {
  current_run_id: string
  season_id: string | null | undefined
}): Promise<NoveltyCorpus> {
  const allPrior = await db!
    .select({
      id: discoveryRuns.id,
      season_id: discoveryRuns.season_id,
      archetypes: discoveryRuns.archetypes,
      completed_at: discoveryRuns.completed_at,
      updated_at: discoveryRuns.updated_at,
    })
    .from(discoveryRuns)
    .where(
      and(
        eq(discoveryRuns.status, "completed"),
        ne(discoveryRuns.id, input.current_run_id),
      ),
    )
  if (allPrior.length === 0) return EMPTY

  const now = Date.now()
  const runWeights = new Map<string, { weight: number; sameSeason: boolean }>()
  for (const r of allPrior) {
    const sameSeason = Boolean(input.season_id) && r.season_id === input.season_id
    const completedAt = r.completed_at ?? r.updated_at
    const ageMs = completedAt ? now - completedAt.getTime() : 0
    const days = Math.max(0, ageMs / (1000 * 60 * 60 * 24))
    runWeights.set(r.id, { weight: ageWeight(days, sameSeason), sameSeason })
  }

  const runIds = Array.from(runWeights.keys())
  const cands = await db!
    .select({
      discovery_run_id: guestDiscoveryCandidates.discovery_run_id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      archetype: guestDiscoveryCandidates.archetype,
      story_signals: guestDiscoveryCandidates.story_signals,
      evidence_summary: guestDiscoveryCandidates.evidence_summary,
      evidence_urls: guestDiscoveryCandidates.evidence_urls,
    })
    .from(guestDiscoveryCandidates)
    .where(
      sql`${guestDiscoveryCandidates.discovery_run_id} = ANY(ARRAY[${sql.join(
        runIds.map((id) => sql`${id}`),
        sql`,`,
      )}]::text[])`,
    )

  const corpus: NoveltyCorpus = {
    arcs: new Map(),
    topics: new Map(),
    names: new Map(),
    evidence_domains: new Map(),
    archetype_ids: new Map(),
  }

  // Pre-load archetype_ids from run.archetypes (a run may have no candidates yet).
  for (const r of allPrior) {
    const w = runWeights.get(r.id)?.weight ?? 0
    const arr = (r.archetypes ?? []) as Array<{ id?: string }>
    for (const a of arr) {
      if (a?.id) bumpWeighted(corpus.archetype_ids, a.id.toLowerCase().trim(), w)
    }
  }

  for (const c of cands) {
    const w = runWeights.get(c.discovery_run_id ?? "")?.weight ?? 0
    if (w === 0) continue
    const arch = c.archetype as { id?: string } | null
    if (arch?.id) bumpWeighted(corpus.archetype_ids, arch.id.toLowerCase().trim(), w)
    if (c.proposed_name) bumpWeighted(corpus.names, normalize(c.proposed_name), w)

    const story = c.story_signals as { arcs?: string[]; topics?: string[] } | null
    for (const a of story?.arcs ?? []) bumpWeighted(corpus.arcs, normalize(a), w)
    for (const t of story?.topics ?? []) bumpWeighted(corpus.topics, normalize(t), w)

    const summary = c.evidence_summary as { topics?: string[] } | null
    for (const t of summary?.topics ?? []) bumpWeighted(corpus.topics, normalize(t), w)

    const urls = (c.evidence_urls ?? []) as Array<{ url?: string }>
    for (const u of urls) {
      const h = u.url ? hostOf(u.url) : null
      if (h) bumpWeighted(corpus.evidence_domains, h, w)
    }
  }

  for (const map of [corpus.arcs, corpus.topics, corpus.names]) {
    map.delete("")
  }
  return corpus
}

/**
 * Penalty factor for a candidate against a corpus. Weighted by season +
 * age, capped at 1.0.
 *
 * Base contributions:
 *   - arcs           : 0.4
 *   - topics         : 0.2
 *   - same name      : 0.5
 *   - all evidence
 *     domains seen   : 0.15
 *   - same archetype : 0.1
 *
 * Each contribution is multiplied by the corpus weight of the strongest
 * matching entry, so a 6-month-old prior-season repeat penalizes less
 * than a same-season repeat.
 */
export function noveltyPenaltyAgainstCorpus(input: {
  arcs: string[]
  topics: string[]
  proposed_name: string | null
  evidence_urls: Array<{ url?: string }>
  archetype_id: string | null
  corpus: NoveltyCorpus
}): number {
  const c = input.corpus
  let penalty = 0

  const peakWeight = (set: WeightedSet, values: string[]) =>
    values.reduce((max, v) => Math.max(max, set.get(normalize(v)) ?? 0), 0)

  penalty += 0.4 * peakWeight(c.arcs, input.arcs)
  penalty += 0.2 * peakWeight(c.topics, input.topics)

  if (input.proposed_name) {
    penalty += 0.5 * (c.names.get(normalize(input.proposed_name)) ?? 0)
  }

  const hosts = input.evidence_urls
    .map((u) => (u.url ? hostOf(u.url) : null))
    .filter((h): h is string => Boolean(h))
  if (hosts.length > 0) {
    const allSeen = hosts.every((h) => c.evidence_domains.has(h))
    if (allSeen) {
      const peakDomainWeight = hosts.reduce(
        (max, h) => Math.max(max, c.evidence_domains.get(h) ?? 0),
        0,
      )
      penalty += 0.15 * peakDomainWeight
    }
  }

  if (input.archetype_id) {
    const w = c.archetype_ids.get(input.archetype_id.toLowerCase().trim()) ?? 0
    penalty += 0.1 * w
  }

  return Math.min(1, penalty)
}
