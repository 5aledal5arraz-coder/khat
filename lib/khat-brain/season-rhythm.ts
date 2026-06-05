/**
 * Season rhythm — production-readiness fix sprint #2.11.
 *
 * Reads the approved + converted candidates of a season and reports
 * which topic_domains are over-represented. Surfaces a soft warning so
 * the operator can intervene before accepting a 3rd of the same
 * domain. Doesn't block — the wizard's accept action is unchanged.
 *
 * Threshold: 2 episodes of the same domain in a 6-episode season is OK,
 * 3+ is over-represented. For larger seasons we scale linearly with
 * `target_episode_count / 3` (same cap as `computeDomainLoad`).
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export interface DomainBalanceReport {
  season_target: number
  per_domain_cap: number
  domain_counts: Array<{
    domain: string
    accepted_count: number
    /** True when the domain has reached `per_domain_cap`. */
    at_cap: boolean
    /** True when the domain has exceeded `per_domain_cap`. */
    over_cap: boolean
  }>
  /** True when at least one domain is at or beyond cap. */
  has_warning: boolean
}

export async function getDomainBalanceReport(
  seasonId: string,
): Promise<DomainBalanceReport> {
  const empty: DomainBalanceReport = {
    season_target: 0,
    per_domain_cap: 0,
    domain_counts: [],
    has_warning: false,
  }
  if (!db) return empty

  // Pull season target so we can derive the cap.
  const targetRow = await db.execute(sql`
    SELECT target_episode_count
    FROM khat_map_seasons
    WHERE id = ${seasonId}
    LIMIT 1
  `)
  const target = Number(
    (targetRow.rows[0] as { target_episode_count?: number } | undefined)
      ?.target_episode_count ?? 6,
  )
  const cap = Math.max(2, Math.ceil(target / 3))

  const rows = await db.execute(sql`
    SELECT topic_domain, COUNT(*)::int AS n
    FROM khat_map_episode_candidates
    WHERE season_id = ${seasonId}
      AND status IN ('approved', 'converted_to_preparation')
    GROUP BY topic_domain
    ORDER BY n DESC
  `)

  const counts = rows.rows.map((r) => {
    const row = r as { topic_domain: string; n: number }
    return {
      domain: row.topic_domain,
      accepted_count: row.n,
      at_cap: row.n >= cap,
      over_cap: row.n > cap,
    }
  })

  return {
    season_target: target,
    per_domain_cap: cap,
    domain_counts: counts,
    has_warning: counts.some((c) => c.at_cap),
  }
}
