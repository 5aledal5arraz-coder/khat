/**
 * Guest Discovery v2 — types.
 *
 * v2 is "name-first, story-first": an LLM proposes real named people, each
 * is resolved against Wikidata (identity CONFIDENCE, not a gate — most real
 * story guests are not in it), enriched against independent public sources,
 * checked for a first-hand lived story whose quotes are verified verbatim in
 * code, then scored. A grounded story outweighs fame (Khaled, 2026-09-26).
 * This file is the shared vocabulary for that pipeline.
 */

import type { CandidateResearchSource } from "@/types/database"

export interface V2Filters {
  gender?: "male" | "female" | null
  nationality?: "kuwaiti" | "non_kuwaiti" | null
  /** ISO-ish country hint, e.g. "Kuwait", "Egypt". Free-form. */
  country?: string | null
}

/**
 * Where the guests should come from. Default is Kuwait only (Khaled,
 * 2026-09-26); Saudi Arabia and the rest of the Gulf are opt-in. Steers the
 * propose prompt, scopes the Gulf-event hook, and rejects a candidate only
 * when a VERIFIED nationality falls outside it.
 */
export type V2Geography = "kuwait" | "saudi" | "gulf"

export interface V2RunInput {
  /** Episode topic / theme the guest should fit. Arabic ok. */
  topic: string
  filters?: V2Filters
  /** Empty/absent → resolved by `resolveGeography()` (Kuwait by default). */
  geography?: V2Geography[] | null
  /** "famous" | "balanced" | "hidden_gems" — re-weights notability. */
  taste?: "famous" | "balanced" | "hidden_gems"
  /** How many final candidates to surface. */
  limit?: number
  seasonId?: string | null
  episodeCandidateId?: string | null
  /** discovery_runs.id — links ai_runs telemetry back to this run. */
  runId?: string | null
}

/** A raw name proposal from the LLM (pre-verification). */
export interface ProposedName {
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  why?: string | null
  /**
   * The specific experience the model BELIEVES this person lived. A
   * hypothesis written from model memory — it only steers the evidence
   * search and the order candidates are checked in. It never scores.
   */
  story_claim?: string | null
  /**
   * The model's own label for how it knows the person relates to the topic.
   * Like the claim it only orders the story check (`rankForStoryCheck`).
   */
  story_type?: "first_hand" | "second_hand" | "adjacent" | "expert" | null
  /**
   * The model's own statement of the person's gender. NOT evidence — used
   * only to drop a proposal that itself contradicts the run's gender filter
   * before any paid step; verification still reads Wikidata / sources.
   */
  gender?: "male" | "female" | null
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
  /** several humans share this name and the top two scored too close —
   *  downstream scoring caps the candidate at shortlist. */
  identity_uncertain?: boolean
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
  youtube?: {
    channel_url?: string | null
    channel_title?: string | null
    talk_url?: string | null
    /** The talk's own title + description — kept as story evidence text. */
    talk_title?: string | null
    talk_description?: string | null
    subscriber_hint?: number | null
  } | null
  /** Podcast appearances (guestability). `test` = Listen Notes sandbox
   *  (mock data) was used because no real LISTEN_NOTES_API_KEY is set. */
  podcast?: { appearances: number; latest_url?: string | null; configured: boolean; test?: boolean } | null
  /** Recent press (GDELT). */
  news?: { recent_mentions: number; latest_url?: string | null; latest_title?: string | null } | null
  /** Books (Google Books). */
  books?: { count: number; top_title?: string | null } | null
  /**
   * X (Twitter) presence + recent activity — looked up via the EXACT handle
   * Wikidata attaches to the person (P2002), never fuzzy name search. Null
   * when X_BEARER_TOKEN is unset or the person has no handle on Wikidata.
   */
  x?: {
    url: string
    username: string
    followers: number
    verified: boolean
    posting: "active" | "occasional" | "dormant"
    recent_posts: number
    avg_engagement: number
    /** First lines of up to 3 recent posts — what they're talking about now. */
    recent_sample: string[]
    bio?: string | null
  } | null
  /**
   * Instagram presence + recent activity — official Business Discovery
   * lookup of the EXACT username Wikidata attaches to the person (P2003),
   * never fuzzy name search. Null when IG_GRAPH_TOKEN /
   * IG_BUSINESS_ACCOUNT_ID are unset, the person has no handle on
   * Wikidata, or the account is personal-mode (Business Discovery only
   * resolves Business/Creator accounts).
   */
  instagram?: {
    url: string
    username: string
    followers: number
    media_count: number
    posting: "active" | "occasional" | "dormant"
    recent_posts: number
    avg_engagement: number
    /** First lines of up to 3 recent captions — what they're posting about now. */
    recent_sample: string[]
    bio?: string | null
    website?: string | null
  } | null
}

/**
 * Optional live-web verification for ONE advanced candidate — the grounded
 * layer that confirms a Wikidata-resolved person is not just structurally real
 * but *currently active on the open web* (interviews, talks, articles, recent
 * press). Produced by the shared grounded-evidence service (Gemini + Google
 * Search), OUTSIDE the AI router. Attached only to top advanced candidates and
 * only when `DISCOVERY_WEB_GROUNDED_ENABLED=true` — it is an add-on signal,
 * never a gate, so its absence never changes a decision.
 */
