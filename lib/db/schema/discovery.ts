/**
 * Khat Brain Phase 5 — Hidden Guest Discovery schema.
 *
 * Two-table foundation for the discovery pipeline:
 *
 *   discovery_runs              — one row per "find me season-N candidates" trigger
 *   guest_discovery_candidates  — the humans the run surfaces, with evidence
 *
 * The pipeline is jobs-driven:
 *   discovery.seed_archetypes      → fills discovery_runs.archetypes
 *   discovery.search_archetype     → writes guest_discovery_candidates
 *   discovery.verify_candidate     → updates a candidate with AI verification
 *   discovery.rank_candidates      → fills the score columns
 *
 * No FK to `guests` here — promotion creates the guest record and stamps
 * promoted_guest_id. We keep the link soft because the discovery run is
 * episode-of-history that survives even if the guest is later deleted.
 */

import {
  pgTable,
  text,
  jsonb,
  integer,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core"
import { khatMapSeasons, khatMapEpisodeCandidates } from "./khat-map"

export const DISCOVERY_RUN_STATUSES = [
  "pending",
  "seeding",
  "searching",
  "verifying",
  "ranking",
  "completed",
  "failed",
  "cancelled",
] as const
export type DiscoveryRunStatus = (typeof DISCOVERY_RUN_STATUSES)[number]

export const discoveryRuns = pgTable(
  "discovery_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    season_id: text("season_id").references(() => khatMapSeasons.id, {
      onDelete: "set null",
    }),
    /**
     * Phase B redesign — when an operator triggers per-episode discovery
     * from a locked-topic episode, the run is scoped to that episode
     * candidate so the candidate cards can attach back to the right slot
     * and the season-level discovery dashboards can show coverage
     * per episode. Null for legacy/season-wide runs.
     */
    source_episode_candidate_id: text("source_episode_candidate_id").references(
      () => khatMapEpisodeCandidates.id,
      { onDelete: "set null" },
    ),
    status: text("status").$type<DiscoveryRunStatus>().notNull().default("pending"),

    /** Free-form admin prompt that initiated the run (Arabic ok). */
    seed_prompt: text("seed_prompt"),
    /**
     * Generated archetypes for this run — array of human-pattern objects:
     *   { name, description, target_signals, expected_traits }
     */
    archetypes: jsonb("archetypes").$type<DiscoveryArchetype[]>(),
    /**
     * Per-source configuration: which platforms to search, how many
     * candidates per archetype, language hints, etc.
     */
    source_config: jsonb("source_config").$type<DiscoverySourceConfig>(),

    candidate_count: integer("candidate_count").notNull().default(0),

    started_at: timestamp("started_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_by: text("created_by"),

    error_message: text("error_message"),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_discovery_runs_status").on(t.status),
    index("idx_discovery_runs_season").on(t.season_id),
  ],
)

export interface DiscoveryArchetype {
  /** Short slug used as a key (e.g. "quiet_expert", "transformation_story"). */
  id: string
  /** Arabic-readable name shown in the UI. */
  name: string
  /** Editorial description — what kind of human this archetype targets. */
  description: string
  /** Signals to scan for in evidence (Arabic + English keywords ok). */
  target_signals: string[]
  /** Traits the verifier should confirm. */
  expected_traits: string[]
}

export interface DiscoverySourceConfig {
  platforms?: Array<
    | "youtube"
    | "x"
    | "instagram"
    | "tiktok"
    | "podcast"
    | "google_web"
    // ─── Phase Beta sources ────────────────────────────────────
    | "editorial"
    | "public_voice"
    | "network"
  >
  /** Max candidates per archetype the search agents should produce. */
  candidates_per_archetype?: number
  /** Free-form language hints, e.g. ["ar", "en"]. */
  languages?: string[]
  /**
   * Phase B redesign — strict guest filters inherited from the season's
   * `editorial_controls.guest_filters`. When set, the prompt builder
   * injects them into archetype seeds, the search agents append them to
   * queries when useful, and the verifier drops candidates whose
   * inferred attributes contradict them. `"any"` / `"all"` (or
   * omission) means "do not filter on this axis".
   */
  gender?: "male" | "female"
  nationality?: "kuwaiti" | "non_kuwaiti"
  /**
   * Optional pointer to a specific episode candidate. Mirrors
   * `discovery_runs.source_episode_candidate_id`; kept here as well so
   * the search agents can read the topic-anchored query context from
   * one place.
   */
  source_episode_candidate_id?: string | null
  /** Topic title for the episode this run was triggered from (cache to skip a join). */
  source_episode_working_title?: string | null
  /** One-line domain summary for the episode. */
  source_episode_topic_domain?: string | null
  /**
   * Phase Beta — operator-set hiddenness preference. Maps to the
   * weight Alpha's `editorial-fit.ts` gives to `audience_inverse` vs
   * `archetype_resonance`:
   *   famous       → audience_inverse weight cut, recommendation
   *                  trusts content fit over audience size
   *   balanced     → default 0.55/0.25/0.20 weights
   *   hidden_gems  → audience_inverse weight boosted, niche
   *                  candidates surface above popular ones
   * Omitted runs default to "balanced".
   */
  hiddenness_preference?: "famous" | "balanced" | "hidden_gems"
}

