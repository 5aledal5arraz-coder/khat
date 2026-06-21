/**
 * Phase B redesign — per-episode discovery candidate query.
 *
 * The Phase B panel lists candidates that targeted a specific episode
 * candidate (via the `target_episode_candidate_id` FK populated by the
 * episode-scoped run). We surface the candidates still awaiting the
 * operator's decision: the v2 engine writes its "accepted" tier as
 * `under_review` and its "shortlist" tier as `proposed` (see
 * discovery-v2 handler `decisionToStatus`), so we show BOTH. We exclude
 * `rejected` (verifier filter mismatches) and the operator-acted
 * `promoted` / `saved_for_later`.
 *
 * Ranking: highest `composite_score` first; ties broken by
 * `topic_fit_score`, then by recency. Both columns may be null for
 * runs still in flight, in which case we fall back to creation order.
 */

import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestDiscoveryCandidates,
  type DiscoveryCandidateStatus,
} from "@/lib/db/schema/discovery"
import { mapRow, type DiscoveryCandidateRecord } from "./candidates"

export interface ListCandidatesForEpisodeInput {
  episodeCandidateId: string
  limit?: number
  statuses?: DiscoveryCandidateStatus[]
}

export async function listCandidatesForEpisode(
  input: ListCandidatesForEpisodeInput,
): Promise<DiscoveryCandidateRecord[]> {
  if (!db) return []
  const statuses =
    input.statuses ??
    (["under_review", "proposed"] as DiscoveryCandidateStatus[])
  const rows = await db
    .select()
    .from(guestDiscoveryCandidates)
    .where(
      and(
        eq(
          guestDiscoveryCandidates.target_episode_candidate_id,
          input.episodeCandidateId,
        ),
        inArray(guestDiscoveryCandidates.status, statuses),
      ),
    )
    .orderBy(
      desc(guestDiscoveryCandidates.composite_score),
      desc(guestDiscoveryCandidates.topic_fit_score),
      desc(guestDiscoveryCandidates.created_at),
    )
    .limit(input.limit ?? 8)

  // Reuse the canonical row→record mapper so this query stays in lockstep
  // with `listCandidates` — including the Phase Alpha fields the previous
  // inline mapper omitted (which made the result non-assignable to
  // DiscoveryCandidateRecord).
  return rows.map(mapRow)
}
