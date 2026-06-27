/**
 * Khat Map — editorial intelligence system types.
 *
 * This module is the strategic brain of the platform: season planning,
 * guest recommendation, topic intelligence, and channel-identity memory.
 *
 * All types here are shared between the DB schema, query layer, server
 * actions, and UI. They form the architectural contract — changes here
 * ripple through the whole feature, so keep them stable.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Season lifecycle. `planning` is the default while admin + AI iterate on
 * the proposed season. `active` once at least one episode is moving through
 * production. `completed` when every approved episode has shipped.
 */
export type KhatMapSeasonStatus =
  | "planning"
  | "active"
  | "completed"
  | "archived"

/**
 * Tristate policy controlling whether an Iraqi-invasion episode is forced
 * into the season:
 *   - `required` : validator treats absence as blocking (legacy behavior)
 *   - `optional` : validator treats absence as a warning; structurer may
 *                  propose invasion if a fresh angle is surfaced but is
 *                  not obligated to
 *   - `excluded` : research + structure + validator drop all invasion
 *                  asks; admin explicitly opted out of the theme for this
 *                  season
 *
 * Default for NEW seasons is `optional`. Existing seasons (pre-migration)
 * are grandfathered to `required` so current workflows don't change.
 */
export type KhatMapInvasionPolicy = "required" | "optional" | "excluded"

/**
 * Episode archetype. Every season must contain a balanced mix — see
 * `DIVERSITY_REQUIREMENTS` in the constitution.
 */
export type KhatMapEpisodeType =
  | "intellectual"
  | "social"
  | "psychological"
  | "personal_story"
  | "national"
  | "historical"
  | "economic"
  | "controversial"
  | "inspirational"
  | "mass_audience"
  | "signature_khat"
  | "invasion" // Iraqi invasion — mandatory at least once per season

/**
 * Subject-matter axis, orthogonal to `episode_type` (which captures the
 * editorial role — invasion, signature_khat, controversial, etc).
 *
 * `episode_type` says HOW the episode fits the season's editorial rhythm.
 * `topic_domain` says WHAT it's actually about. The structurer emits both
 * so the validator, scorer, orderer, and dedup layer can balance across
 * subject matter independently of editorial role.
 *
 * Single-select for now. When the product surfaces a "primary domain" UX
 * pattern in the future, this may become `primary_topic_domain` with a
 * sibling `secondary_topic_domains: KhatMapTopicDomain[]` column — the
 * single-string shape here is forward-compatible with that migration.
 *
 * `none` is the escape hatch: if no domain dominates the episode (rare —
 * usually signature_khat or mass_audience episodes), mark it explicitly
 * rather than picking arbitrarily.
 */
export type KhatMapTopicDomain =
  | "philosophy"
  | "psychology"
  | "relationships"
  | "religion"
  | "identity_masculinity"
  | "money_career"
  | "technology_ai"
  | "internet_culture"
  | "crime_mystery"
  | "hidden_history"
  | "power_manipulation"
  | "parenting"
  | "kuwait_gulf"
  | "historical"
  | "social_issues"
  | "modern_society"
  | "emotions_inner_life"
  | "none"

/**
 * 0–3 weight scale for per-domain preference:
 *   0 = off (exclude — generator skips this domain entirely)
 *   1 = low (allow, but down-weight vs. default)
 *   2 = medium (default — treated like an unweighted domain)
 *   3 = high (actively prioritize — more research queries, more structurer
 *             bias, more representation in the season)
 *
 * Stored as an integer in JSONB; the app layer clamps + validates.
 */
export type KhatMapDomainWeight = 0 | 1 | 2 | 3

/**
 * Sparse weight map: domains not present in the object fall back to
 * medium (2) at read time. Callers get a getter helper in constitution.ts
 * (`effectiveDomainWeight`) rather than iterating the raw record.
 */
export type KhatMapTopicDomainWeights = Partial<
  Record<KhatMapTopicDomain, KhatMapDomainWeight>
>

/**
 * Mood presets — curated starting points for `topic_domain_weights`.
 * Selecting a preset seeds the weights with recommended defaults; admin
 * can then override any individual domain. `balanced` is the null-op
 * preset (empty weights).
 */
export type KhatMapMoodPreset =
  | "balanced"
  | "classic_khat"
  | "psychology_heavy"
  | "controversy_heavy"
  | "relationships_heavy"
  | "technology_future"
  | "social_issues"
  | "kuwait_gulf_focus"
  | "philosophy_religion"
  | "mystery_hidden_history"
  | "emotions_inner_life"
  | "business_money"
  | "modern_society"
  | "internet_culture"

export type KhatMapRiskLevel = "safe" | "medium" | "bold" | "highly_sensitive"

export type KhatMapEffortLevel = "easy" | "medium" | "hard" | "requires_special"

export type KhatMapSponsorAppeal = "low" | "medium" | "high"

/**
 * Episode candidate lifecycle. Conversion-terminal states (`converted_*`)
 * are reached once the admin has materialized the candidate into a real
 * preparation record or episode plan.
 */
