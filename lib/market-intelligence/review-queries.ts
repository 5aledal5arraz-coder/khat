/**
 * Phase 2 — Market Signals review queue queries.
 *
 * Pure read. Returns shapes for the operator review UI; never the raw
 * drizzle row types so the UI stays decoupled from the schema.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const REVIEW_TABS = [
  "new",
  "strong",
  "weak",
  "rejected",
  "archived",
  "manual",
] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

export interface ReviewQueueCounts {
  new: number
  strong: number
  weak: number
  rejected: number
  archived: number
  manual: number
  total: number
}

export interface ReviewSignal {
  id: string
  title: string
  description: string | null
  source: string
  language: string
  view_signal: number | null
  collected_at: string
  theme: string | null
  emotional_trigger: string | null
  controversy_score: number | null
  review_status: "new" | "approved" | "rejected" | "archived"
  editorial_tags: string[]
  reviewed_by: string | null
  reviewed_at: string | null
  operator_notes: string | null
  operator_created: boolean
  trusted_source_id: string | null
  signal_score: number | null
  score_components: Record<string, number> | null
}

export const PAGE_SIZE = 50

export async function getReviewQueueCounts(): Promise<ReviewQueueCounts> {
  if (!db) {
    return { new: 0, strong: 0, weak: 0, rejected: 0, archived: 0, manual: 0, total: 0 }
  }
  const r = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE review_status = 'new')::int AS new_n,
      count(*) FILTER (WHERE review_status = 'approved')::int AS strong_n,
      count(*) FILTER (WHERE editorial_tags @> '["weak"]'::jsonb)::int AS weak_n,
      count(*) FILTER (WHERE review_status = 'rejected')::int AS rejected_n,
      count(*) FILTER (WHERE review_status = 'archived')::int AS archived_n,
      count(*) FILTER (WHERE operator_created = true)::int AS manual_n,
      count(*)::int AS total_n
    FROM market_topic_signals
  `)
  const row = (r.rows[0] ?? {}) as Record<string, number | string | null>
  return {
    new: numOr0(row.new_n),
    strong: numOr0(row.strong_n),
    weak: numOr0(row.weak_n),
    rejected: numOr0(row.rejected_n),
    archived: numOr0(row.archived_n),
    manual: numOr0(row.manual_n),
    total: numOr0(row.total_n),
  }
}

export async function listSignalsForReview(opts: {
  tab: ReviewTab
  page: number
  pageSize?: number
}): Promise<{ signals: ReviewSignal[]; totalForTab: number }> {
  if (!db) return { signals: [], totalForTab: 0 }
  const pageSize = opts.pageSize ?? PAGE_SIZE
  const offset = Math.max(0, (opts.page - 1) * pageSize)
  const where = tabFilter(opts.tab)

  // We assemble the SQL fragments via drizzle's `sql` template so the
  // WHERE clause stays parameterless (the tab is from a closed vocab).
  const rowsResult = await db.execute(sql`
    SELECT
      id, title, description, source, language, view_signal,
      collected_at::text AS collected_at,
      theme, emotional_trigger, controversy_score,
      review_status,
      COALESCE(editorial_tags, '[]'::jsonb) AS editorial_tags,
      reviewed_by, reviewed_at::text AS reviewed_at,
      operator_notes, operator_created,
      trusted_source_id, signal_score, score_components
    FROM market_topic_signals
    WHERE ${where}
    ORDER BY
      COALESCE(signal_score, 0) DESC,
      collected_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `)

  const countResult = await db.execute(sql`
    SELECT count(*)::int AS n FROM market_topic_signals WHERE ${where}
  `)
  const totalForTab = numOr0(
    (countResult.rows[0] as { n?: number } | undefined)?.n,
  )

  const signals: ReviewSignal[] = (rowsResult.rows as Array<Record<string, unknown>>).map(
    (r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      description: (r.description as string | null) ?? null,
      source: String(r.source ?? ""),
      language: String(r.language ?? "ar"),
      view_signal: r.view_signal === null ? null : Number(r.view_signal),
      collected_at: String(r.collected_at ?? ""),
      theme: (r.theme as string | null) ?? null,
      emotional_trigger: (r.emotional_trigger as string | null) ?? null,
      controversy_score:
        r.controversy_score === null ? null : Number(r.controversy_score),
      review_status: r.review_status as ReviewSignal["review_status"],
      editorial_tags: Array.isArray(r.editorial_tags)
        ? (r.editorial_tags as string[])
        : [],
      reviewed_by: (r.reviewed_by as string | null) ?? null,
      reviewed_at: (r.reviewed_at as string | null) ?? null,
      operator_notes: (r.operator_notes as string | null) ?? null,
      operator_created: r.operator_created === true,
      trusted_source_id: (r.trusted_source_id as string | null) ?? null,
      signal_score:
        r.signal_score === null ? null : Number(r.signal_score),
      score_components:
        r.score_components && typeof r.score_components === "object"
          ? (r.score_components as Record<string, number>)
          : null,
    }),
  )
  return { signals, totalForTab }
}

function tabFilter(tab: ReviewTab) {
  switch (tab) {
    case "new":
      return sql`review_status = 'new'`
    case "strong":
      return sql`review_status = 'approved'`
    case "weak":
      return sql`editorial_tags @> '["weak"]'::jsonb OR editorial_tags @> '["surface_level"]'::jsonb`
    case "rejected":
      return sql`review_status = 'rejected'`
    case "archived":
      return sql`review_status = 'archived'`
    case "manual":
      return sql`operator_created = true`
  }
}

function numOr0(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0
}