export interface GroundedVerification {
  /**
   * Live-web presence, derived deterministically from the attributed sources
   * (no extra AI call): "confirmed" = ≥2 verified live sources, "weak" = ≥1
   * source found, "none" = the search returned nothing usable.
   */
  presence: "confirmed" | "weak" | "none"
  /**
   * Heuristic "active recently" flag — true when a source title/snippet
   * mentions the current or previous calendar year. A signal, not a proof.
   */
  recent_activity: boolean
  /** Total attributed sources returned. */
  source_count: number
  /** How many resolved to a live (non-4xx) page. */
  verified_count: number
  /** Attributed web sources (same trimmed shape the candidate UI already renders). */
  sources: CandidateResearchSource[]
  /** Who produced the evidence (for a provenance stamp in the UI). */
  provider: "gemini"
  model: string
  /** ISO timestamp the check ran. */
  checked_at: string
  /** Set when the search was skipped/failed (budget spent, transient) — fail-safe. */
  note?: string
}

/**
 * The first-hand-story assessment for one candidate. Everything in
 * `evidence` / `gulf_event` passed the code-side guard in story-classify.ts
 * (live source, ≥6-word verbatim span of that source's text, names the
 * person) — the model's own claims never reach here unverified.
 */
export interface StoryAssessment {
  status: "verified" | "unverified" | "not_checked"
  /** Why it was not checked — the run page says so out loud. */
  not_checked_reason?: "cap" | "unavailable" | "error" | null
  story_type: "first_hand" | "second_hand" | "expert_only" | "none"
  summary: string | null
  /** Verified items only. */
  evidence: { url: string; domain: string | null; quote: string }[]
  gulf_event: { event: string; url: string; quote: string } | null
  /** The propose-time hypothesis, shown labelled «فرضية». Never scored. */
  claim_from_propose: string | null
}

/**
 * `gender_unverified` / `nationality_unverified` name the attribute a filter
 * (or the geography scope) could not verify. `filter_unverified` is the
 * pre-split form, kept only so rows stored before the split still render.
 */
export type V2Flag =
  | "identity_unverified"
  | "identity_uncertain"
  | "gender_unverified"
  | "nationality_unverified"
  | "filter_unverified"
  /** claimed first-hand story, checked, no public account (Khaled «أ») */
  | "story_unpublished"
  /** the only verified account is told by relatives / community */
  | "story_second_hand"
  /** unresolved and nothing on the web names them — kept only for a story_unpublished */
  | "no_web_footprint"

/**
 * needs_review for the STORY, not the identity: Khaled reviews these by
 * hand. The run page lists them apart from the verified strong stories and
 * the pipeline ranks the unpublished ones below every verified story.
 */
export const STORY_REVIEW_FLAGS: readonly V2Flag[] = ["story_unpublished", "story_second_hand"]

/**
 * One numbered text source a story check can cite. `text` is what a quote
 * is verified against: the grounded snippet for web sources (text Gemini
 * attributed to the URL — not raw page text), the title+description for a
 * YouTube talk, the headline for a GDELT article.
 */
export interface StorySource {
  kind: "web" | "youtube" | "news"
  title: string
  url: string
  domain: string | null
  text: string
  /** Live (non-4xx) — only verified sources can back a quote. */
  verified: boolean
}

/** Everything the scorer needs from the story step (pure data). */
export interface StoryCheck {
  assessment: StoryAssessment
  /** Every source gathered for this person — feeds searchability + footprint. */
  sources: StorySource[]
  /** Attributes the classifier stated WITH a verified quote; null/false otherwise. */
  attrs: {
    deceased: boolean
    not_individual: boolean
    /** false only when the classifier said the evidence is about someone else */
    same_person: boolean
    gender: "male" | "female" | null
    nationality: string | null
  }
}

export interface V2Scores {
  // All 0..1.
  /** first-hand story — 0 unless backed by verified verbatim evidence */
  story: number
  topic_fit: number
  /** named Gulf event (1) / Gulf place only (0.5) in a verified quote */
  gulf_hook: number
  /** distinct live sources that name the person in a story/topic context */
  searchability: number
  guestability: number
  /** sitelinks/citations/books/website — follower counts deliberately excluded */
  notability: number
  recency: number
  /** 1 unless a verified attribute contradicts a filter (kept for stored rows) */
  filter_match: number
  /** absolute confidence penalty subtracted from the weighted base */
  penalty: number
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
  /**
   * `needs_review` = a verified strong story whose identity or filter
   * attribute could not be confirmed, OR a story Khaled reviews by hand
   * (`STORY_REVIEW_FLAGS`: unpublished first-hand / told by others). Persists as `under_review` like
   * `accepted` (no schema change); the distinction lives in
   * `platform_signals.v2.decision`.
   */
  decision: "accepted" | "needs_review" | "shortlist" | "rejected"
  reasons: string[]
  /** Optional only for rows scored before story-first; the pipeline always sets it. */
  story?: StoryAssessment
  flags?: V2Flag[]
  /**
   * Optional live-web verification — present only for top advanced candidates
   * when grounding is enabled; null/absent otherwise (fail-safe add-on).
   */
  grounded?: GroundedVerification | null
}
