/**
 * Khat Map v2 — engine-level types.
 *
 * These cover the full batch / guest-first pipelines end-to-end:
 *   RawCandidate      — what the LLM produces (pre-filter, pre-persist)
 *   ScoredCandidate   — RawCandidate + similarity + taste + domain-balance signals
 *   BatchCard         — the final persisted card the UI renders
 *   BatchResult       — everything one generateBatch() call returns
 *
 * Deliberately distinct from v1 StructuredEpisodeCandidate / StructuredGuestCandidate
 * so v2 can evolve its output shape without disturbing the v1 structurer.
 */

import type {
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
  KhatMapEpisodeType,
  KhatMapTopicDomain,
  KhatMapRiskLevel,
  KhatMapEffortLevel,
  KhatMapSponsorAppeal,
  KhatMapGuestSocialAccounts,
  KhatMapGuestGender,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"
import type { SimilarityVerdict } from "@/lib/khat-map/learning/embeddings"

// ─── LLM-facing shapes ───────────────────────────────────────────────────────

/** One raw topic proposal fresh from the LLM. Not yet filtered or persisted. */
export interface RawCandidate {
  topic: RawTopic
  guest: RawGuest | null
  /** 0-10 editorial score from the LLM. */
  editorial_score: number
  /** Short one-liner the UI uses for the 'Why now' slot. */
  why_now: string
  /** Optional reasoning the LLM produced for domain choice — powers the UI tooltip. */
  domain_reasoning: string | null
}

export interface RawTopic {
  working_title: string
  hook: string
  why_matters: string
  why_now: string
  goal: string
  description: string
  episode_type: KhatMapEpisodeType
  topic_domain: KhatMapTopicDomain
  /** If the topic matches a seeded angle from the bank, copy verbatim. */
  topic_angle_code: string | null
  main_axes: string[]
  suggested_questions: string[]
  risk_level: KhatMapRiskLevel | null
  effort_level: KhatMapEffortLevel | null
  sponsor_appeal: KhatMapSponsorAppeal | null
}

export interface RawGuest {
  full_name: string
  display_name: string | null
  bio: string
  gender: KhatMapGuestGender
  profession: string | null
  why_fit: string
  category: string | null
  country: string | null
  city: string | null
  social_accounts: KhatMapGuestSocialAccounts
  official_website: string | null
  relevance_score: number | null
  depth_score: number | null
  reach_score: number | null
}

// ─── Pipeline stage shapes ───────────────────────────────────────────────────

/**
 * A candidate after the embed + similarity pass. `hard_block` items are
 * already dropped before this stage; cards that reach here are either
 * `ok` or `soft_avoid`.
 */
export interface ScoredCandidate {
  raw: RawCandidate
  embedding: number[]
  similarity_verdict: SimilarityVerdict
  similarity_max: number
  /** Which negative fingerprint (if any) triggered the worst verdict. */
  similarity_trigger_title: string | null
  /** 0-1 how well this candidate matches the admin's taste profile. */
  taste_alignment: number
  /** 0-1 — 1.0 means the season has this domain well-covered already (over-weight). */
  domain_load: number
  /** Final composite used for ranking. */
  final_score: number
}

// ─── Output shapes ───────────────────────────────────────────────────────────

/**
 * Card explainability — three short Arabic blurbs derived deterministically
 * from the same signals the engine used for scoring. They never invoke the
 * LLM (so they cannot hallucinate) and degrade to null when no honest
 * reasoning is available.
 *
 *   • why_suggested      — the editorial reason the engine ranked this card.
 *   • risks              — the most relevant downsides (similarity, low taste,
 *                          domain over-cap, weak performance band).
 *   • expected_outcome   — what the historical performance band implies for
 *                          this domain. Null when the season has < 3 published
 *                          episodes in the domain (no honest signal yet).
 */
export interface CardExplainability {
  why_suggested: string
  risks: string[]
  expected_outcome: string | null
}

/**
 * What the UI renders. Each card carries both the persisted DB rows
 * (real IDs — decisions can reference them) and the presentation
 * signals the batch engine computed.
 */
export interface BatchCard {
  topic_candidate: KhatMapEpisodeCandidate
  guest_candidate: KhatMapGuestCandidate | null
  editorial_score: number
  taste_alignment: number
  similarity_verdict: SimilarityVerdict
  similarity_max: number
  why_now: string
  /**
   * Personalized reasoning. Null when the taste profile is below the
   * confidence threshold — the UI should hide the 'Why this fits YOU'
   * section entirely rather than showing weak reasoning.
   */
  why_fit_you: string | null
  domain_reasoning: string | null
  /** Deterministic Arabic explainers — never null at the top level. */
  explainability: CardExplainability
}

export interface BatchStats {
  /** How many candidates the LLM produced. */
  oversampled: number
  /** Dropped by hard-block similarity filter. */
  hard_blocked: number
  /** Kept but penalized by soft-avoid. */
  soft_avoided: number
  /** Dropped by the editorial-controls filter (banned, disabled, gender/geo). */
  editorial_dropped: number
  /** Dropped by the already-chosen dedup filter (near-dup of a seed / accept). */
  dedup_dropped: number
  /** Final count returned to the caller. */
  final: number
  /** Whether cross-season rejection memory was consulted. */
  cross_season_negatives_included: boolean
  /** ms spent in the LLM call(s). Useful for prefetch tuning. */
  llm_ms: number
  /** ms spent on embedding. */
  embed_ms: number
}

export interface BatchResult {
  season_id: string
  batch_index: number
  cards: BatchCard[]
  stats: BatchStats
  /** Taste profile at time of generation — card personalization derives from this. */
  taste_snapshot: KhatMapUserTasteProfile
}

// ─── Guest-first pipeline ────────────────────────────────────────────────────

/**
 * What the guest-first engine infers from an admin's free-form input.
 * Structured output from a dedicated LLM pass before topic generation.
 */
export interface GuestProfile {
  full_name: string
  display_name: string | null
  inferred_bio: string
  profession: string | null
  gender: KhatMapGuestGender
  country: string | null
  city: string | null
  /** Domains the guest credibly speaks on, ranked by confidence. */
  expertise_domains: KhatMapTopicDomain[]
  /** One-line editorial angle on why Khat should book them. */
  editorial_angle: string
  /**
   * 0-1 confidence in the profile overall. Low values mean "not enough
   * info to propose topics confidently" — the UI can warn.
   */
  confidence: number
  social_accounts: KhatMapGuestSocialAccounts
  official_website: string | null
}

export interface GuestFirstInput {
  season_id: string
  admin_id?: string | null
  batch_index?: number
  guest: {
    full_name: string
    bio?: string | null
    social_accounts?: KhatMapGuestSocialAccounts
    official_website?: string | null
  }
  /** Number of topic angles to produce. Default 3. */
  angle_count?: number
}

export interface GuestFirstResult extends BatchResult {
  /** The fully-analyzed profile — UI can surface it above the cards. */
  guest_profile: GuestProfile
  /** Persisted guest row the cards are anchored to. */
  persisted_guest: KhatMapGuestCandidate
}

// ─── Dependency-injection shape ──────────────────────────────────────────────

/**
 * AI-side operations the engines need. Real implementation wraps OpenAI;
 * tests inject stubs to avoid network calls. Engines must never reach
 * for OpenAI directly — this seam is what makes the pipeline testable.
 */
export interface EngineAI {
  generateCandidates: (input: CandidateGenInput) => Promise<RawCandidate[]>
  analyzeGuest: (input: GuestAnalyzeInput) => Promise<GuestProfile>
  generateGuestAnchoredTopics: (
    input: GuestAnchoredTopicsInput,
  ) => Promise<RawCandidate[]>
  embed: (text: string) => Promise<number[]>
}

export interface CandidateGenInput {
  season_id: string
  target_count: number
  /** Total episodes the admin is aiming for — shapes the must-include ask. */
  season_target: number
  /** Domains already accepted in this season (for diversity in prompt). */
  accepted_domain_counts: Record<KhatMapTopicDomain, number>
  /**
   * Titles already chosen for this season (manual seeds + AI-accepted topics).
   * Shown to the model as "already chosen — do NOT duplicate" and used by the
   * post-LLM dedup filter. Drives Guided mode's hybrid (manual + AI) so the AI
   * never re-proposes a topic the operator already seeded.
   */
  accepted_titles: string[]
  /** What admin has rejected — shown as negatives in the prompt. */
  rejected_titles: string[]
  rejected_reason_categories: string[]
  taste_profile: KhatMapUserTasteProfile
  /** How strict the admin wants the filter — defaults from engine config. */
  invasion_policy: "required" | "optional" | "excluded"
  /**
   * Per-season editorial controls — guest filters, domain weights, identity
   * override, hard-avoid lists. Threaded into the prompt as constraints
   * AND consulted by the post-LLM filter layer.
   */
  editorial_controls: import("@/types/khat-map").KhatMapEditorialControls
  /**
   * Phase A/B wizard gate. `"topics"` = Phase A, prompts must instruct
   * the model to emit `guest: null` on every card (topic-only batch).
   * `"guests"` = legacy Phase B / pre-redesign behaviour where the model
   * may propose a guest alongside each topic. Defaults to `"guests"`
   * for back-compat — callers in the new flow must set `"topics"`
   * explicitly.
   */
  phase?: "topics" | "guests"
  /**
   * Pre-rendered, prompt-ready blocks injected into the system prompt.
   * Used for orchestrator-supplied hints (strict angle bank, required
   * roles) that don't belong on every call.
   */
  extra_system_blocks?: string[]
}

export interface GuestAnalyzeInput {
  full_name: string
  bio: string | null
  social_accounts: KhatMapGuestSocialAccounts
  official_website: string | null
}

export interface GuestAnchoredTopicsInput {
  guest_profile: GuestProfile
  angle_count: number
  rejected_titles: string[]
  taste_profile: KhatMapUserTasteProfile
  /** Per-season editorial controls. */
  editorial_controls: import("@/types/khat-map").KhatMapEditorialControls
}