// ─── Candidates ───────────────────────────────────────────────────────

export const DISCOVERY_CANDIDATE_STATUSES = [
  "proposed",
  "under_review",
  "promoted",
  "rejected",
  "saved_for_later",
] as const
export type DiscoveryCandidateStatus = (typeof DISCOVERY_CANDIDATE_STATUSES)[number]

export const guestDiscoveryCandidates = pgTable(
  "guest_discovery_candidates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    discovery_run_id: text("discovery_run_id").references(() => discoveryRuns.id, {
      onDelete: "set null",
    }),

    /**
     * Phase B redesign — when the run is episode-scoped, every candidate
     * inherits the target episode candidate id. Cards in the per-episode
     * panel filter by this column instead of joining through the run.
     */
    target_episode_candidate_id: text("target_episode_candidate_id").references(
      () => khatMapEpisodeCandidates.id,
      { onDelete: "set null" },
    ),

    proposed_name: text("proposed_name"),
    proposed_role: text("proposed_role"),
    proposed_country: text("proposed_country"),

    /** The archetype this candidate was found under (joined from the run). */
    archetype: jsonb("archetype").$type<DiscoveryArchetype>(),

    /** [{platform, url, title?, snippet?, fetched_at}] */
    evidence_urls: jsonb("evidence_urls").$type<DiscoveryEvidenceUrl[]>().notNull().default([]),
    /** AI-generated structured notes after verification. */
    evidence_summary: jsonb("evidence_summary").$type<DiscoveryEvidenceSummary>(),

    /** Per-platform aggregated signals (followers count, post freq, etc). */
    platform_signals: jsonb("platform_signals").$type<DiscoveryPlatformSignals>(),
    /** Story signals — themes, life events, transformations the AI inferred. */
    story_signals: jsonb("story_signals").$type<DiscoveryStorySignals>(),

    /**
     * Phase B redesign — Arabic per-candidate rationale. Two fields so
     * the card can surface (a) the general "why this person matters"
     * argument and (b) a topic-anchored "why they fit THIS episode"
     * argument. `evidence_summary.why_they_matter` is kept as a
     * verifier-internal snapshot; UI prefers these dedicated strings.
     */
    general_rationale: text("general_rationale"),
    topic_fit_rationale: text("topic_fit_rationale"),
    /**
     * Phase B redesign — structured social links the UI renders as
     * clickable platform buttons. Built from the candidate's
     * `evidence_urls` by the verifier, restricted to canonical profile
     * pages (handles, channels, official site). Mixed search hits stay
     * in `evidence_urls` as the audit trail.
     */
    social_links: jsonb("social_links").$type<DiscoverySocialLinks>(),

    editorial_fit_score: numeric("editorial_fit_score"),
    hiddenness_score: numeric("hiddenness_score"),
    novelty_score: numeric("novelty_score"),
    evidence_strength_score: numeric("evidence_strength_score"),
    /**
     * Phase B redesign — "how well this person matches THIS episode
     * topic". Computed at verify time when the run is episode-scoped;
     * null on legacy / season-wide runs. Ranker uses it as a tie-break
     * boost.
     */
    topic_fit_score: numeric("topic_fit_score"),
    composite_score: numeric("composite_score"),

    /**
     * ─── Phase Alpha — Guest Discovery Excellence ────────────────────
     *
     * These columns are populated only when the run was processed by
     * the Alpha pipeline (KHAT_GUEST_DISCOVERY_V2=1). Legacy rows leave
     * them null. The UI gates richer rendering on `pipeline_version`.
     *
     * pipeline_version       — "alpha" | null (null = legacy)
     * display_name           — cleaned, operator-facing label
     * full_name_normalized   — canonical form for dedup / lookup
     * person_class_signals   — { signal_id: { score, evidence[] } }
     * identity_confidence    — composite 0..1; gate threshold 0.85
     * attribute_confidences  — { nationality: {value, conf, evidence}, gender: {value, conf, evidence} }
     * evidence_bundle        — curated 3..5 cited sources with notes
     * hidden_gem_score       — separate axis from hiddenness (taste-driven)
     * recommendation_score   — final 0..1 the operator sees
     * dropped_reason         — when Alpha drops a row before promotion
     */
    pipeline_version: text("pipeline_version"),
    display_name: text("display_name"),
    full_name_normalized: text("full_name_normalized"),
    person_class_signals: jsonb("person_class_signals"),
    identity_confidence: numeric("identity_confidence"),
    attribute_confidences: jsonb("attribute_confidences"),
    evidence_bundle: jsonb("evidence_bundle"),
    hidden_gem_score: numeric("hidden_gem_score"),
    recommendation_score: numeric("recommendation_score"),
    dropped_reason: text("dropped_reason"),

    status: text("status")
      .$type<DiscoveryCandidateStatus>()
      .notNull()
      .default("proposed"),

    /** Soft pointer to guests.id once admin promotes — null until then. */
    promoted_guest_id: text("promoted_guest_id"),
    rejection_reason: text("rejection_reason"),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_disc_cand_run").on(t.discovery_run_id),
    index("idx_disc_cand_status").on(t.status),
    index("idx_disc_cand_composite").on(t.composite_score),
    index("idx_disc_cand_target_episode").on(t.target_episode_candidate_id),
  ],
)