export type KhatMapEpisodeCandidateStatus =
  | "proposed"
  | "under_review"
  | "approved"
  | "rejected"
  | "postponed"
  | "converted_to_preparation"
  | "converted_to_episode"

export type KhatMapGuestCandidateStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "converted_to_guest_candidate"

/**
 * Freshness scale for topic + angle reuse. The AI is instructed to prefer
 * `fresh` and `lightly_covered`; `recently_used` and `deeply_covered` are
 * allowed only with explicit admin approval.
 */
export type KhatMapFreshness =
  | "fresh"
  | "lightly_covered"
  | "recently_used"
  | "deeply_covered"

/**
 * Topic bank status. `retired` means the topic is no longer eligible for
 * AI suggestion; the admin has decided it's done.
 */
export type KhatMapTopicStatus = "active" | "retired"

/** Pattern-memory categories — what kind of shape the learning layer tracks. */
export type KhatMapPatternType =
  | "topic"
  | "angle"
  | "guest_type"
  | "theme"
  | "invasion_angle"
  | "episode_style"

export type KhatMapPatternSeverity = "soft" | "medium" | "hard"

/**
 * Reason categories for learning. Kept as a controlled vocabulary so the
 * future analytics layer can aggregate without NLP.
 */
export type KhatMapFeedbackReasonCategory =
  | "repeated"
  | "shallow"
  | "weak_guest"
  | "wrong_angle"
  | "off_brand"
  | "timing"
  | "risk_too_high"
  | "low_depth"
  | "low_originality"
  | "other"

export type KhatMapFeedbackAction =
  | "accepted"
  | "rejected"
  | "postponed"
  | "edited"
  | "regenerated"

// ─── Structured JSONB blobs ──────────────────────────────────────────────────

/**
 * Desired counts per episode type for a single season. Used by the season
 * generator to enforce diversity. Missing keys mean "no minimum required".
 */
export type KhatMapEpisodeTypeBalance = Partial<Record<KhatMapEpisodeType, number>>

/**
 * Per-season must-include editorial rules. These are hard constraints the
 * generator cannot silently skip — a season that violates them fails validation.
 */
export interface KhatMapMustIncludeRules {
  /** Iraqi invasion of Kuwait — at least one angle per season. */
  invasion: boolean
  /** At least one personal inspiring story per season. */
  personal_story: boolean
  /** At least one signature-depth Khat episode per season. */
  signature_khat: boolean
  /** At least one national / Kuwait-memory episode (invasion counts). */
  national: boolean
  /** At least one highly emotional episode. */
  emotional: boolean
  /** At least one mass-audience-appeal episode. */
  mass_audience: boolean
  /** At least one bold / controversial episode. */
  bold: boolean
}

/** Public online presence for a proposed guest. */
export interface KhatMapGuestPublicLink {
  platform: string // twitter, instagram, youtube, linkedin, website, tiktok, podcast, other
  url: string
  label?: string
  note?: string
}

/**
 * Structured social-accounts blob. Distinct from `public_links[]` because
 * these are the "canonical" handles the AI is most confident about.
 */
export interface KhatMapGuestSocialAccounts {
  twitter?: string
  instagram?: string
  youtube?: string
  linkedin?: string
  tiktok?: string
  facebook?: string
  snapchat?: string
  website?: string
  other?: Record<string, string>
}

export type KhatMapGuestGender = "male" | "female" | "unknown"

/**
 * A single evidence citation — typically a URL the Gemini research pass
 * returned with an accompanying one-line justification.
 */
export interface KhatMapEvidenceCitation {
  url: string
  title?: string
  quote?: string
  source_type?: "article" | "interview" | "video" | "podcast" | "social" | "academic" | "other"
}

/** Most-successful-episode entry inside the channel fingerprint. */
export interface KhatMapFingerprintEpisodeEntry {
  title: string
  youtube_id?: string
  view_count?: number
  why_successful?: string
}

/** Most-successful-guest entry inside the channel fingerprint. */
export interface KhatMapFingerprintGuestEntry {
  name: string
  episode_title?: string
  view_count?: number
  why_successful?: string
}

/**
 * Full structured DNA of Khat's editorial identity. Produced by the Gemini
 * channel analyzer (see `lib/khat-map/channel-analysis/`) after it distills
 * real episode metadata, enrichments, and audience signals from the DB, and
 * fuses the observations with the hardcoded constitution.
 *
 * Consumer contract (Phase 3 generator):
 *   - `identity_summary` → injected into season-generation system prompt.
 *   - `signature_themes` + `strongest_*_topics` → positive exemplars.
 *   - `overused_themes` + `repeated_themes` + `guest_patterns_overused` →
 *     negative exemplars (avoid repetition).
 *   - `underexplored_themes` + `gaps` + `future_directions` → opportunity
 *     signal for reinvention.
 *   - `fits_identity` / `does_not_fit_identity` → identity boundary.
 *   - `editorial_warnings` → surfaced to the admin at generation time.
 *   - `coverage_notes` → internal data-quality metadata; never shown in
 *     consumer prompts but visible on the fingerprint page for audit.
 *
 * Every list is required in the type so consumers can iterate without
 * guards; the analyzer emits `[]` when it has no confident signal for a
 * given axis (and records the reason in `coverage_notes`).
 */
