/**
 * Episode Preparation Studio — shared types.
 *
 * All AI sections are typed so the generator, DB, and UI share the exact
 * same contract. New sections should be added here first.
 */

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type PreparationToneType =
  | "calm"
  | "deep"
  | "emotional"
  | "controversial"
  | "intellectual"
  | "light"

export type PreparationFocusMode = "guest" | "topic" | "hybrid"

export type PreparationContentFocus =
  | "emotions"
  | "ideas"
  | "stories"
  | "conflict"
  | "practical"
  | "surprises"

export interface PreparationInputs {
  title: string
  guest_name: string | null
  /**
   * Short text the admin typed describing who the person is — used to
   * disambiguate identity before research runs. Required on create.
   */
  guest_description: string | null
  /**
   * Optional URL to a social profile, YouTube channel, or personal site.
   * Used by the candidate search to anchor retrieval on a real identity.
   */
  guest_profile_link: string | null
  short_description: string | null
  episode_goal: string | null
  key_questions: string[]
  tone_type: PreparationToneType | null
  focus_mode: PreparationFocusMode | null
  expected_duration_min: number | null
  depth_level: number // 1–5
  boldness_level: number // 1–5
  content_focus: PreparationContentFocus[]
  meta?: {
    language?: "ar" | "en"
  }
}

// ─── Guest identity disambiguation ──────────────────────────────────────────

/**
 * A candidate person returned by the lightweight identity search. This is
 * what the admin picks from before full research runs. Each candidate is
 * anchored to at least one real source so the admin can verify.
 */
export interface PreparationCandidate {
  /** Stable id for the UI (candidate list is ephemeral, re-fetched each time). */
  id: string
  /** Canonical display name of the person, as the source refers to them. */
  name: string
  /**
   * Short description (role, nationality, field). Enough for the admin to
   * recognize the person without opening the source.
   */
  description: string
  /**
   * Provider that surfaced this candidate. Mirrors PreparationSourceProvider
   * so the UI can show the same badge palette as the research layer.
   */
  source_provider: "gemini_web" | "youtube"
  /** Source URL the candidate was extracted from. */
  source_url: string
  /** Title of the source (page title / video title / channel name). */
  source_title: string
  /**
   * Optional image URL (YouTube thumbnail or og:image if available). Purely
   * a UX aid — never authoritative.
   */
  avatar_url?: string
}

/**
 * Confirmed identity — persisted on the preparation row once the admin picks
 * one candidate and clicks "Yes, this is the correct person". Research is
 * refused unless this object is present.
 */
export interface PreparationGuestIdentity {
  /** Final, confirmed name. Overrides raw `guest_name` for research queries. */
  name: string
  description: string
  source_provider: "gemini_web" | "youtube" | "manual"
  source_url: string | null
  source_title: string | null
  avatar_url?: string | null
  /** Optional profile link the admin typed at step 1. */
  profile_link: string | null
  /** ISO timestamp — when the admin clicked confirm. */
  confirmed_at: string
  /** Admin user id that confirmed it — useful for audit. */
  confirmed_by: string
}

// ─── Status per section ──────────────────────────────────────────────────────

export type PreparationSectionStatus = "idle" | "generating" | "ready" | "error"

export type PreparationSectionKey =
  | "research"
  | "executive_summary"
  | "knowledge_bank"
  | "guest_intelligence"
  | "conversation_axes"
  | "episode_flow"
  | "question_system"
  | "host_instructions"
  | "quotes_references"
  | "viral_moments"

export type PreparationSectionsStatus = Partial<
  Record<PreparationSectionKey, { status: PreparationSectionStatus; error?: string; updated_at?: string }>
>

// ─── Research corpus ─────────────────────────────────────────────────────────

/**
 * Unified source type. One entry per retrieved document after dedupe.
 * `id` is a stable numeric id used in citation arrays on claims.
 */
export type PreparationSourceProvider =
  | "gemini_web" // retrieved via Gemini grounded search (general web)
  | "youtube" // YouTube Data API v3
  | "x" // X / Twitter (placeholder — not yet implemented)

export interface PreparationResearchSource {
  id: number
  provider: PreparationSourceProvider
  title: string
  url: string
  snippet: string
  publisher?: string // domain, channel name, handle
  published_at?: string
  metrics?: {
    view_count?: number
    like_count?: number
  }
}

/** Claim verification status from the verifier pass. */
export type PreparationClaimStatus = "verified" | "weak" | "unverified"

/**
 * A single atomic claim with citations and verification status.
 * This is what the pipeline emits; UI renders claims grouped by category.
 */
