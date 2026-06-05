/**
 * Khat Brain Phase 6 — Guest identity unification.
 *
 *   guest_identity_profiles  — one row per canonical guest, accumulates
 *                              intelligence from every signal source
 *                              (discovery, applications, studio, prep).
 *   guest_discovery_links    — junction: which discovery candidate(s)
 *                              resolved into which guest.
 *
 * Guest identity profile is FULL-replace JSONB on each section so the
 * canonical service can patch one section (e.g. discovery_evidence)
 * without touching the others.
 */

import { pgTable, text, jsonb, timestamp, real, uniqueIndex, index } from "drizzle-orm/pg-core"
import { guests, guestApplications } from "./guests"
import { guestDiscoveryCandidates } from "./discovery"
import { guestCandidates } from "./guest-candidates"

// ─── guest_identity_profiles ──────────────────────────────────────────

export const guestIdentityProfiles = pgTable(
  "guest_identity_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    guest_id: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),

    /** Where each section's signal came from (sources + last_seen). */
    source_summary: jsonb("source_summary").$type<GuestSourceSummary>(),
    /** Snapshots from discovery — evidence URLs, archetypes, fit scores. */
    discovery_evidence: jsonb("discovery_evidence").$type<GuestDiscoveryEvidence>(),
    /** Public application form data (consolidated). */
    application_summary: jsonb("application_summary").$type<GuestApplicationSummary>(),
    /** Studio guest_intelligence outputs. */
    studio_signals: jsonb("studio_signals").$type<GuestStudioSignals>(),
    /** Preparation research notes. */
    preparation_signals: jsonb("preparation_signals").$type<GuestPreparationSignals>(),
    /** Canonical social account map (handle per platform). */
    social_accounts: jsonb("social_accounts").$type<GuestSocialAccounts>(),
    /** Editorial speaking-style profile. */
    speaking_style: jsonb("speaking_style").$type<GuestSpeakingStyle>(),
    /** Story arcs / transformations / topics they speak about. */
    story_arcs: jsonb("story_arcs").$type<GuestStoryArcs>(),
    /** Risk markers + sensitivities. */
    risk_map: jsonb("risk_map").$type<GuestRiskMap>(),
    /** Suggested editorial angles for an episode with this guest. */
    suggested_angles: jsonb("suggested_angles").$type<string[]>(),
    /** Open-ended questions the host could ask. */
    extraction_questions: jsonb("extraction_questions").$type<string[]>(),
    /** Per-axis fit scores (depth, controversy, kuwait, …). */
    fit_scores: jsonb("fit_scores").$type<GuestFitScores>(),

    last_analyzed_at: timestamp("last_analyzed_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_guest_identity_profile_guest").on(t.guest_id)],
)

// ─── guest_discovery_links ────────────────────────────────────────────

export const guestDiscoveryLinks = pgTable(
  "guest_discovery_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    guest_id: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    discovery_candidate_id: text("discovery_candidate_id").references(
      () => guestDiscoveryCandidates.id,
      { onDelete: "set null" },
    ),
    discovery_run_id: text("discovery_run_id"),
    /** "promoted" | "manual_link" | "backfill" | … */
    link_type: text("link_type").notNull().default("promoted"),
    confidence_score: real("confidence_score"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_gdl_guest").on(t.guest_id),
    index("idx_gdl_candidate").on(t.discovery_candidate_id),
  ],
)

// ─── guest_candidate_links (P2.4.a) ───────────────────────────────────
//
// Junction binding `guest_candidates` rows to their canonical `guests.id`.
// One candidate resolves to exactly one canonical guest (UNIQUE on
// candidate_id). One canonical guest may have multiple candidate rows
// linked to it across its lifecycle (re-discovered, re-applied, etc.).
//
// `link_type`: "promoted" (admin promoted the candidate) | "manual_link"
// (admin clicked "this is the same person") | "backfill" (one-time
// reconciliation script wrote it).
//
// `confidence`: "high" | "medium" | "low" — frozen vocabulary from
// `lib/guests/canonical.ts`. Enforced by the backfill script in
// P2.4.b; documentary at the schema layer.

