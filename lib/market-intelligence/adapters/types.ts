/**
 * Phase X Step 1 — adapter contract.
 *
 * Each adapter takes a free-text query + language and returns 0..N
 * normalized topic signals. Adapters NEVER scrape; they hit official
 * APIs only and return `configured: false` when env credentials are
 * missing.
 */

export type MarketSource = "youtube" | "podcast_apple"

export interface MarketRawSignal {
  source: MarketSource
  external_id: string
  title: string
  description: string | null
  language: string
  /** Popularity proxy (views, plays). Null when source has no public count. */
  view_signal: number | null
  /** Untrimmed adapter response, persisted as `raw` jsonb. */
  raw: Record<string, unknown>
}

export interface MarketCollectionResult {
  source: MarketSource
  configured: boolean
  /** Reason the adapter returned no/limited results. */
  note?: string
  signals: MarketRawSignal[]
}
