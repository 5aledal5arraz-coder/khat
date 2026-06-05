/**
 * Phase 3 — Trusted Sources types + closed-vocab constants.
 *
 * Lives outside `sources-queries.ts` so client components can import
 * the vocabulary + row shape without pulling `pg` into the browser
 * bundle.
 */

export const SOURCE_FILTER_KEYS = [
  "all",
  "active",
  "inactive",
  "archived",
  "high_trust",
  "high_alignment",
] as const
export type SourceFilterKey = (typeof SOURCE_FILTER_KEYS)[number]

export const SOURCE_SORT_KEYS = [
  "newest",
  "trust_desc",
  "alignment_desc",
  "linked_desc",
] as const
export type SourceSortKey = (typeof SOURCE_SORT_KEYS)[number]

export const HIGH_THRESHOLD = 0.7

export interface SourcePreviewSignal {
  id: string
  title: string
  collected_at: string
  review_status: "new" | "approved" | "rejected" | "archived"
}

export interface SourceRow {
  id: string
  source_type:
    | "youtube"
    | "podcast"
    | "website"
    | "rss"
    | "creator"
    | "journalist"
    | "thinker"
  identifier: string
  display_name: string
  language: string
  geography: string | null
  trust_score: number
  editorial_alignment_score: number
  active: boolean
  archived_at: string | null
  notes: string | null
  created_at: string
  updated_at: string

  // Preview stats
  linked_count: number
  approved_count: number
  rejected_count: number
  archived_signal_count: number
  new_count: number
  mean_signal_score: number | null
  approval_ratio: number | null
  latest_signal_at: string | null
  latest_signals: SourcePreviewSignal[]
}

export interface SourcesQueryOptions {
  filter?: SourceFilterKey
  sort?: SourceSortKey
  type?: string | null
  language?: string | null
  geography?: string | null
  search?: string | null
  includeArchived?: boolean
}

export interface SourceFacets {
  totalActive: number
  totalInactive: number
  totalArchived: number
  totalAll: number
  byType: Record<string, number>
  byGeography: Record<string, number>
  byLanguage: Record<string, number>
}