export interface PreparationClaim {
  id: string
  claim: string
  category:
    | "key_fact"
    | "controversial_angle"
    | "hidden_insight"
    | "personality_trait"
    | "repeated_opinion"
    | "contradiction"
    | "unique_angle"
    | "public_stance_vs_criticism"
  source_ids: number[]
  status: PreparationClaimStatus
  verifier_note?: string
  /**
   * Unique providers that back this claim, derived from `source_ids`.
   * Populated deterministically by the pipeline post-verification.
   */
  provider_types: PreparationSourceProvider[]
  /**
   * True when the claim is `verified` AND is supported by more than one
   * provider type (e.g. both web and YouTube). Used for ranking and UI
   * confidence badges.
   */
  cross_source_verified: boolean
}

/** Direct quote with attribution. */
export interface PreparationCitedQuote {
  text: string
  attributed_to: string
  context?: string
  source_ids: number[]
}

/** Past interview / appearance. */
export interface PreparationPastInterview {
  title: string
  publisher?: string
  url?: string
  note?: string
  source_ids: number[]
}

/** Per-provider retrieval diagnostics (shown in the UI). */
export interface PreparationRetrievalDiagnostic {
  provider: PreparationSourceProvider
  status: "ok" | "skipped" | "failed" | "unavailable"
  message?: string
  count: number
}

export interface PreparationResearch {
  generated_at: string
  query: string
  queries_used: string[]
  sources: PreparationResearchSource[]
  retrieval: PreparationRetrievalDiagnostic[]

  // Cited, verified knowledge (canonical)
  claims: PreparationClaim[]
  quotes: PreparationCitedQuote[]
  past_interviews: PreparationPastInterview[]

  // Counts for the UI / approval gate
  verified_count: number
  weak_count: number
  unverified_count: number

  notes?: string
}

// ─── AI sections ─────────────────────────────────────────────────────────────

export interface PreparationExecutiveSummary {
  headline: string
  what_its_really_about: string
  stakes: string
  audience_promise: string
}

export interface PreparationKnowledgeBankItem {
  label: string
  detail: string
  why_it_matters: string
}

export interface PreparationKnowledgeBank {
  key_facts: PreparationKnowledgeBankItem[]
  insights: PreparationKnowledgeBankItem[]
  angles: PreparationKnowledgeBankItem[]
  context: PreparationKnowledgeBankItem[]
}

export interface PreparationGuestIntelligence {
  personality_analysis: string
  communication_style: string
  strengths: string[]
  weaknesses: string[]
  sensitive_zones: string[]
  known_triggers: string[]
  rapport_tips: string[]
}

export interface PreparationConversationAxes {
  main_themes: Array<{ title: string; description: string }>
  sub_themes: Array<{ title: string; description: string; parent?: string }>
}

export interface PreparationEpisodeFlowTimelineBlock {
  id: string
  from_min: number
  to_min: number
  label: string
  purpose: string
}

export type PreparationEpisodeFlowPhaseKey =
  | "opening"
  | "trust_building"
  | "deep_exploration"
  | "turning_point"
  | "peak"
  | "resolution"

export interface PreparationEpisodeFlowPhase {
  key: PreparationEpisodeFlowPhaseKey
  label: string
  description: string
  goals: string[]
  approximate_minutes: [number, number]
}

export interface PreparationEpisodeFlow {
  timeline: PreparationEpisodeFlowTimelineBlock[]
  phases: PreparationEpisodeFlowPhase[]
  pacing_notes: string
}

// ─── Question system ────────────────────────────────────────────────────────

export type PreparationQuestionBucket =
  | "opening"
  | "deep"
  | "escalation"
  | "surprise"
  | "backup"
  | "recovery"

/**
 * Real-time support pack attached to every question. Turns the question
 * system from a flat list into a "conversation control system" the host
 * can actually use while recording.
 *
 * Content rules (enforced in the prompt):
 *   - `context` must come from a verified or weak claim in research_data.
 *     Nothing invented.
 *   - Weak sources are allowed but must be surfaced via `weak` flag on the
 *     containing question, so the UI can mark them clearly.
 *   - Every field stays short enough to be usable at a glance while the
 *     host is actively talking.
 */
export interface PreparationQuestionSupport {
  /** 1–2 sentence factual or contextual insight tied to this question. */
  context: string
  /** 2–4 bullets the host can expand on to keep the discussion going. */
  talking_points: string[]
  /** Alternative directions to take if the guest's answer is weak or short. */
  follow_up_angles: string[]
  /** Optional critical/challenging angles for escalation. */
  pressure_points?: string[]
  /** Optional reminders of past statements, events, or contradictions. */
  memory_triggers?: string[]
}

export interface PreparationQuestion {
  id: string
  bucket: PreparationQuestionBucket
  text: string
  intent: string
  follow_ups: string[]
  /**
   * Conversation support pack — context, talking points, fallbacks, etc.
   * Optional for back-compat with pre-upgrade question systems; new generation
   * always populates it.
   */
  support?: PreparationQuestionSupport
  /**
   * True when any of the support content relies on weak (non-cross-verified)
   * claims. Surfaced in the UI so the host knows to treat it with care.
   */
  weak_support?: boolean
}

