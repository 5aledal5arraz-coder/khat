/**
 * Discovery results FOR ONE EPISODE — what the EIR page shows inline.
 *
 * A run belongs to an EIR when it was launched for it:
 *   - the standalone path stores `source_config.eirId` (since 2026-09-28);
 *   - the Khat Map path runs against the EIR's source episode candidate
 *     (`editorial_intent.source === "khat_map_candidate"`), recorded as
 *     `discovery_runs.source_episode_candidate_id`.
 * Before this, the results lived only on /admin/discovery-v2/<runId> and
 * nothing led from them back to the episode (2026-09-28 end-to-end test).
 */

import { desc, eq, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { discoveryRuns } from "@/lib/db/schema/discovery"
import { listCandidates } from "./candidates"
import { discoveryNameKey } from "@/lib/discovery-v2/memory"
import { listCandidatesNominatedForEir } from "@/lib/guest-candidates/from-discovery"
import type { V2Candidate } from "@/lib/discovery-v2/types"
import { runWarnings, type WebSearchHealthStats } from "@/lib/discovery-v2/web-search-health"

export interface EirDiscoveryCandidate {
  id: string
  name: string
  role: string | null
  decision: V2Candidate["decision"]
  /** First reason the scorer gave — the one-line "why". */
  reason: string | null
  overall: number | null
  /** Already nominated for THIS episode (a CRM record carries its id). */
  nominated: boolean
}

export interface EirDiscoveryRun {
  id: string
  status: string
  created_at: string
  candidates: EirDiscoveryCandidate[]
  /**
   * Run-level warnings (web search mostly failed / propose returned no
   * names) — the same copy the run page shows (web-search-health.ts).
   */
  warnings: string[]
}

const DECISION_ORDER: Record<V2Candidate["decision"], number> = {
  accepted: 0,
  needs_review: 1,
  shortlist: 2,
  rejected: 3,
}

/** The most recent runs launched for this EIR, with their non-rejected candidates. */
export async function listDiscoveryResultsForEir(
  eir: { id: string; editorial_intent?: { source?: string | null; source_id?: string | null } | null },
  opts: { runs?: number } = {},
): Promise<EirDiscoveryRun[]> {
  if (!db) return []
  const intent = eir.editorial_intent ?? {}
  const episodeCandidateId =
    intent.source === "khat_map_candidate" && intent.source_id ? intent.source_id : null

  const runs = await db
    .select({
      id: discoveryRuns.id,
      status: discoveryRuns.status,
      created_at: discoveryRuns.created_at,
      source_config: discoveryRuns.source_config,
    })
    .from(discoveryRuns)
    .where(
      episodeCandidateId
        ? or(
            sql`${discoveryRuns.source_config}->>'eirId' = ${eir.id}`,
            eq(discoveryRuns.source_episode_candidate_id, episodeCandidateId),
          )
        : sql`${discoveryRuns.source_config}->>'eirId' = ${eir.id}`,
    )
    .orderBy(desc(discoveryRuns.created_at))
    .limit(opts.runs ?? 3)
  if (runs.length === 0) return []

  const nominatedKeys = new Set(
    (await listCandidatesNominatedForEir(eir.id)).map((c) => discoveryNameKey(c.full_name)),
  )

  const out: EirDiscoveryRun[] = []
  for (const run of runs) {
    const rows = await listCandidates({ discovery_run_id: run.id, limit: 200 }).catch(() => [])
    const candidates = rows
      .map((r): EirDiscoveryCandidate => {
        const v2 = ((r.platform_signals as { v2?: Record<string, unknown> } | null)?.v2 ?? {}) as Record<
          string,
          unknown
        >
        const decision = (v2.decision as V2Candidate["decision"]) ?? "shortlist"
        const scores = v2.scores as { overall?: number } | undefined
        const name = (r.display_name ?? r.proposed_name ?? "").trim() || "—"
        return {
          id: r.id,
          name,
          role: r.proposed_role ?? null,
          decision,
          reason: ((v2.reasons as string[] | undefined) ?? [])[0] ?? null,
          overall: typeof scores?.overall === "number" ? scores.overall : null,
          nominated: nominatedKeys.has(discoveryNameKey(name)),
        }
      })
      .filter((c) => c.decision !== "rejected")
      .sort((a, b) => DECISION_ORDER[a.decision] - DECISION_ORDER[b.decision] || (b.overall ?? 0) - (a.overall ?? 0))
    out.push({
      id: run.id,
      status: run.status,
      created_at: run.created_at ? new Date(run.created_at).toISOString() : new Date().toISOString(),
      candidates,
      warnings: runWarnings(
        (run.source_config as { v2_stats?: WebSearchHealthStats } | null)?.v2_stats,
        run.status,
      ),
    })
  }
  return out
}
