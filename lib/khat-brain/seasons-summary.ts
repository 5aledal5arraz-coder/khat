/**
 * UX-2 — Read service for the Seasons list + Season Workspace.
 *
 * Returns a per-season summary that the new pages can render directly:
 *   - core season metadata (id, name, status, mode, target)
 *   - generated_count   = total episode candidates in the season
 *   - accepted_count    = approved candidates (post-acceptance state)
 *   - rejected_count    = rejected candidates
 *   - pending_count     = proposed candidates awaiting decision
 *   - last_activity_at  = MAX(updated_at) across season + candidates
 *
 * No write paths. Pure aggregation built on top of existing queries.
 */

import { and, eq, sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
} from "@/lib/db/schema/khat-map"
import { listSeasons, type SeasonListFilter } from "@/lib/khat-map/core/queries"
import type { KhatMapSeason } from "@/types/khat-map"

export interface SeasonSummary extends KhatMapSeason {
  generated_count: number
  accepted_count: number
  rejected_count: number
  pending_count: number
  last_activity_at: string
}

export async function listSeasonSummaries(
  filter: SeasonListFilter = "active",
): Promise<SeasonSummary[]> {
  const seasons = await listSeasons(filter)
  if (seasons.length === 0) return []

  // One grouped query for all candidate counts across the seasons we
  // just loaded. Cheap because the candidate table is small.
  const ids = seasons.map((s) => s.id)
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )
  const result = await db!.execute(sql`
    SELECT season_id,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'approved')::int AS accepted,
           COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
           COUNT(*) FILTER (WHERE status = 'proposed')::int AS pending,
           MAX(updated_at) AS last_at
    FROM khat_map_episode_candidates
    WHERE season_id IN (${idList})
    GROUP BY season_id
  `)
  const rows = (result as unknown as {
    rows: Array<{
      season_id: string
      total: number
      accepted: number
      rejected: number
      pending: number
      last_at: string | Date | null
    }>
  }).rows

  const byId = new Map<string, (typeof rows)[number]>()
  for (const r of rows) byId.set(r.season_id, r)

  return seasons.map((s) => {
    const row = byId.get(s.id)
    const candLast =
      row?.last_at instanceof Date
        ? row.last_at.toISOString()
        : typeof row?.last_at === "string"
          ? row.last_at
          : null
    const last_activity_at = pickLatest(s.updated_at, candLast) ?? s.updated_at
    return {
      ...s,
      generated_count: row?.total ?? 0,
      accepted_count: row?.accepted ?? 0,
      rejected_count: row?.rejected ?? 0,
      pending_count: row?.pending ?? 0,
      last_activity_at,
    }
  })
}

function pickLatest(a: string | null, b: string | null): string | null {
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

// ─── Re-exports + helpers used by the [seasonId] workspace ───────────

/**
 * For a list of episode candidates, fetch each one's EIR phase + working
 * title. Used by the "Episodes in this season" section so it can show
 * the next-action CTA for accepted candidates that have walked into an
 * EIR.
 */
export async function loadEirPhasesForCandidates(
  candidateIds: string[],
): Promise<Map<string, { eir_id: string; phase: string; updated_at: string }>> {
  if (candidateIds.length === 0) return new Map()
  const idList = sql.join(
    candidateIds.map((id) => sql`${id}`),
    sql`, `,
  )
  const result = await db!.execute(sql`
    SELECT c.id AS candidate_id,
           e.id AS eir_id,
           e.phase AS phase,
           e.updated_at AS updated_at
    FROM khat_map_episode_candidates c
    JOIN episode_intelligence_records e ON e.id = c.eir_id
    WHERE c.id IN (${idList})
  `)
  const rows = (result as unknown as {
    rows: Array<{
      candidate_id: string
      eir_id: string
      phase: string
      updated_at: string | Date
    }>
  }).rows
  const map = new Map<string, { eir_id: string; phase: string; updated_at: string }>()
  for (const r of rows) {
    map.set(r.candidate_id, {
      eir_id: r.eir_id,
      phase: r.phase,
      updated_at:
        r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : String(r.updated_at),
    })
  }
  return map
}

void khatMapSeasons
void khatMapEpisodeCandidates
void and
void eq
void desc