export const guestCandidateLinks = pgTable(
  "guest_candidate_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    guest_id: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => guestCandidates.id, { onDelete: "cascade" }),
    /** "promoted" | "manual_link" | "backfill" */
    link_type: text("link_type").notNull().default("promoted"),
    /** "high" | "medium" | "low" — frozen vocab from lib/guests/canonical.ts */
    confidence: text("confidence").notNull(),
    linked_at: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    linked_by: text("linked_by"),
  },
  (t) => [
    uniqueIndex("uq_gcl_candidate").on(t.candidate_id),
    index("idx_gcl_guest").on(t.guest_id),
  ],
)

// ─── guest_application_links (P2.4.a) ─────────────────────────────────
//
// Junction binding `guest_applications` (public-form submissions) to
// their canonical `guests.id`. One application resolves to exactly one
// canonical guest (UNIQUE on application_id).
//
// `link_type`: "accepted" (admin accepted the application and a guest
// was ensured) | "rejected_but_recorded" (the person was rejected but
// later appeared via another surface and got linked retroactively) |
// "manual_link" (admin clicked "this is the same person").

export const guestApplicationLinks = pgTable(
  "guest_application_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    guest_id: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    application_id: text("application_id")
      .notNull()
      .references(() => guestApplications.id, { onDelete: "cascade" }),
    /** "accepted" | "rejected_but_recorded" | "manual_link" */
    link_type: text("link_type").notNull().default("accepted"),
    linked_at: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    linked_by: text("linked_by"),
  },
  (t) => [
    uniqueIndex("uq_gal_application").on(t.application_id),
    index("idx_gal_guest").on(t.guest_id),
  ],
)

// NOTE: The FK constraint
//   guest_discovery_candidates.promoted_guest_id → guests.id (ON DELETE SET NULL)
// is added by `scripts/migrate-phase2-4-guest-identity.ts` in raw SQL.
// Not modeled in the Drizzle schema (line ~156 of discovery.ts keeps
// `text("promoted_guest_id")`) so `drizzle-kit push` doesn't fight the
// migration. Same pattern as P2.1.d's trigger placement.

// ─── Domain shapes ────────────────────────────────────────────────────

export interface GuestSourceSummary {
  /** Per-source last-seen timestamp + count. */
  discovery?: { runs: number; last_seen: string }
  application?: { id: string | null; received_at: string | null }
  /**
   * P2.4.b — admin-vetted candidates linked via `guest_candidate_links`.
   * Additive optional section. Populated by Pass 3 of the backfill.
   */
  candidates?: { count: number; last_seen: string | null }
  studio?: { sessions: number; last_seen: string | null }
  preparation?: { records: number; last_seen: string | null }
  manual?: { last_seen: string | null }
}

export interface GuestDiscoveryEvidence {
  /** Aggregated evidence URLs across all promotions. */
  urls?: Array<{ platform: string; url: string; title?: string | null; snippet?: string | null }>
  /** Composite + per-axis scores from the strongest discovery match. */
  best_scores?: {
    composite?: number | null
    editorial_fit?: number | null
    hiddenness?: number | null
    novelty?: number | null
    evidence_strength?: number | null
  }
  /** Archetype the candidate matched (when discovery surfaced them). */
  matched_archetype?: { id: string; name: string } | null
}

export interface GuestApplicationSummary {
  application_id?: string | null
  story_idea?: string | null
  beyond_job_title?: string | null
  life_changing_moment?: string | null
  why_khat?: string | null
  topics_to_avoid?: string | null
}

export interface GuestStudioSignals {
  detected_bio?: string | null
  speaking_style?: string | null
  key_positions?: string[]
  notable_quotes?: Array<{ text: string; context?: string }>
}

export interface GuestPreparationSignals {
  /** Most recent preparation summary (if any). */
  recent_preparation_id?: string | null
  research_summary?: string | null
}

export interface GuestSocialAccounts {
  twitter?: string
  instagram?: string
  youtube?: string
  linkedin?: string
  tiktok?: string
  facebook?: string
  website?: string
  podcast?: string
  other?: Record<string, string>
}

export interface GuestSpeakingStyle {
  tone?: string
  pace?: string
  honesty_level?: number
  notes?: string
}

export interface GuestStoryArcs {
  arcs?: string[]
  topics?: string[]
  events?: string[]
  emotional_peaks?: string[]
}

export interface GuestRiskMap {
  red_flags?: string[]
  sensitive_topics?: string[]
  reputation_risks?: string[]
}

export interface GuestFitScores {
  depth?: number
  controversy?: number
  emotional?: number
  kuwait_relevance?: number
  composite?: number
}