export interface PreparationQuestionSystemSection {
  section_id: string // maps to a timeline block OR phase key
  section_label: string
  questions: PreparationQuestion[]
}

export interface PreparationQuestionSystem {
  sections: PreparationQuestionSystemSection[]
}

// ─── Host instructions ──────────────────────────────────────────────────────

export interface PreparationHostInstructions {
  stay_calm_when: string[]
  push_when: string[]
  interrupt_when: string[]
  allow_silence_when: string[]
  if_guest_avoids: string[]
  energy_management: string
  overall_directive: string
}

// ─── Quotes & references ────────────────────────────────────────────────────

export interface PreparationQuoteItem {
  quote: string
  attribution: string
  context?: string
  why_it_matters: string
  source?: string
}

export interface PreparationQuotesReferences {
  quotes: PreparationQuoteItem[]
}

// ─── Viral moments prediction ───────────────────────────────────────────────

export interface PreparationViralMoment {
  id: string
  label: string
  type: "clip_worthy" | "controversial" | "emotional_peak" | "quotable"
  expected_timing: string // e.g. "around 35-40 min"
  setup: string
  payoff: string
  why_it_spreads: string
}

export interface PreparationViralMoments {
  moments: PreparationViralMoment[]
}

// ─── Live state ─────────────────────────────────────────────────────────────

export interface PreparationLiveState {
  started_at: string | null
  current_phase: PreparationEpisodeFlowPhaseKey | null
  used_question_ids: string[]
  energy_level: number // 0–5
  notes: string
  updated_at: string
}

// ─── Full record ────────────────────────────────────────────────────────────

/**
 * Workflow state machine:
 *   draft      — created, no research yet
 *   researched — research pipeline ran successfully, claims/sources present
 *   prepared   — all 9 editorial sections are ready
 *   reviewed   — human reviewer signed off on the output
 *   approved   — ready for the live recording panel (live token minted)
 *
 * `draft → researched` and `researched → prepared` are auto-transitions
 * driven by `computeAutoStatus()` after section writes. `reviewed` and
 * `approved` require an explicit admin action via the approve route.
 */
export type PreparationStatus =
  | "draft"
  | "researched"
  | "prepared"
  | "reviewed"
  | "approved"

/** Ordered rank — never transition downward automatically. */
export const PREPARATION_STATUS_RANK: Record<PreparationStatus, number> = {
  draft: 0,
  researched: 1,
  prepared: 2,
  reviewed: 3,
  approved: 4,
}

export interface EpisodePreparation {
  id: string
  title: string
  guest_name: string | null
  guest_description: string | null
  guest_profile_link: string | null
  /**
   * Confirmed identity blob. Present only after the admin has explicitly
   * picked a candidate and answered "yes" to the confirmation gate. Research
   * routes refuse to run when this is null.
   */
  guest_identity: PreparationGuestIdentity | null
  short_description: string | null
  episode_goal: string | null
  key_questions: string[]
  tone_type: PreparationToneType | null
  focus_mode: PreparationFocusMode | null
  expected_duration_min: number | null
  depth_level: number
  boldness_level: number
  content_focus: PreparationContentFocus[]
  inputs_meta: PreparationInputs["meta"] | null

  research_data: PreparationResearch | null
  executive_summary: PreparationExecutiveSummary | null
  knowledge_bank: PreparationKnowledgeBank | null
  guest_intelligence: PreparationGuestIntelligence | null
  conversation_axes: PreparationConversationAxes | null
  episode_flow: PreparationEpisodeFlow | null
  question_system: PreparationQuestionSystem | null
  host_instructions: PreparationHostInstructions | null
  quotes_references: PreparationQuotesReferences | null
  viral_moments: PreparationViralMoments | null

  sections_status: PreparationSectionsStatus

  status: PreparationStatus
  approved_at: string | null

  live_token_hash: string | null
  live_state: PreparationLiveState | null

  linked_episode_id: string | null

  archived_at: string | null
  deleted_at: string | null

  created_by: string
  created_at: string
  updated_at: string
}

// A trimmed public view used by the live control panel (no sensitive fields).
export interface EpisodePreparationLiveView {
  id: string
  title: string
  guest_name: string | null
  tone_type: PreparationToneType | null
  expected_duration_min: number | null
  executive_summary: PreparationExecutiveSummary | null
  episode_flow: PreparationEpisodeFlow | null
  question_system: PreparationQuestionSystem | null
  host_instructions: PreparationHostInstructions | null
  viral_moments: PreparationViralMoments | null
  live_state: PreparationLiveState | null
}
