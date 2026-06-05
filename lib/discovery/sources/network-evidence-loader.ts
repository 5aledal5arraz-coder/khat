/**
 * Phase Beta — NetworkSource DB seam.
 *
 * NetworkSource is pure logic so it can be unit-tested without DB.
 * This module is the thin DB adapter the job dispatcher passes in.
 *
 * Loads recently-promoted (or even just non-rejected) candidates from
 * the same season, returning the minimal slice NetworkSource needs to
 * extract names from.
 */

import { and, eq, ne, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestDiscoveryCandidates,
  discoveryRuns,
  type DiscoveryEvidenceSummary,
  type DiscoveryEvidenceUrl,
} from "@/lib/db/schema/discovery"

const NETWORK_LOAD_LIMIT = 60

/**
 * Pull non-rejected candidates from any of the season's discovery
 * runs. NetworkSource then mines their evidence for name mentions.
 */
export async function loadSeasonNetworkEvidence(seasonId: string): Promise<
  Array<{
    candidate_id: string
    proposed_name: string | null
    evidence_summary: DiscoveryEvidenceSummary | null
    evidence_urls: DiscoveryEvidenceUrl[]
  }>
> {
  if (!db) return []
  // Find this season's runs first
  const runs = await db
    .select({ id: discoveryRuns.id })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.season_id, seasonId))
    .limit(20)
  if (runs.length === 0) return []
  const runIds = runs.map((r) => r.id)

  const rows = await db
    .select({
      id: guestDiscoveryCandidates.id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      evidence_summary: guestDiscoveryCandidates.evidence_summary,
      evidence_urls: guestDiscoveryCandidates.evidence_urls,
    })
    .from(guestDiscoveryCandidates)
    .where(
      and(
        inArray(guestDiscoveryCandidates.discovery_run_id, runIds),
        ne(guestDiscoveryCandidates.status, "rejected"),
      ),
    )
    .limit(NETWORK_LOAD_LIMIT)

  return rows.map((r) => ({
    candidate_id: r.id,
    proposed_name: r.proposed_name,
    evidence_summary: (r.evidence_summary ?? null) as DiscoveryEvidenceSummary | null,
    evidence_urls: (r.evidence_urls ?? []) as DiscoveryEvidenceUrl[],
  }))
}
