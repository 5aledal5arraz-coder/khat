/**
 * User taste profile — derived from the decision journal.
 *
 * One row per admin. Scores live in [0, 1] with 0.5 as the neutral
 * starting point. The recompute walks every non-undone decision the
 * admin has ever made across all seasons and nudges scores based on
 * the domain of the episode candidate the decision references.
 *
 * Scoring model:
 *
 *   • Each accept applies a +ε nudge to the category its topic_domain
 *     falls into; each reject applies −ε.
 *   • ε = (0.1 / sqrt(total_decisions + 1)) × performance_weight.
 *   • performance_weight reads the actual published-episode outcome
 *     (lib/khat-map/performance) and ranges 0.5×–1.5×: a flop barely
 *     moves taste, a hit moves it harder. Rejects and unsynced accepts
 *     use 1.0×.
 *   • Scores clamp to [0, 1]. Values near 0.5 with low total_decisions
 *     mean "unknown" — the UI should suppress 'Why this fits YOU'
 *     reasoning below a confidence threshold (default: 10 decisions).
 *
 * Domain → axis mapping is deliberately conservative. When a domain
 * legitimately fits multiple axes (e.g. "religion" is both bold and
 * emotional) we bias it toward the axis the v1 constitution already
 * treats as primary.
 */

import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasonDecisions,
  khatMapEpisodeCandidates,
  khatMapUserTasteProfile,
} from "@/lib/db/schema/khat-map"
import type {
  KhatMapUserTasteProfile,
  KhatMapTasteDomainWeight,
  KhatMapTasteRejectedPattern,
  KhatMapTopicDomain,
  KhatMapFeedbackReasonCategory,
} from "@/types/khat-map"
import { KHAT_TASTE_PROFILE_NEUTRAL } from "@/types/khat-map"
import { getPerformanceByCandidateIds } from "@/lib/khat-map/performance"

/**
 * Performance-weighted accept multiplier.
 *
 * An accept on a candidate that became a high-performing episode should
 * shift the taste profile harder than an accept that flopped. Range:
 *   • 0.5× for performance_score = 0 (the show didn't land)
 *   • 1.0× when no performance data exists yet (unpublished/unsynced)
 *   • 1.5× for performance_score = 1 (top tier)
 *
 * Rejects always use 1.0× — we have no outcome to weigh them against.
 */
function performanceWeight(score: number | null | undefined): number {
  if (score === null || score === undefined) return 1.0
  return 0.5 + score
}

type ProfileRow = typeof khatMapUserTasteProfile.$inferSelect

/** Threshold below which the UI should treat the profile as "still learning." */
export const TASTE_CONFIDENCE_MIN_DECISIONS = 10

