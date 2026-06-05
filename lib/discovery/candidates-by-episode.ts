/**
 * Phase B redesign — per-episode discovery candidate query.
 *
 * The Phase B panel lists candidates that targeted a specific episode
 * candidate (via the `target_episode_candidate_id` FK populated by the
 * episode-scoped run). We surface only `proposed` candidates — the
 * verifier auto-rejects filter mismatches, and the operator has already
 * acted on `promoted` / `rejected` / `saved_for_later` ones.
 *
 * Ranking: highest `composite_score` first; ties broken by
 * `topic_fit_score`, then by recency. Both columns may be null for
 * runs still in flight, in which case we fall back to creation order.
 */

import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestDiscoveryCandidates,
  type DiscoveryCandidateStatus,
} from "@/lib/db/schema/discovery"
import type { DiscoveryCandidateRecord } from "./candidates"

export interface ListCandidatesForEpisodeInput {
  episodeCandidateId: string
  limit?: number
  statuses?: DiscoveryCandidateStatus[]
}

export async function listCandidatesForEpisode(
  input: ListCandidatesForEpisodeInput,
): Promise<DiscoveryCandidateRecord[]> {
  if (!db) return []
  const statuses = input.statuses ?? (["proposed"] as DiscoveryCandidateStatus[])
  const rows = await db
    .select()
    .from(guestDiscoveryCandidates)
    .where(
      and(
        eq(
          guestDiscoveryCandidates.target_episode_candidate_id,
          input.episodeCandidateId,
        ),
        sql`${guestDiscoveryCandidates.status} = ANY(${statuses})`,
      ),
    )
    .orderBy(
      desc(guestDiscoveryCandidates.composite_score),
      desc(guestDiscoveryCandidates.topic_fit_score),
      desc(guestDiscoveryCandidates.created_at),
    )
    .limit(input.limit ?? 8)

  return rows.map((r) => ({
    id: r.id,
    discovery_run_id: r.discovery_run_id,
    target_episode_candidate_id: r.target_episode_candidate_id,
    proposed_name: r.proposed_name,
    proposed_role: r.proposed_role,
    proposed_country: r.proposed_country,
    archetype: r.archetype,
    evidence_urls: r.evidence_urls ?? [],
    evidence_summary: r.evidence_summary,
    platform_signals: r.platform_signals,
    story_signals: r.story_signals,
    general_rationale: r.general_rationale ?? null,
    topic_fit_rationale: r.topic_fit_rationale ?? null,
    social_links: r.social_links ?? null,
    editorial_fit_score:
      r.editorial_fit_score === null ? null : Number(r.editorial_fit_score),
    hiddenness_score:
      r.hiddenness_score === null ? null : Number(r.hiddenness_score),
    novelty_score: r.novelty_score === null ? null : Number(r.novelty_score),
    evidence_strength_score:
      r.evidence_strength_score === null
        ? null
        : Number(r.evidence_strength_score),
    topic_fit_score:
      r.topic_fit_score === null ? null : Number(r.topic_fit_score),
    composite_score:
      r.composite_score === null ? null : Number(r.composite_score),
    status: r.status as DiscoveryCandidateStatus,
    promoted_guest_id: r.promoted_guest_id,
    rejection_reason: r.rejection_reason,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }))
}
