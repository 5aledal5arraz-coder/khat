/**
 * Phase 3 — Trusted Sources read layer.
 *
 * One aggregate query returns every source the operator needs to see
 * along with the preview stats (linked signal count, mean score,
 * approve/reject ratio, latest activity). Avoids N+1 — all stats
 * computed in a single CTE.
 *
 * `latest_signal_titles` is loaded separately in a lateral query so we
 * can cap per-source preview rows without hard limits on the main
 * select.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { HIGH_THRESHOLD } from "./sources-types"
import type {
  SourcePreviewSignal,
  SourceRow,
  SourcesQueryOptions,
} from "./sources-types"

// Re-export so existing call-sites that imported from this module
// keep working.
export {
  SOURCE_FILTER_KEYS,
  SOURCE_SORT_KEYS,
  HIGH_THRESHOLD,
} from "./sources-types"
export type {
  SourceFilterKey,
  SourceSortKey,
  SourceRow,
  SourcePreviewSignal,
  SourcesQueryOptions,
  SourceFacets,
} from "./sources-types"

export async function listTrustedSources(
  opts: SourcesQueryOptions = {},
): Promise<SourceRow[]> {
  if (!db) return []
  const filter = opts.filter ?? "all"
  const sort = opts.sort ?? "newest"
  const includeArchived = opts.includeArchived ?? filter === "archived"

  const conds: ReturnType<typeof sql>[] = []
  if (!includeArchived) conds.push(sql`s.archived_at IS NULL`)
  if (filter === "archived") conds.push(sql`s.archived_at IS NOT NULL`)
  if (filter === "active")
    conds.push(sql`s.active = true AND s.archived_at IS NULL`)
  if (filter === "inactive")
    conds.push(sql`s.active = false AND s.archived_at IS NULL`)
  if (filter === "high_trust")
    conds.push(sql`s.trust_score >= ${HIGH_THRESHOLD}`)
  if (filter === "high_alignment")
    conds.push(sql`s.editorial_alignment_score >= ${HIGH_THRESHOLD}`)
  if (opts.type) conds.push(sql`s.source_type = ${opts.type}`)
  if (opts.language) conds.push(sql`s.language = ${opts.language}`)
  if (opts.geography) conds.push(sql`s.geography = ${opts.geography}`)
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`
    conds.push(
      sql`(s.display_name ILIKE ${q} OR s.identifier ILIKE ${q} OR s.notes ILIKE ${q})`,
    )
  }
  const whereClause =
    conds.length === 0
      ? sql``
      : sql`WHERE ${sql.join(conds, sql` AND `)}`

  const orderClause = (() => {
    switch (sort) {
      case "trust_desc":
        return sql`ORDER BY s.trust_score DESC, s.updated_at DESC`
      case "alignment_desc":
        return sql`ORDER BY s.editorial_alignment_score DESC, s.updated_at DESC`
      case "linked_desc":
        return sql`ORDER BY linked_count DESC NULLS LAST, s.updated_at DESC`
      case "newest":
      default:
        return sql`ORDER BY s.created_at DESC`
    }
  })()

  const r = await db.execute(sql`
    WITH stats AS (
      SELECT
        sig.trusted_source_id AS source_id,
        count(*)::int                                       AS linked_count,
        count(*) FILTER (WHERE sig.review_status='approved')::int  AS approved_count,
        count(*) FILTER (WHERE sig.review_status='rejected')::int  AS rejected_count,
        count(*) FILTER (WHERE sig.review_status='archived')::int  AS archived_signal_count,
        count(*) FILTER (WHERE sig.review_status='new')::int       AS new_count,
        avg(sig.signal_score)                              AS mean_signal_score,
        max(sig.collected_at)::text                         AS latest_signal_at
      FROM market_topic_signals sig
      WHERE sig.trusted_source_id IS NOT NULL
      GROUP BY sig.trusted_source_id
    )
    SELECT
      s.id, s.source_type, s.identifier, s.display_name, s.language,
      s.geography, s.trust_score, s.editorial_alignment_score,
      s.active, s.archived_at::text AS archived_at, s.notes,
      s.created_at::text AS created_at, s.updated_at::text AS updated_at,
      COALESCE(st.linked_count, 0)            AS linked_count,
      COALESCE(st.approved_count, 0)          AS approved_count,
      COALESCE(st.rejected_count, 0)          AS rejected_count,
      COALESCE(st.archived_signal_count, 0)   AS archived_signal_count,
      COALESCE(st.new_count, 0)               AS new_count,
      st.mean_signal_score                    AS mean_signal_score,
      st.latest_signal_at                     AS latest_signal_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sig.id,
          'title', sig.title,
          'collected_at', sig.collected_at::text,
          'review_status', sig.review_status
        ) ORDER BY sig.collected_at DESC)
        FROM (
          SELECT id, title, collected_at, review_status
          FROM market_topic_signals
          WHERE trusted_source_id = s.id
          ORDER BY collected_at DESC
          LIMIT 3
        ) sig
      ), '[]'::jsonb) AS latest_signals
    FROM market_trusted_sources s
    LEFT JOIN stats st ON st.source_id = s.id
    ${whereClause}
    ${orderClause}
    LIMIT 200
  `)

  return (r.rows as Array<Record<string, unknown>>).map((row) => {
    const approved = Number(row.approved_count ?? 0)
    const rejected = Number(row.rejected_count ?? 0)
    const totalReviewed = approved + rejected
    return {
      id: String(row.id),
      source_type: row.source_type as SourceRow["source_type"],
      identifier: String(row.identifier ?? ""),
      display_name: String(row.display_name ?? ""),
      language: String(row.language ?? "ar"),
      geography: (row.geography as string | null) ?? null,
      trust_score: Number(row.trust_score ?? 0),
      editorial_alignment_score: Number(row.editorial_alignment_score ?? 0),
      active: row.active === true,
      archived_at: (row.archived_at as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
      linked_count: Number(row.linked_count ?? 0),
      approved_count: approved,
      rejected_count: rejected,
      archived_signal_count: Number(row.archived_signal_count ?? 0),
      new_count: Number(row.new_count ?? 0),
      mean_signal_score:
        row.mean_signal_score === null || row.mean_signal_score === undefined
          ? null
          : Number(row.mean_signal_score),
      approval_ratio: totalReviewed === 0 ? null : approved / totalReviewed,
      latest_signal_at: (row.latest_signal_at as string | null) ?? null,
      latest_signals: Array.isArray(row.latest_signals)
        ? (row.latest_signals as SourcePreviewSignal[])
        : [],
    }
  })
}

import type { SourceFacets } from "./sources-types"

export async function getSourcesFacets(): Promise<SourceFacets> {
  if (!db) {
    return {
      totalActive: 0,
      totalInactive: 0,
      totalArchived: 0,
      totalAll: 0,
      byType: {},
      byGeography: {},
      byLanguage: {},
    }
  }
  const counts = await db.execute(sql`
    SELECT
      count(*)::int AS total_all,
      count(*) FILTER (WHERE active = true AND archived_at IS NULL)::int  AS active_n,
      count(*) FILTER (WHERE active = false AND archived_at IS NULL)::int AS inactive_n,
      count(*) FILTER (WHERE archived_at IS NOT NULL)::int                AS archived_n
    FROM market_trusted_sources
  `)
  const types = await db.execute(sql`
    SELECT source_type AS k, count(*)::int AS n
    FROM market_trusted_sources
    WHERE archived_at IS NULL
    GROUP BY source_type
  `)
  const geos = await db.execute(sql`
    SELECT COALESCE(geography, '') AS k, count(*)::int AS n
    FROM market_trusted_sources
    WHERE archived_at IS NULL AND geography IS NOT NULL AND geography <> ''
    GROUP BY geography
  `)
  const langs = await db.execute(sql`
    SELECT language AS k, count(*)::int AS n
    FROM market_trusted_sources
    WHERE archived_at IS NULL
    GROUP BY language
  `)

  const c = counts.rows[0] as Record<string, number>
  const toMap = (
    rows: Array<{ k?: string; n?: number }> | unknown[],
  ): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const row of rows as Array<{ k?: string; n?: number }>) {
      if (row.k != null && row.k !== "") out[row.k] = Number(row.n ?? 0)
    }
    return out
  }

  return {
    totalAll: Number(c.total_all ?? 0),
    totalActive: Number(c.active_n ?? 0),
    totalInactive: Number(c.inactive_n ?? 0),
    totalArchived: Number(c.archived_n ?? 0),
    byType: toMap(types.rows),
    byGeography: toMap(geos.rows),
    byLanguage: toMap(langs.rows),
  }
}