function mapProfile(row: ProfileRow): KhatMapUserTasteProfile {
  return {
    user_id: row.user_id,
    preferred_domains: row.preferred_domains ?? [],
    rejected_patterns: row.rejected_patterns ?? [],
    depth_score: row.depth_score,
    controversy_tolerance: row.controversy_tolerance,
    emotional_preference: row.emotional_preference,
    kuwait_relevance_weight: row.kuwait_relevance_weight,
    total_decisions: row.total_decisions,
    last_recomputed_at: row.last_recomputed_at
      ? row.last_recomputed_at.toISOString()
      : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

/**
 * Read a profile, returning the neutral seed (in-memory only, not
 * persisted) when the admin has never been recorded. UI callers can
 * check `total_decisions === 0` to detect this state.
 */
export async function getTasteProfile(
  user_id: string,
): Promise<KhatMapUserTasteProfile> {
  const rows = await db!
    .select()
    .from(khatMapUserTasteProfile)
    .where(eq(khatMapUserTasteProfile.user_id, user_id))
    .limit(1)
  if (rows[0]) return mapProfile(rows[0])
  const nowIso = new Date().toISOString()
  return {
    user_id,
    ...KHAT_TASTE_PROFILE_NEUTRAL,
    last_recomputed_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  }
}

/** Which of the 4 taste axes a given domain pushes on. */
type TasteAxis =
  | "depth_score"
  | "controversy_tolerance"
  | "emotional_preference"
  | "kuwait_relevance_weight"

const DOMAIN_AXIS: Partial<Record<KhatMapTopicDomain, TasteAxis>> = {
  philosophy: "depth_score",
  psychology: "depth_score",
  hidden_history: "depth_score",
  historical: "depth_score",
  religion: "controversy_tolerance",
  power_manipulation: "controversy_tolerance",
  crime_mystery: "controversy_tolerance",
  social_issues: "controversy_tolerance",
  emotions_inner_life: "emotional_preference",
  relationships: "emotional_preference",
  parenting: "emotional_preference",
  kuwait_gulf: "kuwait_relevance_weight",
  // These domains don't push any axis — they're "neutral" and only
  // feed `preferred_domains`:
  //   technology_ai, internet_culture, money_career, identity_masculinity,
  //   modern_society, none
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

/**
 * Recompute + upsert the profile for one admin. Reads every effective
 * decision they've made, joins it to the episode candidate to learn the
 * domain, and updates the scores + aggregate lists.
 *
 * Returns the freshly-saved profile.
 */
export async function recomputeTasteProfile(
  user_id: string,
): Promise<KhatMapUserTasteProfile> {
  const decisionRows = await db!
    .select({
      kind: khatMapSeasonDecisions.kind,
      reason_category: khatMapSeasonDecisions.reason_category,
      created_at: khatMapSeasonDecisions.created_at,
      topic_candidate_id: khatMapSeasonDecisions.topic_candidate_id,
      topic_domain: khatMapEpisodeCandidates.topic_domain,
    })
    .from(khatMapSeasonDecisions)
    .leftJoin(
      khatMapEpisodeCandidates,
      eq(
        khatMapSeasonDecisions.topic_candidate_id,
        khatMapEpisodeCandidates.id,
      ),
    )
    .where(
      and(
        eq(khatMapSeasonDecisions.admin_id, user_id),
        isNull(khatMapSeasonDecisions.undone_at),
      ),
    )

  // Ignore decisions that don't carry signal yet.
  const scored = decisionRows.filter(
    (d) => d.kind === "accept" || d.kind === "reject",
  )
  const total = scored.length

  // Pull performance rows for accepted candidates so we can weight each
  // accept by how the resulting episode actually landed.
  const acceptedCandidateIds = scored
    .filter((d) => d.kind === "accept" && d.topic_candidate_id)
    .map((d) => d.topic_candidate_id as string)
  const performanceMap = acceptedCandidateIds.length
    ? await getPerformanceByCandidateIds(acceptedCandidateIds)
    : new Map()

  // Axis scores start neutral and move with each decision. ε shrinks as
  // total grows so later decisions don't nuke early signal.
  const axes: Record<TasteAxis, number> = {
    depth_score: 0.5,
    controversy_tolerance: 0.5,
    emotional_preference: 0.5,
    kuwait_relevance_weight: 0.5,
  }
  // Preferred domains: accept +1, reject -0.5 per domain
  const domainCount: Record<string, { score: number; count: number }> = {}
  // Rejected patterns: reason_category aggregation
  const rejectedPatterns: Record<
    KhatMapFeedbackReasonCategory,
    { count: number; last: Date }
  > = {} as Record<KhatMapFeedbackReasonCategory, { count: number; last: Date }>

  let appliedIdx = 0
  for (const d of scored) {
    const sign = d.kind === "accept" ? 1 : -1
    const baseEpsilon = 0.1 / Math.sqrt(appliedIdx + 2)
    appliedIdx++

    // Weight accepts by actual episode performance. Rejects stay at 1.0 —
    // we have no outcome to grade them against.
    const perfRow =
      sign === 1 && d.topic_candidate_id
        ? performanceMap.get(d.topic_candidate_id)
        : null
    const perfWeight =
      sign === 1 ? performanceWeight(perfRow?.performance_score ?? null) : 1.0
    const epsilon = baseEpsilon * perfWeight

    if (d.topic_domain) {
      const axis = DOMAIN_AXIS[d.topic_domain as KhatMapTopicDomain]
      if (axis) {
        axes[axis] = clamp(axes[axis] + sign * epsilon)
      }
      const key = d.topic_domain
      const entry = domainCount[key] ?? { score: 0, count: 0 }
      entry.score += sign === 1 ? 1 * perfWeight : -0.5
      entry.count += 1
      domainCount[key] = entry
    }

    if (d.kind === "reject" && d.reason_category) {
      const pat = rejectedPatterns[d.reason_category] ?? {
        count: 0,
        last: new Date(0),
      }
      pat.count += 1
      if (d.created_at > pat.last) pat.last = d.created_at
      rejectedPatterns[d.reason_category] = pat
    }
  }

  const preferred_domains: KhatMapTasteDomainWeight[] = Object.entries(
    domainCount,
  )
    // Normalize score into a [0, 1] weight: positive scores → above 0.5,
    // negative → below. We use a sigmoid-ish squash so a handful of
    // accepts doesn't saturate to 1 instantly.
    .map(([domain, { score, count }]) => ({
      domain: domain as KhatMapTopicDomain,
      weight: clamp(0.5 + score / (Math.abs(score) + 3)),
      decision_count: count,
    }))
    .sort((a, b) => b.weight - a.weight)

  const rejected_patterns: KhatMapTasteRejectedPattern[] = Object.entries(
    rejectedPatterns,
  )
    .map(([reason_category, v]) => ({
      reason_category: reason_category as KhatMapFeedbackReasonCategory,
      count: v.count,
      last_seen_at: v.last.toISOString(),
    }))
    .sort((a, b) => b.count - a.count)

  const next = {
    user_id,
    preferred_domains,
    rejected_patterns,
    depth_score: axes.depth_score,
    controversy_tolerance: axes.controversy_tolerance,
    emotional_preference: axes.emotional_preference,
    kuwait_relevance_weight: axes.kuwait_relevance_weight,
    total_decisions: total,
    last_recomputed_at: new Date(),
  }

  const [row] = await db!
    .insert(khatMapUserTasteProfile)
    .values(next)
    .onConflictDoUpdate({
      target: khatMapUserTasteProfile.user_id,
      set: {
        preferred_domains: next.preferred_domains,
        rejected_patterns: next.rejected_patterns,
        depth_score: next.depth_score,
        controversy_tolerance: next.controversy_tolerance,
        emotional_preference: next.emotional_preference,
        kuwait_relevance_weight: next.kuwait_relevance_weight,
        total_decisions: next.total_decisions,
        last_recomputed_at: next.last_recomputed_at,
        updated_at: new Date(),
      },
    })
    .returning()
  return mapProfile(row)
}

/**
 * Aggregate one-line count for the UI — how many admins have any
 * recorded taste data. Cheap enough to hit on every wizard mount.
 */
export async function countProfiles(): Promise<number> {
  const rows = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(khatMapUserTasteProfile)
  return rows[0]?.c ?? 0
}