/**
 * Phase B redesign — structured social profile URLs. Each key is the
 * canonical profile page on that platform (e.g. `youtube_channel =
 * "https://www.youtube.com/@khatpodcast"`). Mixed search hits stay in
 * `evidence_urls` as the audit trail; this jsonb is the curated set
 * the candidate card renders as clickable platform buttons.
 */
export interface DiscoverySocialLinks {
  youtube_channel?: string
  twitter?: string
  instagram?: string
  linkedin?: string
  tiktok?: string
  facebook?: string
  snapchat?: string
  website?: string
}

export interface DiscoveryEvidenceUrl {
  platform: string
  url: string
  title?: string | null
  snippet?: string | null
  fetched_at?: string
}

export interface DiscoveryEvidenceSummary {
  why_they_matter?: string
  topics?: string[]
  risks?: string[]
  notable_quotes?: string[]
  red_flags?: string[]
}

export interface DiscoveryPlatformSignals {
  youtube?: { subscribers?: number | null; videos?: number | null; engagement?: number | null }
  x?: { followers?: number | null; following?: number | null; posts?: number | null }
  instagram?: { followers?: number | null; posts?: number | null }
  tiktok?: { followers?: number | null }
  podcast?: { episodes?: number | null }
  /** When a platform isn't configured, the agent stamps `not_configured: true`. */
  [key: string]: unknown
}

export interface DiscoveryStorySignals {
  /** Personal arc themes the AI inferred from evidence. */
  arcs?: string[]
  /** Topics they speak openly about (loss, money, identity, success, …). */
  topics?: string[]
  /** Concrete life events / transformations referenced in evidence. */
  events?: string[]
}

// ─── Phase Alpha — typed shapes for new jsonb columns ────────────────

/**
 * Phase Alpha — the six person-class signals the classifier reports.
 *
 * Each signal is independent. A row passes person-class gating only
 * when the weighted composite of these scores ≥ 0.85.
 *
 *  personal_content     — does any evidence include first-person speech?
 *  interview_recipient  — is the person interviewed (vs the channel/show)?
 *  bio_page             — is there a canonical bio / about page?
 *  has_photo            — is a human face referenced (not channel art)?
 *  birth_or_age         — does evidence reference an age / birth year?
 *  name_agreement       — do ≥2 independent sources agree on the name?
 */
export type AlphaPersonClassSignalId =
  | "personal_content"
  | "interview_recipient"
  | "bio_page"
  | "has_photo"
  | "birth_or_age"
  | "name_agreement"

export interface AlphaPersonClassSignal {
  score: number
  evidence: string[]
}

export interface AlphaPersonClassReport {
  signals: Record<AlphaPersonClassSignalId, AlphaPersonClassSignal>
  composite: number
  /** Which signals contributed positively (score > 0). */
  positive_count: number
  /** Engine version stamp so we can rerun comparisons later. */
  classifier_version: string
}

/**
 * Phase Alpha — attribute triangulation. Each attribute carries its
 * own confidence + the corroborating evidence trail. Threshold for
 * promotion is 0.80; below that, candidates are flagged uncertain.
 */
export interface AlphaAttributeConfidence<V extends string = string> {
  value: V | null
  confidence: number
  evidence: string[]
  /** Which sub-signals fired (name_morphology / bio / location / pronouns / photo). */
  signal_breakdown: Record<string, number>
}

export interface AlphaAttributeConfidences {
  nationality: AlphaAttributeConfidence<"kuwaiti" | "non_kuwaiti">
  gender: AlphaAttributeConfidence<"male" | "female">
}

/**
 * Phase Alpha — curated evidence bundle the candidate card renders.
 * Limited to 3..5 citations chosen by source-diversity + relevance,
 * each carrying a short Arabic note explaining what it supports.
 */
export interface AlphaEvidenceCitation {
  platform: string
  url: string
  title?: string | null
  /** Operator-facing Arabic note: what this URL proves. */
  supports: string
  /** Which axis this citation reinforces (identity / fit / attribute). */
  axis: "identity" | "fit" | "attribute" | "context"
}

export interface AlphaEvidenceBundle {
  citations: AlphaEvidenceCitation[]
  /** Distinct platform count — used for diversity bonus. */
  platform_diversity: number
}