export interface KhatMapKhatDna {
  /** One-paragraph identity statement — the editorial shape of Khat. */
  identity_summary: string
  /** Emotional signature — tones Khat is known for. */
  emotional_signature: string[]
  /** Themes Khat has genuinely made its own. */
  signature_themes: string[]
  /** Themes/patterns overexposed in past seasons. */
  overused_themes: string[]
  /** Themes Khat has touched repeatedly without adding depth. */
  repeated_themes: string[]
  /** Themes underexplored but on-brand. */
  underexplored_themes: string[]
  /** Guest archetypes that historically work on Khat. */
  guest_archetypes_that_fit: string[]
  /** Guest archetypes that historically fall flat. */
  guest_archetypes_to_avoid: string[]
  /** What the audience demonstrably responds to. */
  viewer_preferences: string[]
  /** Differentiators vs. generic Arabic podcasts. */
  differentiators: string[]

  // ── Phase 2 additions — richer grounded signal ─────────────────────────
  /** Topics where Khat goes deeper than other Arabic podcasts. */
  strongest_historical_topics: string[]
  /** Topics that demonstrably move the audience emotionally. */
  strongest_emotional_topics: string[]
  /** Topics where Khat's intellectual depth stands out. */
  strongest_intellectual_topics: string[]
  /** Topics where Khat captures social-texture insight. */
  strongest_social_topics: string[]
  /** Kuwait-specific angles Khat owns. */
  strongest_kuwait_topics: string[]

  /** Patterns in episode titles that correlate with strong reception. */
  title_patterns: string[]
  /** Episode-length patterns worth noting (e.g. "90+ min ideal for depth"). */
  length_patterns: string[]

  /** What works in guest selection — concrete traits, not generalities. */
  guest_patterns_that_work: string[]
  /** Guest selection patterns that are overused or no longer deliver. */
  guest_patterns_overused: string[]

  /** What clearly belongs to Khat's identity. */
  fits_identity: string[]
  /** What clearly does NOT belong — things the system must refuse. */
  does_not_fit_identity: string[]

  /** Known gaps in the archive. */
  gaps: string[]
  /** Concrete directions the next season should consider. */
  future_directions: string[]

  /** Explicit warnings the admin should see at generation time. */
  editorial_warnings: string[]
  /**
   * Internal data-quality notes from the analyzer — e.g. "only 40% of
   * episodes had hero_summary", "view counts missing for 18 episodes".
   * Stored so future analyses can be compared; NEVER fed to consumer prompts.
   */
  coverage_notes: string[]
}

// ─── Domain records ──────────────────────────────────────────────────────────

/**
 * Two-phase wizard stage. New seasons start at `"topics"` (setup is just
 * the create-season form). Phase A finalizes topics; `lockSeasonTopicsAction`
 * stamps `topics_locked_at` and moves to `"topics_locked"`. Phase B starts
 * when the operator triggers per-episode discovery (`guests_started_at`).
 * `"complete"` is set automatically when every locked episode has an
 * assigned guest. `"setup"` is reserved for legacy/back-compat rows.
 */
export type KhatMapWizardStage =
  | "setup"
  | "topics"
  | "topics_locked"
  | "guests"
  | "complete"

export interface KhatMapSeason {
  id: string
  name: string
  season_number: number | null
  status: KhatMapSeasonStatus
  target_episode_count: number
  /** Selected at v2 setup. Drives strict-mode angle bank and similar knobs. */
  v2_mode: KhatMapV2Mode | null
  /** Episode-count slider value (6–20). Mirrors target_episode_count. */
  v2_episode_target: number | null
  /**
   * Per-season editorial controls (guest filters, domain weights, identity
   * override, hard-avoid lists). Reads NEVER return null — the query layer
   * substitutes `KHAT_EDITORIAL_CONTROLS_DEFAULTS` when the column is missing.
   */
  editorial_controls: KhatMapEditorialControls
  /**
   * Two-phase wizard gating. Read via `resolveSeasonWizardStage()` so legacy
   * seasons (pre-redesign) resolve to a sane default based on their other
   * state — never null in the resolved view.
   */
  wizard_stage: KhatMapWizardStage
  topics_locked_at: string | null
  guests_started_at: string | null
  created_by: string
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * An AI-proposed episode idea. Status moves: proposed → approved → converted.
 */
/** One title option from the headline layer (persisted inside editorial_intel). */
export interface KhatMapTitleOption {
  /** premium | curiosity | controversial | emotional | global | local | youtube | apple */
  kind: string
  label_ar: string
  text: string
}

/**
 * The editorial intelligence captured for a candidate by the editorial engine +
 * Editorial Court. Persisted as one jsonb column. All fields are admin-internal
 * and surfaced on the wizard card. Null on legacy / audience-first / Phase B rows.
 */
export interface KhatMapEditorialIntel {
  /** Knowledge-universe subcategory id + its Arabic label (denormalized for UI). */
  subcategory: string | null
  subcategory_label: string | null
  /** Thinking-lens ids + their Arabic labels (denormalized for UI). */
  lenses: string[]
  lens_labels: string[]
  /** The full title set + the recommended pick. */
  titles: KhatMapTitleOption[]
  recommended_title: string | null
  recommended_kind: string | null
  recommended_reason: string | null
  /** Why this would also land internationally. */
  global_note: string | null
  /** The core tension people argue about. */
  debate_axis: string | null
  /** The single shareable moment / why it spreads. */
  viral_angle: string | null
  /** Self-critique + Editorial Court answers. */
  why_this_topic: string | null
  why_this_title: string | null
  why_succeed: string | null
  why_fail: string | null
  is_overdone: boolean | null
  reference_potential: boolean | null
  clip_potential: boolean | null
  /** A sketch of a guest who could carry it (Phase A — not a real booking). */
  guest_idea: string | null
  /** The 14 success dimensions (0-10), authoritative from the court when present. */
  success_dimensions: Record<string, number> | null
}

export interface KhatMapEpisodeCandidate {
  id: string
  season_id: string
  status: KhatMapEpisodeCandidateStatus
  slot_index: number | null

