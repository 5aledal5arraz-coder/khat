/**
 * Guest Discovery v2 — types.
 *
 * v2 is "name-first, Wikidata-anchored": an LLM proposes real named
 * people, each is resolved + enriched against authoritative structured
 * sources, then scored on independent real-world signals. This file is
 * the shared vocabulary for that pipeline.
 */

export interface V2Filters {
  gender?: "male" | "female" | null
  nationality?: "kuwaiti" | "non_kuwaiti" | null
  /** ISO-ish country hint, e.g. "Kuwait", "Egypt". Free-form. */
  country?: string | null
}

export interface V2RunInput {
  /** Episode topic / theme the guest should fit. Arabic ok. */
  topic: string
  filters?: V2Filters
  /** "famous" | "balanced" | "hidden_gems" — re-weights notability. */
  taste?: "famous" | "balanced" | "hidden_gems"
  /** How many final candidates to surface. */
  limit?: number
  seasonId?: string | null
  episodeCandidateId?: string | null
}

/** A raw name proposal from the LLM (pre-verification). */
export interface ProposedName {
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  why?: string | null
}

/** Structured facts confirmed by Wikidata/Wikipedia. */
export interface WikiFacts {
  resolved: boolean
  qid?: string | null
  label?: string | null
  label_ar?: string | null
  description?: string | null
  /** human (Q5) confirmed */
  is_human?: boolean
  occupations?: string[]
  gender?: "male" | "female" | "other" | null
  nationality_country?: string | null
  birth_year?: number | null
  death_year?: number | null
  image_url?: string | null
  wikipedia_url?: string | null
  wikipedia_ar_url?: string | null
  official_website?: string | null
  /** count of language editions with an article — a notability proxy */
  sitelink_count?: number
  social?: {
    x?: string | null
    instagram?: string | null
    youtube_channel?: string | null
    linkedin?: string | null
  }
  summary?: string | null
}

export interface EnrichmentSignals {
  /** OpenAlex: scholarly footprint. */
  scholar?: { works: number; cited_by: number; institution?: string | null } | null
  /** YouTube: the person's OWN channel/talks. */
  youtube?: { channel_url?: string | null; channel_title?: string | null; talk_url?: string | null; subscriber_hint?: number | null } | null
  /** Podcast appearances (guestability). */
  podcast?: { appearances: number; latest_url?: string | null; configured: boolean } | null
  /** Recent press (GDELT). */
  news?: { recent_mentions: number; latest_url?: string | null; latest_title?: string | null } | null
  /** Books (Google Books). */
  books?: { count: number; top_title?: string | null } | null
}

export interface V2Scores {
  /** 0..1 each */
  notability: number
  topic_fit: number
  guestability: number
  recency: number
  filter_match: number
  /** weighted overall, 0..1 */
  overall: number
}

export interface V2Candidate {
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  why?: string | null
  wiki: WikiFacts
  signals: EnrichmentSignals
  scores: V2Scores
  decision: "accepted" | "shortlist" | "rejected"
  reasons: string[]
}