  // Editorial core
  working_title: string
  hook: string | null
  why_matters: string | null
  why_now: string | null
  goal: string | null
  description: string | null

  // Typing / classification
  episode_type: KhatMapEpisodeType
  /** Subject-matter axis (orthogonal to `episode_type`). */
  topic_domain: KhatMapTopicDomain
  /**
   * Audience-first generator category (15-category taxonomy) — the diversity
   * label. Null on legacy rows + the guest-anchored path. ADMIN-INTERNAL.
   */
  topic_category: string | null
  /**
   * Stable angle code referencing an active row in khat_map_topic_bank.
   * Strict mode requires this; freshness advances when approved + converted.
   */
  topic_angle_code: string | null

  // Guest linkage (candidates inside this season)
  suggested_guest_candidate_id: string | null

  // Structure
  main_axes: string[]
  suggested_questions: string[]
  production_notes: string | null

  // Indicators
  risk_level: KhatMapRiskLevel | null
  effort_level: KhatMapEffortLevel | null
  sponsor_appeal: KhatMapSponsorAppeal | null

  /**
   * Production-readiness fix sprint — persisted batch-engine score
   * (final_score: editorial × taste × domain_balance × similarity).
   * Null on legacy rows + on imports that skip the score; populated
   * for every fresh batch generation going forward.
   */
  composite_score: number | null
  /** Operator-readable rationale (e.g. "editorial 8.4 · taste 0.71 · domain 0.33"). */
  composite_score_rationale: string | null
  /**
   * Audience-first: one-line note on why this resonates in KSA/Kuwait/Iraq/GCC.
   * ADMIN-INTERNAL — surfaced on the wizard card, never on public/published content.
   */
  regional_note: string | null

  // ─── Editorial intelligence engine (the upgrade) ────────────────────────────
  /** Knowledge-universe subcategory id (finer than topic_category). Null on legacy. */
  topic_subcategory: string | null
  /** 0-100 Success Probability from the 14-dimension model. Null on legacy rows. */
  success_score: number | null
  /** Rich editorial intel (titles, lenses, critique, success dims). Null on legacy. */
  editorial_intel: KhatMapEditorialIntel | null

  // Conversion
  converted_preparation_id: string | null
  converted_episode_id: string | null
  converted_at: string | null

  // Feedback snapshot
  rejection_reason: string | null
  postponed_reason: string | null

  /**
   * Khat Brain — back-pointer to the master Episode Intelligence Record.
   * Populated by the bridge on acceptance. Null on legacy candidates.
   */
  eir_id: string | null

  /**
   * Stamped by `editEpisodeAction` when the operator edits a locked-topic
   * episode after Phase B discovery has already produced candidates for
   * it. Surfaces a "re-run discovery" CTA. Cleared on a fresh discovery
   * run for this episode.
   */
  discovery_stale_at: string | null

  created_at: string
  updated_at: string
}

export interface KhatMapGuestCandidate {
  id: string
  season_id: string
  status: KhatMapGuestCandidateStatus

  // Identity
  full_name: string
  display_name: string | null
  bio: string | null
  gender: KhatMapGuestGender
  profession: string | null

  // Fit
  why_fit: string | null
  /**
   * Phase B redesign — per-episode rationale produced by an episode-
   * scoped discovery verifier. Survives the discovery → khat_map bridge
   * so the assigned-guest card can render "لماذا يناسب هذه الحلقة".
   */
  topic_fit_rationale: string | null
  category: string | null
  country: string | null
  city: string | null

  // Discovery surface
  public_links: KhatMapGuestPublicLink[]
  social_accounts: KhatMapGuestSocialAccounts
  /** Official / primary website — rendered separately from social accounts. */
  official_website: string | null
  evidence_summary: string | null
  evidence_citations: KhatMapEvidenceCitation[]

  // Scoring (0–10 scale; written by the v2 batch engine)
  relevance_score: number | null
  depth_score: number | null
  reach_score: number | null
  risk_flags: string[]
  /** Admin-curated editorial quality marker. */
  quality: KhatMapGuestQuality

  // Conversion — links back to the global guest_candidates table
  converted_to_guest_candidate_id: string | null
  converted_at: string | null

  /** Canonical bridge to the global `guests` table (post-migration). */
  linked_guest_id: string | null

  created_at: string
  updated_at: string
}

export interface KhatMapUserFeedback {
  id: string
  season_id: string | null
  target_type: "episode_candidate" | "guest_candidate" | "topic" | "angle"
  target_id: string
  action: KhatMapFeedbackAction
  reason_category: KhatMapFeedbackReasonCategory | null
  reason_text: string | null
  admin_id: string | null
  created_at: string
}

export interface KhatMapRejectedPattern {
  id: string
  pattern_type: KhatMapPatternType
  pattern_text: string
  category: string | null
  severity: KhatMapPatternSeverity
  rejection_count: number
  last_rejected_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface KhatMapAcceptedPattern {
  id: string
  pattern_type: KhatMapPatternType
  pattern_text: string
  category: string | null
  success_count: number
  last_used_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Topic bank entry. For Iraqi-invasion angle memory, `category = "invasion"`
 * and `angle_code` is set — these rows are the source of truth for angle
 * freshness across all seasons.
 */
export interface KhatMapTopicBankEntry {
  id: string
  title: string
  description: string | null
  angle_notes: string | null
  /** Stable angle identifier (e.g. "invasion.prisoners") — nullable for non-angle topics. */
  angle_code: string | null
  episode_type: KhatMapEpisodeType | null
  category: string | null
  tags: string[]
  freshness: KhatMapFreshness
  last_used_season_id: string | null
  last_used_at: string | null
  usage_count: number
  source: "admin_seeded" | "ai_discovered" | "rejected_revisit" | "spin_off"
  importance_score: number | null
  status: KhatMapTopicStatus
  /** Admin-curated editorial quality (orthogonal to lifecycle status). */
  quality: KhatMapTopicQuality
  notes: string | null
  created_at: string
  updated_at: string
}

export interface KhatMapChannelFingerprint {
  id: string
  version: number
  is_current: boolean
  identity_summary: string | null
  khat_dna: KhatMapKhatDna | null
  strongest_emotional_topics: string[]
  most_successful_episodes: KhatMapFingerprintEpisodeEntry[]
  most_successful_guests: KhatMapFingerprintGuestEntry[]
  /** Free-form admin/AI notes. */
  analysis_notes: string | null
  raw_gemini_payload: Record<string, unknown> | null
  model_name: string | null
  generated_by: string | null
  generated_at: string
}

// ─── UI view-models ──────────────────────────────────────────────────────────

/** Overview dashboard — counts + pointers to active surfaces. */
export interface KhatMapOverview {
  seasons: {
    planning: number
    active: number
    completed: number
    archived: number
  }
  active_season: KhatMapSeason | null
  topic_bank: {
    total: number
    fresh: number
    deeply_covered: number
  }
  invasion_angles: {
    total: number
    fresh: number
    recently_used: number
  }
  fingerprint: {
    current_version: number | null
    last_generated_at: string | null
    needs_refresh: boolean
  }
  pending_review: {
    episode_candidates: number
    guest_candidates: number
  }
}

// ─── v2 — Decision journal + learning layer ──────────────────────────────────
//
// These three tables drive the Khat Map v2 wizard. They are NOT wired into
// the v1 planner — PR1 lands them as infrastructure only; PR2 consumes them
// from the batch engine; PR3 renders them in the new UI.
//
//   1. khat_map_season_decisions  — append-only journal of every accept /
//      reject / skip inside a season. `undone_at` invalidates a decision
//      (the 10-second undo window) without deleting its row.
//   2. khat_map_topic_fingerprints — embedded titles + summaries for
//      semantic similarity filtering. Accepted + rejected topics stream in
//      here with an embedding vector (stored as jsonb float[] — pgvector
//      is not assumed available on Managed PostgreSQL; similarity runs in
//      app).
//   3. khat_map_user_taste_profile — per-admin derived preferences
//      recomputed from the decision journal. Scores live in 0–1, start
//      neutral (0.5), and migrate with decisions. `total_decisions`
//      doubles as a confidence weight for the UI.

/**
 * How a decision resolves the candidate pair. `skip` means the admin
 * neither accepted nor rejected — typically the auto-complete flow
 * consumed the card without soliciting a verdict.
 */
/**
 * Which v2 generation mode the admin chose at setup. Stored on the season
 * so the wizard can resume where the admin left off without re-asking.
 */
export type KhatMapV2Mode = "guided" | "strict" | "open_ai" | "manual"

// ─── Editorial Controls (per-season) ────────────────────────────────────────
//
// Restored editorial control surface — admin-supplied knobs that shape both
// generation prompts AND the post-LLM filter layer. Stored as a single JSONB
// column on `khat_map_seasons.editorial_controls` so we never reintroduce a
// preferences table. Defaults are neutral (everything "all" / weight=2 /
// empty lists) so an admin who skips the section gets the same generation
// behavior the system has had since v2 PR3.

/** Guest demographic + nationality filter applied AFTER the LLM produces cards. */
export type KhatMapGuestGenderFilter = "all" | "male" | "female"
/**
 * Binary nationality contract. `"any"` is the neutral default for legacy
 * seasons; the wizard's setup screen rejects `"any"` on new seasons. The
 * filter is strict-on-unknown — candidates with an unverifiable country
 * are dropped when nationality is set to a concrete value.
 */
export type KhatMapGuestNationalityFilter = "kuwaiti" | "non_kuwaiti" | "any"
/**
 * @deprecated Use `KhatMapGuestNationalityFilter` instead. Kept as a type
 * alias only so legacy JSONB rows with `geography` resolve cleanly via
 * `resolveControls()`. The `"gcc"` value maps to `"any"`.
 */
export type KhatMapGuestGeoFilter = "kuwait" | "gcc" | "worldwide"

/**
 * Per-season identity override. Augments — never replaces — the global
 * Khat constitution. Empty arrays / nulls = no override, fall back to
 * the constitution defaults.
 */
export interface KhatMapIdentityOverride {
  /** Extra editorial priorities (Arabic), prepended to the constitution's list. */
  priorities: string[]
  /**
   * Tone-emphasis dial, [0, 1] per axis. `undefined` means "no override
   * for this axis" — generation falls back to the constitution +
   * taste-profile blend. Set explicitly to bias generation per-season.
   */
  tone_emphasis: {
    depth?: number
    controversy?: number
    emotional?: number
  }
  /** Free-form Arabic addendum to the identity statement. Null = none. */
  identity_description: string | null
}

/**
 * Hard-avoid lists. The strings flow into the prompt's "negative memory"
 * block as MUST-NOT-PROPOSE constraints, AND into the post-LLM filter so
 * accidental near-misses are dropped before reaching the admin.
 */
export interface KhatMapHardAvoid {
  banned_topics: string[]
  banned_guests: string[]
  /** Topics the admin specifically wants to avoid repeating from past seasons. */
  repeated_topics_to_avoid: string[]
}

export interface KhatMapEditorialControls {
  guest_filters: {
    gender: KhatMapGuestGenderFilter
    nationality: KhatMapGuestNationalityFilter
  }
  /**
   * Per-domain weights, sparse map. 0 = disabled (hard-blocked from
   * generation), 1 = low, 2 = neutral (default), 3 = high. Missing keys
   * resolve to 2 at read time via `effectiveDomainWeight`.
   */
  domain_weights: Partial<Record<KhatMapTopicDomain, KhatMapDomainWeight>>
  identity_override: KhatMapIdentityOverride
  hard_avoid: KhatMapHardAvoid
}

/** Neutral defaults — applied when a season has no editorial_controls row yet. */
export const KHAT_EDITORIAL_CONTROLS_DEFAULTS: KhatMapEditorialControls = {
  guest_filters: { gender: "all", nationality: "any" },
  domain_weights: {},
  identity_override: {
    priorities: [],
    tone_emphasis: {},
    identity_description: null,
  },
  hard_avoid: {
    banned_topics: [],
    banned_guests: [],
    repeated_topics_to_avoid: [],
  },
}

// ─── Editorial quality (admin-curated, separate from lifecycle status) ──────

/**
 * Editorial quality marker for topic-bank entries — orthogonal to status.
 * Used by the generation engine: `weak` topics are deprioritized,
 * `deprecated` are excluded entirely.
 */
export type KhatMapTopicQuality = "strong" | "normal" | "weak" | "deprecated"

/**
 * Editorial quality marker for guest candidates. `avoid` is a soft
 * blacklist — the admin keeps the row for reference but generation
 * filters them out by default.
 */
export type KhatMapGuestQuality = "strong" | "normal" | "weak" | "avoid"

export type KhatMapDecisionKind = "accept" | "reject" | "skip"

/**
 * What the decision applies to:
 *   - `pair`   → both topic and guest (the common case)
 *   - `topic`  → admin wanted a different topic but is keeping the guest
 *   - `guest`  → admin wanted a different guest but is keeping the topic
 */
export type KhatMapDecisionTarget = "pair" | "topic" | "guest"

export interface KhatMapSeasonDecision {
  id: string
  season_id: string
  /** Soft reference to admin_users.id — nullable for system-originated decisions. */
  admin_id: string | null
  /** 1-indexed batch this decision came from. Lets us reconstruct review pace. */
  batch_index: number
  kind: KhatMapDecisionKind
  target: KhatMapDecisionTarget
  topic_candidate_id: string | null
  guest_candidate_id: string | null
  /** Reuses the v1 vocabulary so analytics can aggregate across eras. */
  reason_category: KhatMapFeedbackReasonCategory | null
  reason_text: string | null
  /**
   * When set, this decision is invalidated (the 10-second undo window).
   * The row is never deleted; downstream consumers filter `undone_at IS NULL`
   * to compute effective state.
   */
  undone_at: string | null
  created_at: string
}

/**
 * Where a fingerprint came from. `imported` is reserved for cross-season
 * memory seeded from another season's accepted/rejected pool — kept
 * distinct so we can weight cross-season signals softer than in-season.
 */
export type KhatMapFingerprintSource =
  | "accepted"
  | "rejected"
  | "skipped"
  | "imported"

export interface KhatMapTopicFingerprint {
  id: string
  season_id: string | null
  source: KhatMapFingerprintSource
  angle_code: string | null
  title_ar: string
  summary_ar: string | null
  domain: KhatMapTopicDomain | null
  /**
   * 1536-dim vector from OpenAI text-embedding-3-small. Stored as jsonb
   * rather than pgvector to avoid an extension dependency on DigitalOcean
   * Managed PostgreSQL. Similarity is computed in Node — fine for the
   * per-season scale (rarely > 100 negatives).
   */
  embedding: number[]
  embedding_model: string
  topic_candidate_id: string | null
  decision_id: string | null
  created_at: string
}

/**
 * One domain preference as derived from the decision journal. Weight is
 * in 0–1 where 0.5 is neutral. Count tracks how many decisions fed into
 * this weight — callers can use it for confidence dims in the UI.
 */
export interface KhatMapTasteDomainWeight {
  domain: KhatMapTopicDomain
  weight: number
  decision_count: number
}

/**
 * One rejected pattern family (e.g. reason_category="shallow") with the
 * count of decisions it has absorbed. This is the aggregate view the UI
 * shows; the raw rejections live on the decision journal.
 */
export interface KhatMapTasteRejectedPattern {
  reason_category: KhatMapFeedbackReasonCategory
  count: number
  last_seen_at: string
}

export interface KhatMapUserTasteProfile {
  user_id: string
  preferred_domains: KhatMapTasteDomainWeight[]
  rejected_patterns: KhatMapTasteRejectedPattern[]
  /** 0 = surface-level only; 1 = deep philosophical. */
  depth_score: number
  /** 0 = avoid all conflict; 1 = seeks bold/controversial. */
  controversy_tolerance: number
  /** 0 = prefers intellectual distance; 1 = prefers emotional resonance. */
  emotional_preference: number
  /** 0 = global-first; 1 = Kuwait/Gulf-first. */
  kuwait_relevance_weight: number
  /** Number of non-undone decisions that fed into this profile. */
  total_decisions: number
  last_recomputed_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Neutral seed used when a user has no decisions yet. The UI should treat
 * any profile with `total_decisions === 0` as "not yet learned" and avoid
 * showing the 'Why this fits YOU' reasoning on cards.
 */
export const KHAT_TASTE_PROFILE_NEUTRAL: Omit<
  KhatMapUserTasteProfile,
  "user_id" | "created_at" | "updated_at" | "last_recomputed_at"
> = {
  preferred_domains: [],
  rejected_patterns: [],
  depth_score: 0.5,
  controversy_tolerance: 0.5,
  emotional_preference: 0.5,
  kuwait_relevance_weight: 0.5,
  total_decisions: 0,
}

// ─── Performance loop (closes Idea → Published Episode → Learning) ──────────
//
// One snapshot row per converted Khat Map candidate, written by the manual
// `syncSeasonPerformanceAction`. `performance_score` is a composite in [0,1]
// computed from whatever signals are available at sync time:
//
//   • `view_count` (the only real engagement metric persisted today)
//   • AI-content density: `quote_count`, `has_enrichment`,
//     `has_chapters`, `has_clips` (proxies for editorial care)
//
// Engagement metrics that DO NOT exist in our DB today (likes / comments /
// retention) are kept as nullable columns so a future YouTube-API ingestion
// worker can fill them without a migration. The composite formula degrades
// gracefully — see `lib/khat-map/scoring/weights.ts` for the math.

export interface KhatMapEpisodePerformance {
  id: string
  candidate_id: string
  episode_id: string | null
  preparation_id: string | null

  // Snapshot from `episodes`
  episode_title: string | null
  youtube_url: string | null
  release_date: string | null
  duration_minutes: number | null
  view_count: number | null

  // Snapshot from AI Studio surfaces
  quote_count: number
  has_enrichment: boolean
  has_chapters: boolean
  has_clips: boolean

  // Optional / future — nullable so a background worker can fill later
  like_count: number | null
  comment_count: number | null
  retention_pct: number | null

  /** Composite [0, 1]. Higher = better. Null when no signals available. */
  performance_score: number | null

  // Mirrored from candidate for fast aggregation queries
  topic_domain: KhatMapTopicDomain | null
  episode_type: KhatMapEpisodeType | null
  topic_angle_code: string | null
  guest_candidate_id: string | null

  synced_at: string
}

/**
 * Aggregated domain performance — one row per `topic_domain` with average
 * performance_score and count. Computed on read (no separate table); used
 * by the batch-engine scoring layer as a multiplier.
 */
export interface KhatMapDomainPerformance {
  domain: KhatMapTopicDomain
  episodes_count: number
  avg_performance: number
  avg_views: number | null
}

// ─── Status label tables (UI consumers) ──────────────────────────────────────

export const KHAT_SEASON_STATUS_LABEL: Record<
  KhatMapSeasonStatus,
  { label: string; bg: string; text: string }
> = {
  planning: { label: "تخطيط", bg: "bg-violet-500/10", text: "text-violet-400" },
  active: { label: "قيد الإنتاج", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  completed: { label: "مكتمل", bg: "bg-sky-500/10", text: "text-sky-400" },
  archived: { label: "مؤرشف", bg: "bg-neutral-500/10", text: "text-neutral-400" },
}

/**
 * Phase 4 — Arabic labels for the season's v2 generation mode. The
 * underlying values (`guided`, `strict`, `open_ai`, `manual`) used to
 * leak through the seasons list as uppercase Latin chips (e.g.
 * "GUIDED") because the renderer wrapped the raw enum with `uppercase`
 * + `dir="ltr"`. Use this map at the render edge to surface an
 * operator-friendly Arabic chip instead.
 */
export const KHAT_MAP_V2_MODE_LABEL: Record<KhatMapV2Mode, string> = {
  guided: "موجَّه",
  strict: "صارم",
  open_ai: "مفتوح",
  manual: "يدوي",
}

export const KHAT_EPISODE_TYPE_LABEL: Record<KhatMapEpisodeType, string> = {
  intellectual: "فكرية",
  social: "اجتماعية",
  psychological: "نفسية",
  personal_story: "قصة شخصية",
  national: "وطنية",
  historical: "تاريخية",
  economic: "اقتصادية",
  controversial: "جريئة",
  inspirational: "ملهمة",
  mass_audience: "جماهيرية",
  signature_khat: "توقيع خط",
  invasion: "الغزو العراقي",
}

/**
 * Arabic labels + tone colors for every topic_domain. Tones are intentional:
 *   - emerald/sky = timeless-leaning domains (philosophy, psychology, relationships, religion)
 *   - violet/indigo = modern / forward-leaning (tech, internet, modern_society)
 *   - amber/rose = tension / darker topics (crime, conspiracy, power)
 *   - neutral = untagged / utility (historical, kuwait_gulf, none)
 */
export const KHAT_TOPIC_DOMAIN_LABEL: Record<
  KhatMapTopicDomain,
  { label: string; bg: string; text: string }
> = {
  philosophy: { label: "فلسفة", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  psychology: { label: "نفسية", bg: "bg-sky-500/10", text: "text-sky-400" },
  relationships: { label: "علاقات", bg: "bg-pink-500/10", text: "text-pink-400" },
  religion: { label: "دين", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  identity_masculinity: {
    label: "هوية / رجولة",
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
  },
  money_career: { label: "مال ومسار", bg: "bg-amber-500/10", text: "text-amber-400" },
  technology_ai: {
    label: "تقنية / ذكاء اصطناعي",
    bg: "bg-violet-500/10",
    text: "text-violet-400",
  },
  internet_culture: {
    label: "ثقافة الإنترنت",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-400",
  },
  crime_mystery: { label: "جريمة / لغز", bg: "bg-rose-500/10", text: "text-rose-400" },
  hidden_history: {
    label: "تاريخ خفي",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
  },
  power_manipulation: {
    label: "سلطة / تلاعب",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
  },
  parenting: { label: "تربية", bg: "bg-teal-500/10", text: "text-teal-400" },
  kuwait_gulf: {
    label: "كويت / خليج",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
  },
  historical: { label: "تاريخ", bg: "bg-stone-500/10", text: "text-stone-300" },
  social_issues: {
    label: "قضايا اجتماعية",
    bg: "bg-cyan-500/10",
    text: "text-cyan-400",
  },
  modern_society: {
    label: "مجتمع حديث",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
  },
  emotions_inner_life: {
    label: "مشاعر داخلية",
    bg: "bg-purple-500/10",
    text: "text-purple-400",
  },
  none: {
    label: "—",
    bg: "bg-muted/40",
    text: "text-muted-foreground",
  },
}

export const KHAT_FRESHNESS_LABEL: Record<
  KhatMapFreshness,
  { label: string; bg: string; text: string }
> = {
  fresh: { label: "جديدة", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  lightly_covered: {
    label: "تناولها خفيف",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
  },
  recently_used: {
    label: "استُخدمت حديثًا",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
  },
  deeply_covered: {
    label: "تُناولت بعمق",
    bg: "bg-neutral-500/10",
    text: "text-neutral-400",
  },
}

