/**
 * Khat Map — query layer (v2-only).
 *
 * Single boundary between Drizzle and the rest of the system. Every
 * mutation and read for Khat Map flows through here. Public exports are
 * the minimal set the v2 wizard, conversion library, and UI pages
 * actually call.
 *
 * Mappers normalize Date → ISO so consumers never see a Date instance.
 */

import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
  khatMapUserFeedback,
  khatMapRejectedPatterns,
  khatMapAcceptedPatterns,
  khatMapTopicBank,
  khatMapChannelFingerprint,
} from "@/lib/db/schema/khat-map"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type {
  KhatMapSeason,
  KhatMapSeasonStatus,
  KhatMapEpisodeCandidate,
  KhatMapEpisodeCandidateStatus,
  KhatMapEpisodeType,
  KhatMapTopicDomain,
  KhatMapGuestCandidate,
  KhatMapGuestCandidateStatus,
  KhatMapGuestQuality,
  KhatMapUserFeedback,
  KhatMapRejectedPattern,
  KhatMapAcceptedPattern,
  KhatMapTopicBankEntry,
  KhatMapTopicQuality,
  KhatMapChannelFingerprint,
  KhatMapOverview,
  KhatMapEditorialControls,
} from "@/types/khat-map"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : v
}
function toIsoReq(v: Date | string | null | undefined): string {
  return toIso(v) ?? new Date().toISOString()
}

type SeasonRow = typeof khatMapSeasons.$inferSelect
type EpisodeCandidateRow = typeof khatMapEpisodeCandidates.$inferSelect
type GuestCandidateRow = typeof khatMapGuestCandidates.$inferSelect
type FeedbackRow = typeof khatMapUserFeedback.$inferSelect
type RejectedPatternRow = typeof khatMapRejectedPatterns.$inferSelect
type AcceptedPatternRow = typeof khatMapAcceptedPatterns.$inferSelect
type TopicBankRow = typeof khatMapTopicBank.$inferSelect
type FingerprintRow = typeof khatMapChannelFingerprint.$inferSelect

// ─── Mappers ─────────────────────────────────────────────────────────────────

/**
 * Resolve raw `editorial_controls` JSONB to a fully-populated object with
 * defaults filled in for any missing keys. Old seasons predating this
 * column return the neutral defaults; new seasons return whatever the
 * setup screen wrote, with each sub-block defensively merged so a half-
 * written column never crashes generation downstream.
 */
function resolveControls(raw: unknown): KhatMapEditorialControls {
  const fallback = KHAT_EDITORIAL_CONTROLS_DEFAULTS
  if (!raw || typeof raw !== "object") return fallback
  const c = raw as Partial<KhatMapEditorialControls> & {
    guest_filters?: { geography?: string }
  }
  // Legacy seasons stored `guest_filters.geography` (kuwait/gcc/worldwide).
  // Translate on read so the rest of the codebase only ever sees the new
  // binary `nationality` contract.
  const legacyGeo = c.guest_filters?.geography
  const inferredNationality: KhatMapEditorialControls["guest_filters"]["nationality"] =
    legacyGeo === "kuwait"
      ? "kuwaiti"
      : legacyGeo === "gcc" || legacyGeo === "worldwide"
        ? "any"
        : fallback.guest_filters.nationality
  return {
    guest_filters: {
      gender: c.guest_filters?.gender ?? fallback.guest_filters.gender,
      nationality:
        c.guest_filters?.nationality ?? inferredNationality,
    },
    domain_weights: c.domain_weights ?? {},
    identity_override: {
      priorities: c.identity_override?.priorities ?? [],
      tone_emphasis: c.identity_override?.tone_emphasis ?? {},
      identity_description:
        c.identity_override?.identity_description ?? null,
    },
    hard_avoid: {
      banned_topics: c.hard_avoid?.banned_topics ?? [],
      banned_guests: c.hard_avoid?.banned_guests ?? [],
      repeated_topics_to_avoid:
        c.hard_avoid?.repeated_topics_to_avoid ?? [],
    },
  }
}

function mapSeason(row: SeasonRow): KhatMapSeason {
  return {
    id: row.id,
    name: row.name,
    season_number: row.season_number,
    status: row.status,
    target_episode_count: row.target_episode_count,
    v2_mode: row.v2_mode ?? null,
    v2_episode_target: row.v2_episode_target ?? null,
    editorial_controls: resolveControls(row.editorial_controls),
    // Legacy rows predating Phase A/B redesign return whatever Postgres
    // applied as the column default (`"topics"`); only treat undefined
    // as a true "missing" case worth defaulting in code.
    wizard_stage: row.wizard_stage ?? "topics",
    topics_locked_at: toIso(row.topics_locked_at),
    guests_started_at: toIso(row.guests_started_at),
    created_by: row.created_by,
    archived_at: toIso(row.archived_at),
    deleted_at: toIso(row.deleted_at),
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  }
}

function mapEpisodeCandidate(row: EpisodeCandidateRow): KhatMapEpisodeCandidate {
  return {
    id: row.id,
    season_id: row.season_id,
    status: row.status,
    slot_index: row.slot_index,
    working_title: row.working_title,
    hook: row.hook,
    why_matters: row.why_matters,
    why_now: row.why_now,
    goal: row.goal,
    description: row.description,
    episode_type: row.episode_type,
    topic_domain: row.topic_domain ?? "none",
    topic_category: row.topic_category ?? null,
    topic_angle_code: row.topic_angle_code ?? null,
    suggested_guest_candidate_id: row.suggested_guest_candidate_id,
    main_axes: row.main_axes ?? [],
    suggested_questions: row.suggested_questions ?? [],
    production_notes: row.production_notes,
    risk_level: row.risk_level,
    effort_level: row.effort_level,
    sponsor_appeal: row.sponsor_appeal,
    composite_score:
      row.composite_score === null || row.composite_score === undefined
        ? null
        : Number(row.composite_score),
    composite_score_rationale: row.composite_score_rationale ?? null,
    regional_note: row.regional_note ?? null,
    converted_preparation_id: row.converted_preparation_id,
    converted_episode_id: row.converted_episode_id,
    converted_at: toIso(row.converted_at),
    rejection_reason: row.rejection_reason,
    postponed_reason: row.postponed_reason,
    eir_id: row.eir_id,
    discovery_stale_at: toIso(row.discovery_stale_at),
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  }
}

function mapGuestCandidate(row: GuestCandidateRow): KhatMapGuestCandidate {
  return {
    id: row.id,
    season_id: row.season_id,
    status: row.status,
    full_name: row.full_name,
    display_name: row.display_name,
    bio: row.bio,
    gender: row.gender ?? "unknown",
    profession: row.profession,
    why_fit: row.why_fit,
    topic_fit_rationale: row.topic_fit_rationale ?? null,
    category: row.category,
    country: row.country,
    city: row.city,
    public_links: row.public_links ?? [],
    social_accounts: row.social_accounts ?? {},
    official_website: row.official_website,
    evidence_summary: row.evidence_summary,
    evidence_citations: row.evidence_citations ?? [],
    relevance_score: row.relevance_score,
    depth_score: row.depth_score,
    reach_score: row.reach_score,
    risk_flags: row.risk_flags ?? [],
    quality: row.quality ?? "normal",
    converted_to_guest_candidate_id: row.converted_to_guest_candidate_id,
    converted_at: toIso(row.converted_at),
    linked_guest_id: row.linked_guest_id,
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  }
}

function mapFeedback(row: FeedbackRow): KhatMapUserFeedback {
  return {
    id: row.id,
    season_id: row.season_id,
    target_type: row.target_type,
    target_id: row.target_id,
    action: row.action,
    reason_category: row.reason_category,
    reason_text: row.reason_text,
    admin_id: row.admin_id,
    created_at: toIsoReq(row.created_at),
  }
}

function mapRejectedPattern(row: RejectedPatternRow): KhatMapRejectedPattern {
  return {
    id: row.id,
    pattern_type: row.pattern_type,
    pattern_text: row.pattern_text,
    category: row.category,
    severity: row.severity,
    rejection_count: row.rejection_count,
    last_rejected_at: toIso(row.last_rejected_at),
    notes: row.notes,
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  }
}

function mapAcceptedPattern(row: AcceptedPatternRow): KhatMapAcceptedPattern {
  return {
    id: row.id,
    pattern_type: row.pattern_type,
    pattern_text: row.pattern_text,
    category: row.category,
    success_count: row.success_count,
    last_used_at: toIso(row.last_used_at),
    notes: row.notes,
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  }
}

function mapTopic(row: TopicBankRow): KhatMapTopicBankEntry {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    angle_notes: row.angle_notes,
    angle_code: row.angle_code,
    episode_type: row.episode_type,
    category: row.category,
    tags: row.tags ?? [],
    freshness: row.freshness,
    last_used_season_id: row.last_used_season_id,
    last_used_at: toIso(row.last_used_at),
    usage_count: row.usage_count,
    source: row.source,
    importance_score: row.importance_score,
    status: row.status,
    quality: row.quality ?? "normal",
    notes: row.notes,
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  }
}

function mapFingerprint(row: FingerprintRow): KhatMapChannelFingerprint {
  return {
    id: row.id,
    version: row.version,
    is_current: row.is_current,
    identity_summary: row.identity_summary,
    khat_dna: row.khat_dna ?? null,
    strongest_emotional_topics: row.strongest_emotional_topics ?? [],
    most_successful_episodes: row.most_successful_episodes ?? [],
    most_successful_guests: row.most_successful_guests ?? [],
    analysis_notes: row.analysis_notes,
    raw_gemini_payload: row.raw_gemini_payload ?? null,
    model_name: row.model_name,
    generated_by: row.generated_by,
    generated_at: toIsoReq(row.generated_at),
  }
}

// ─── Seasons ─────────────────────────────────────────────────────────────────

export type SeasonListFilter = "active" | "archived" | "all"

export async function listSeasons(
  filter: SeasonListFilter = "active",
): Promise<KhatMapSeason[]> {
  const conditions = [isNull(khatMapSeasons.deleted_at)]
  if (filter === "active") conditions.push(isNull(khatMapSeasons.archived_at))
  if (filter === "archived") {
    conditions.shift()
    conditions.push(sql`${khatMapSeasons.archived_at} IS NOT NULL`)
  }
  const rows = await db!
    .select()
    .from(khatMapSeasons)
    .where(and(...conditions))
    .orderBy(desc(khatMapSeasons.updated_at))
  return rows.map(mapSeason)
}

export async function getSeasonById(id: string): Promise<KhatMapSeason | null> {
  const rows = await db!
    .select()
    .from(khatMapSeasons)
    .where(and(eq(khatMapSeasons.id, id), isNull(khatMapSeasons.deleted_at)))
    .limit(1)
  return rows[0] ? mapSeason(rows[0]) : null
}

export async function createSeason(input: {
  name: string
  season_number?: number | null
  target_episode_count: number
  created_by: string
  /** Optional editorial-control bundle, applied at creation time. */
  editorial_controls?: KhatMapEditorialControls
}): Promise<KhatMapSeason> {
  const [row] = await db!
    .insert(khatMapSeasons)
    .values({
      name: input.name,
      season_number: input.season_number ?? null,
      target_episode_count: input.target_episode_count,
      created_by: input.created_by,
      ...(input.editorial_controls
        ? { editorial_controls: input.editorial_controls }
        : {}),
    })
    .returning()
  return mapSeason(row)
}

/**
 * Replace the full editorial-controls JSONB blob for a season. Callers
 * should always pass a fully-resolved object — partial patches risk
 * dropping sub-blocks the wizard depends on.
 */
export async function patchSeasonControls(
  seasonId: string,
  controls: KhatMapEditorialControls,
): Promise<KhatMapSeason | null> {
  const [row] = await db!
    .update(khatMapSeasons)
    .set({ editorial_controls: controls, updated_at: new Date() })
    .where(eq(khatMapSeasons.id, seasonId))
    .returning()
  return row ? mapSeason(row) : null
}

// ─── Episode candidates ──────────────────────────────────────────────────────

export async function listEpisodeCandidates(
  seasonId: string,
): Promise<KhatMapEpisodeCandidate[]> {
  const rows = await db!
    .select()
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.season_id, seasonId))
    .orderBy(asc(khatMapEpisodeCandidates.slot_index))
  return rows.map(mapEpisodeCandidate)
}

export async function getEpisodeCandidateById(
  id: string,
): Promise<KhatMapEpisodeCandidate | null> {
  const rows = await db!
    .select()
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.id, id))
    .limit(1)
  return rows[0] ? mapEpisodeCandidate(rows[0]) : null
}

export async function createEpisodeCandidate(input: {
  season_id: string
  working_title: string
  episode_type: KhatMapEpisodeType
  topic_domain?: KhatMapTopicDomain
  topic_category?: string | null
  topic_angle_code?: string | null
  slot_index?: number | null
  hook?: string | null
  why_matters?: string | null
  why_now?: string | null
  goal?: string | null
  description?: string | null
  suggested_guest_candidate_id?: string | null
  main_axes?: string[]
  suggested_questions?: string[]
  production_notes?: string | null
  // Production-readiness fix sprint additions:
  risk_level?: KhatMapEpisodeCandidate["risk_level"]
  effort_level?: KhatMapEpisodeCandidate["effort_level"]
  composite_score?: number | null
  composite_score_rationale?: string | null
  regional_note?: string | null
}): Promise<KhatMapEpisodeCandidate> {
  const [row] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: input.season_id,
      working_title: input.working_title,
      episode_type: input.episode_type,
      topic_domain: input.topic_domain ?? "none",
      topic_category: input.topic_category ?? null,
      topic_angle_code: input.topic_angle_code ?? null,
      slot_index: input.slot_index ?? null,
      hook: input.hook ?? null,
      why_matters: input.why_matters ?? null,
      why_now: input.why_now ?? null,
      goal: input.goal ?? null,
      description: input.description ?? null,
      suggested_guest_candidate_id: input.suggested_guest_candidate_id ?? null,
      main_axes: input.main_axes ?? [],
      suggested_questions: input.suggested_questions ?? [],
      production_notes: input.production_notes ?? null,
      risk_level: input.risk_level ?? null,
      effort_level: input.effort_level ?? null,
      composite_score: input.composite_score ?? null,
      composite_score_rationale: input.composite_score_rationale ?? null,
      regional_note: input.regional_note ?? null,
    })
    .returning()
  return mapEpisodeCandidate(row)
}

export async function updateEpisodeCandidateStatus(
  id: string,
  next: KhatMapEpisodeCandidateStatus,
  reason?: string,
): Promise<KhatMapEpisodeCandidate | null> {
  const patch: Partial<typeof khatMapEpisodeCandidates.$inferInsert> = {
    status: next,
    updated_at: new Date(),
  }
  if (next === "rejected") patch.rejection_reason = reason ?? null
  if (next === "postponed") patch.postponed_reason = reason ?? null
  if (next === "converted_to_preparation" || next === "converted_to_episode") {
    patch.converted_at = new Date()
  }
  const [row] = await db!
    .update(khatMapEpisodeCandidates)
    .set(patch)
    .where(eq(khatMapEpisodeCandidates.id, id))
    .returning()
  return row ? mapEpisodeCandidate(row) : null
}

export async function patchEpisodeCandidate(
  id: string,
  patch: Partial<{
    working_title: string
    hook: string | null
    why_matters: string | null
    why_now: string | null
    goal: string | null
    description: string | null
    episode_type: KhatMapEpisodeType
    main_axes: string[]
    suggested_questions: string[]
    production_notes: string | null
    risk_level: KhatMapEpisodeCandidate["risk_level"]
    effort_level: KhatMapEpisodeCandidate["effort_level"]
    sponsor_appeal: KhatMapEpisodeCandidate["sponsor_appeal"]
    slot_index: number | null
    suggested_guest_candidate_id: string | null
  }>,
): Promise<KhatMapEpisodeCandidate | null> {
  const [row] = await db!
    .update(khatMapEpisodeCandidates)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(khatMapEpisodeCandidates.id, id))
    .returning()
  return row ? mapEpisodeCandidate(row) : null
}

// ─── Guest candidates (season-scoped) ────────────────────────────────────────

export async function listGuestCandidates(
  seasonId: string,
): Promise<KhatMapGuestCandidate[]> {
  const rows = await db!
    .select()
    .from(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.season_id, seasonId))
    .orderBy(desc(khatMapGuestCandidates.relevance_score))
  return rows.map(mapGuestCandidate)
}

export async function getGuestCandidateById(
  id: string,
): Promise<KhatMapGuestCandidate | null> {
  const rows = await db!
    .select()
    .from(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.id, id))
    .limit(1)
  return rows[0] ? mapGuestCandidate(rows[0]) : null
}

export async function createGuestCandidate(
  input: Omit<
    KhatMapGuestCandidate,
    | "id"
    | "status"
    | "converted_to_guest_candidate_id"
    | "converted_at"
    | "linked_guest_id"
    | "created_at"
    | "updated_at"
    | "gender"
    | "profession"
    | "official_website"
    | "quality"
    | "topic_fit_rationale"
  > & {
    status?: KhatMapGuestCandidateStatus
    gender?: KhatMapGuestCandidate["gender"]
    profession?: string | null
    official_website?: string | null
    quality?: KhatMapGuestQuality
    linked_guest_id?: string | null
    topic_fit_rationale?: string | null
  },
): Promise<KhatMapGuestCandidate> {
  const [row] = await db!
    .insert(khatMapGuestCandidates)
    .values({
      season_id: input.season_id,
      status: input.status ?? "proposed",
      full_name: input.full_name,
      display_name: input.display_name,
      bio: input.bio,
      gender: input.gender ?? "unknown",
      profession: input.profession ?? null,
      why_fit: input.why_fit,
      topic_fit_rationale: input.topic_fit_rationale ?? null,
      category: input.category,
      country: input.country,
      city: input.city,
      public_links: input.public_links ?? [],
      social_accounts: input.social_accounts ?? {},
      official_website: input.official_website ?? null,
      evidence_summary: input.evidence_summary,
      evidence_citations: input.evidence_citations ?? [],
      relevance_score: input.relevance_score,
      depth_score: input.depth_score,
      reach_score: input.reach_score,
      risk_flags: input.risk_flags ?? [],
      quality: input.quality ?? "normal",
      linked_guest_id: input.linked_guest_id ?? null,
    })
    .returning()
  return mapGuestCandidate(row)
}

export async function updateGuestCandidateStatus(
  id: string,
  next: KhatMapGuestCandidateStatus,
): Promise<KhatMapGuestCandidate | null> {
  const patch: Partial<typeof khatMapGuestCandidates.$inferInsert> = {
    status: next,
    updated_at: new Date(),
  }
  if (next === "converted_to_guest_candidate") {
    patch.converted_at = new Date()
  }
  const [row] = await db!
    .update(khatMapGuestCandidates)
    .set(patch)
    .where(eq(khatMapGuestCandidates.id, id))
    .returning()
  return row ? mapGuestCandidate(row) : null
}

export async function patchGuestCandidate(
  id: string,
  patch: Partial<{
    full_name: string
    display_name: string | null
    bio: string | null
    gender: KhatMapGuestCandidate["gender"]
    profession: string | null
    why_fit: string | null
    category: string | null
    country: string | null
    city: string | null
    public_links: KhatMapGuestCandidate["public_links"]
    social_accounts: KhatMapGuestCandidate["social_accounts"]
    official_website: string | null
    evidence_summary: string | null
    evidence_citations: KhatMapGuestCandidate["evidence_citations"]
    relevance_score: number | null
    depth_score: number | null
    reach_score: number | null
    risk_flags: string[]
  }>,
): Promise<KhatMapGuestCandidate | null> {
  const [row] = await db!
    .update(khatMapGuestCandidates)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(khatMapGuestCandidates.id, id))
    .returning()
  return row ? mapGuestCandidate(row) : null
}

export async function setGuestQuality(
  id: string,
  quality: KhatMapGuestQuality,
): Promise<KhatMapGuestCandidate | null> {
  const [row] = await db!
    .update(khatMapGuestCandidates)
    .set({ quality, updated_at: new Date() })
    .where(eq(khatMapGuestCandidates.id, id))
    .returning()
  return row ? mapGuestCandidate(row) : null
}

export async function deleteGuestCandidate(id: string): Promise<boolean> {
  const res = await db!
    .delete(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.id, id))
    .returning({ id: khatMapGuestCandidates.id })
  return res.length > 0
}

/**
 * Cross-season guest aggregation — read for the bank UI. Filters by gender,
 * country, and quality so the page can offer the same controls v2 generation
 * already respects. Joins season name for display.
 */
export interface GuestBankRow extends KhatMapGuestCandidate {
  season_name: string
}
export async function listGuestBank(filter?: {
  gender?: KhatMapGuestCandidate["gender"]
  country?: string
  quality?: KhatMapGuestQuality
  search?: string
}): Promise<GuestBankRow[]> {
  const conditions = [isNull(khatMapSeasons.deleted_at)]
  if (filter?.gender)
    conditions.push(eq(khatMapGuestCandidates.gender, filter.gender))
  if (filter?.country)
    conditions.push(eq(khatMapGuestCandidates.country, filter.country))
  if (filter?.quality)
    conditions.push(eq(khatMapGuestCandidates.quality, filter.quality))
  if (filter?.search && filter.search.trim()) {
    const q = `%${filter.search.trim()}%`
    conditions.push(
      sql`(${khatMapGuestCandidates.full_name} ILIKE ${q}
           OR ${khatMapGuestCandidates.bio} ILIKE ${q}
           OR ${khatMapGuestCandidates.profession} ILIKE ${q})`,
    )
  }
  const rows = await db!
    .select({
      g: khatMapGuestCandidates,
      season_name: khatMapSeasons.name,
    })
    .from(khatMapGuestCandidates)
    .innerJoin(
      khatMapSeasons,
      eq(khatMapGuestCandidates.season_id, khatMapSeasons.id),
    )
    .where(and(...conditions))
    .orderBy(desc(khatMapGuestCandidates.relevance_score))
  return rows.map((r) => ({
    ...mapGuestCandidate(r.g),
    season_name: r.season_name,
  }))
}

// ─── Feedback (audit — written by conversion) ────────────────────────────────

export async function logFeedback(input: {
  season_id?: string | null
  target_type: KhatMapUserFeedback["target_type"]
  target_id: string
  action: KhatMapUserFeedback["action"]
  reason_category?: KhatMapUserFeedback["reason_category"]
  reason_text?: string | null
  admin_id?: string | null
}): Promise<KhatMapUserFeedback> {
  const [row] = await db!
    .insert(khatMapUserFeedback)
    .values({
      season_id: input.season_id ?? null,
      target_type: input.target_type,
      target_id: input.target_id,
      action: input.action,
      reason_category: input.reason_category ?? null,
      reason_text: input.reason_text ?? null,
      admin_id: input.admin_id ?? null,
    })
    .returning()
  return mapFeedback(row)
}

// ─── Pattern memory (global, cross-season) ───────────────────────────────────

export async function listRejectedPatterns(): Promise<KhatMapRejectedPattern[]> {
  const rows = await db!
    .select()
    .from(khatMapRejectedPatterns)
    .orderBy(desc(khatMapRejectedPatterns.updated_at))
  return rows.map(mapRejectedPattern)
}

export async function listAcceptedPatterns(): Promise<KhatMapAcceptedPattern[]> {
  const rows = await db!
    .select()
    .from(khatMapAcceptedPatterns)
    .orderBy(desc(khatMapAcceptedPatterns.updated_at))
  return rows.map(mapAcceptedPattern)
}

/**
 * Increment (or create) a rejected pattern. Unique index on
 * (pattern_type, pattern_text) makes this an upsert.
 */
export async function bumpRejectedPattern(input: {
  pattern_type: KhatMapRejectedPattern["pattern_type"]
  pattern_text: string
  category?: string | null
  severity?: KhatMapRejectedPattern["severity"]
  notes?: string | null
}): Promise<void> {
  await db!
    .insert(khatMapRejectedPatterns)
    .values({
      pattern_type: input.pattern_type,
      pattern_text: input.pattern_text,
      category: input.category ?? null,
      severity: input.severity ?? "medium",
      notes: input.notes ?? null,
      last_rejected_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        khatMapRejectedPatterns.pattern_type,
        khatMapRejectedPatterns.pattern_text,
      ],
      set: {
        rejection_count: sql`${khatMapRejectedPatterns.rejection_count} + 1`,
        last_rejected_at: new Date(),
        updated_at: new Date(),
      },
    })
}

export async function bumpAcceptedPattern(input: {
  pattern_type: KhatMapAcceptedPattern["pattern_type"]
  pattern_text: string
  category?: string | null
  notes?: string | null
}): Promise<void> {
  await db!
    .insert(khatMapAcceptedPatterns)
    .values({
      pattern_type: input.pattern_type,
      pattern_text: input.pattern_text,
      category: input.category ?? null,
      notes: input.notes ?? null,
      last_used_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        khatMapAcceptedPatterns.pattern_type,
        khatMapAcceptedPatterns.pattern_text,
      ],
      set: {
        success_count: sql`${khatMapAcceptedPatterns.success_count} + 1`,
        last_used_at: new Date(),
        updated_at: new Date(),
      },
    })
}

// ─── Topic bank ──────────────────────────────────────────────────────────────

export async function listTopics(filter?: {
  category?: string
  status?: KhatMapTopicBankEntry["status"]
  quality?: KhatMapTopicQuality
  freshness?: KhatMapTopicBankEntry["freshness"]
  angle_code_prefix?: string
  /** Case-insensitive substring search on title + description + angle_notes. */
  search?: string
}): Promise<KhatMapTopicBankEntry[]> {
  const conditions = []
  if (filter?.category) conditions.push(eq(khatMapTopicBank.category, filter.category))
  if (filter?.status) conditions.push(eq(khatMapTopicBank.status, filter.status))
  if (filter?.quality) conditions.push(eq(khatMapTopicBank.quality, filter.quality))
  if (filter?.freshness)
    conditions.push(eq(khatMapTopicBank.freshness, filter.freshness))
  if (filter?.angle_code_prefix) {
    conditions.push(
      sql`${khatMapTopicBank.angle_code} LIKE ${filter.angle_code_prefix + "%"}`,
    )
  }
  if (filter?.search && filter.search.trim()) {
    const q = `%${filter.search.trim()}%`
    conditions.push(
      sql`(${khatMapTopicBank.title} ILIKE ${q}
           OR ${khatMapTopicBank.description} ILIKE ${q}
           OR ${khatMapTopicBank.angle_notes} ILIKE ${q})`,
    )
  }
  const where = conditions.length ? and(...conditions) : undefined
  const rows = await db!
    .select()
    .from(khatMapTopicBank)
    .where(where)
    .orderBy(asc(khatMapTopicBank.freshness), desc(khatMapTopicBank.importance_score))
  return rows.map(mapTopic)
}

/** Set just the quality marker. Separate from updateTopic so the action layer can keep its UX simple. */
export async function setTopicQuality(
  id: string,
  quality: KhatMapTopicQuality,
): Promise<KhatMapTopicBankEntry | null> {
  const [row] = await db!
    .update(khatMapTopicBank)
    .set({ quality, updated_at: new Date() })
    .where(eq(khatMapTopicBank.id, id))
    .returning()
  return row ? mapTopic(row) : null
}

/**
 * Hard-delete many topics in one shot. Refuses to delete invasion-angle
 * rows — callers receive the list of skipped ids alongside the deleted ids.
 */
export async function bulkDeleteTopics(
  ids: string[],
): Promise<{ deleted: string[]; skipped: string[] }> {
  if (ids.length === 0) return { deleted: [], skipped: [] }
  const rows = await db!
    .select()
    .from(khatMapTopicBank)
    .where(inArray(khatMapTopicBank.id, ids))
  const deletable: string[] = []
  const skipped: string[] = []
  for (const r of rows) {
    if (r.category === "invasion" && r.angle_code) skipped.push(r.id)
    else deletable.push(r.id)
  }
  if (deletable.length === 0) return { deleted: [], skipped }
  await db!
    .delete(khatMapTopicBank)
    .where(inArray(khatMapTopicBank.id, deletable))
  return { deleted: deletable, skipped }
}

export async function getTopicById(id: string): Promise<KhatMapTopicBankEntry | null> {
  const rows = await db!
    .select()
    .from(khatMapTopicBank)
    .where(eq(khatMapTopicBank.id, id))
    .limit(1)
  return rows[0] ? mapTopic(rows[0]) : null
}

export async function getTopicByAngleCode(
  code: string,
): Promise<KhatMapTopicBankEntry | null> {
  const rows = await db!
    .select()
    .from(khatMapTopicBank)
    .where(eq(khatMapTopicBank.angle_code, code))
    .limit(1)
  return rows[0] ? mapTopic(rows[0]) : null
}

export async function upsertTopic(input: {
  title: string
  description?: string | null
  angle_notes?: string | null
  angle_code?: string | null
  episode_type?: KhatMapEpisodeType | null
  category?: string | null
  tags?: string[]
  freshness?: KhatMapTopicBankEntry["freshness"]
  source?: KhatMapTopicBankEntry["source"]
  importance_score?: number | null
  status?: KhatMapTopicBankEntry["status"]
  notes?: string | null
}): Promise<KhatMapTopicBankEntry> {
  if (input.angle_code) {
    const existing = await getTopicByAngleCode(input.angle_code)
    if (existing) {
      const [row] = await db!
        .update(khatMapTopicBank)
        .set({
          title: input.title,
          description: input.description ?? existing.description,
          angle_notes: input.angle_notes ?? existing.angle_notes,
          episode_type: input.episode_type ?? existing.episode_type,
          category: input.category ?? existing.category,
          tags: input.tags ?? existing.tags,
          freshness: input.freshness ?? existing.freshness,
          source: input.source ?? existing.source,
          importance_score: input.importance_score ?? existing.importance_score,
          status: input.status ?? existing.status,
          notes: input.notes ?? existing.notes,
          updated_at: new Date(),
        })
        .where(eq(khatMapTopicBank.id, existing.id))
        .returning()
      return mapTopic(row)
    }
  }
  const [row] = await db!
    .insert(khatMapTopicBank)
    .values({
      title: input.title,
      description: input.description ?? null,
      angle_notes: input.angle_notes ?? null,
      angle_code: input.angle_code ?? null,
      episode_type: input.episode_type ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      freshness: input.freshness ?? "fresh",
      source: input.source ?? "ai_discovered",
      importance_score: input.importance_score ?? null,
      status: input.status ?? "active",
      notes: input.notes ?? null,
    })
    .returning()
  return mapTopic(row)
}

export async function updateTopic(
  id: string,
  patch: Partial<{
    title: string
    description: string | null
    angle_notes: string | null
    episode_type: KhatMapEpisodeType | null
    category: string | null
    tags: string[]
    freshness: KhatMapTopicBankEntry["freshness"]
    importance_score: number | null
    status: KhatMapTopicBankEntry["status"]
    notes: string | null
  }>,
): Promise<KhatMapTopicBankEntry | null> {
  const [row] = await db!
    .update(khatMapTopicBank)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(khatMapTopicBank.id, id))
    .returning()
  return row ? mapTopic(row) : null
}

export async function retireTopic(id: string): Promise<KhatMapTopicBankEntry | null> {
  const [row] = await db!
    .update(khatMapTopicBank)
    .set({ status: "retired", updated_at: new Date() })
    .where(eq(khatMapTopicBank.id, id))
    .returning()
  return row ? mapTopic(row) : null
}

export async function restoreTopic(id: string): Promise<KhatMapTopicBankEntry | null> {
  const [row] = await db!
    .update(khatMapTopicBank)
    .set({ status: "active", updated_at: new Date() })
    .where(eq(khatMapTopicBank.id, id))
    .returning()
  return row ? mapTopic(row) : null
}

/**
 * Hard-delete a topic. REFUSES on invasion-angle rows (those are part of
 * the constitution-seeded memory and must never disappear). Admin should
 * use `retireTopic` for those instead.
 */
export async function deleteTopic(
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await getTopicById(id)
  if (!existing) return { ok: false, reason: "not_found" }
  if (existing.category === "invasion" && existing.angle_code) {
    return { ok: false, reason: "invasion_angle_protected" }
  }
  const deleted = await db!
    .delete(khatMapTopicBank)
    .where(eq(khatMapTopicBank.id, id))
    .returning({ id: khatMapTopicBank.id })
  return { ok: deleted.length > 0 }
}

/**
 * Mark a topic as used by a given season. Promotes freshness along the
 * scale (fresh → recently_used → deeply_covered). No-op once at
 * deeply_covered; admin can manually reset if they want to reuse.
 */
export async function markTopicUsed(
  topicId: string,
  seasonId: string,
): Promise<KhatMapTopicBankEntry | null> {
  const current = await db!
    .select()
    .from(khatMapTopicBank)
    .where(eq(khatMapTopicBank.id, topicId))
    .limit(1)
  const existing = current[0]
  if (!existing) return null

  const next: KhatMapTopicBankEntry["freshness"] =
    existing.freshness === "fresh"
      ? "recently_used"
      : existing.freshness === "lightly_covered"
        ? "recently_used"
        : existing.freshness === "recently_used"
          ? "deeply_covered"
          : "deeply_covered"

  const [row] = await db!
    .update(khatMapTopicBank)
    .set({
      freshness: next,
      last_used_season_id: seasonId,
      last_used_at: new Date(),
      usage_count: existing.usage_count + 1,
      updated_at: new Date(),
    })
    .where(eq(khatMapTopicBank.id, topicId))
    .returning()
  return row ? mapTopic(row) : null
}

// ─── Channel fingerprint (versioned) ─────────────────────────────────────────

export async function getCurrentFingerprint(): Promise<KhatMapChannelFingerprint | null> {
  const rows = await db!
    .select()
    .from(khatMapChannelFingerprint)
    .where(eq(khatMapChannelFingerprint.is_current, true))
    .limit(1)
  return rows[0] ? mapFingerprint(rows[0]) : null
}

export async function listFingerprintVersions(): Promise<KhatMapChannelFingerprint[]> {
  const rows = await db!
    .select()
    .from(khatMapChannelFingerprint)
    .orderBy(desc(khatMapChannelFingerprint.version))
    .limit(20)
  return rows.map(mapFingerprint)
}

export async function createFingerprintVersion(input: {
  identity_summary?: string | null
  khat_dna?: KhatMapChannelFingerprint["khat_dna"]
  strongest_emotional_topics?: string[]
  most_successful_episodes?: KhatMapChannelFingerprint["most_successful_episodes"]
  most_successful_guests?: KhatMapChannelFingerprint["most_successful_guests"]
  analysis_notes?: string | null
  raw_gemini_payload?: Record<string, unknown> | null
  model_name?: string | null
  generated_by?: string | null
}): Promise<KhatMapChannelFingerprint> {
  // Demote all existing rows first (partial unique index enforces the rule).
  await db!
    .update(khatMapChannelFingerprint)
    .set({ is_current: false })
    .where(eq(khatMapChannelFingerprint.is_current, true))

  const latest = await db!
    .select({
      max: sql<number>`COALESCE(MAX(${khatMapChannelFingerprint.version}), 0)`,
    })
    .from(khatMapChannelFingerprint)
  const nextVersion = (latest[0]?.max ?? 0) + 1

  const [row] = await db!
    .insert(khatMapChannelFingerprint)
    .values({
      version: nextVersion,
      is_current: true,
      identity_summary: input.identity_summary ?? null,
      khat_dna: input.khat_dna ?? null,
      strongest_emotional_topics: input.strongest_emotional_topics ?? [],
      most_successful_episodes: input.most_successful_episodes ?? [],
      most_successful_guests: input.most_successful_guests ?? [],
      analysis_notes: input.analysis_notes ?? null,
      raw_gemini_payload: input.raw_gemini_payload ?? null,
      model_name: input.model_name ?? null,
      generated_by: input.generated_by ?? null,
    })
    .returning()
  return mapFingerprint(row)
}

// ─── Aggregates for the UI ──────────────────────────────────────────────────

/**
 * Bundle the season + its episode/guest candidates for the read-only
 * pages (cross-season guest aggregator, etc). The wizard reads
 * candidates directly via dedicated actions instead.
 */
export interface KhatMapSeasonDetail {
  season: KhatMapSeason
  episode_candidates: KhatMapEpisodeCandidate[]
  guest_candidates: KhatMapGuestCandidate[]
}

export async function getSeasonDetail(
  seasonId: string,
): Promise<KhatMapSeasonDetail | null> {
  const season = await getSeasonById(seasonId)
  if (!season) return null
  const [episode_candidates, guest_candidates] = await Promise.all([
    listEpisodeCandidates(seasonId),
    listGuestCandidates(seasonId),
  ])
  return { season, episode_candidates, guest_candidates }
}

export async function getOverview(): Promise<KhatMapOverview> {
  const statusCounts = await db!
    .select({
      status: khatMapSeasons.status,
      count: sql<number>`count(*)::int`,
    })
    .from(khatMapSeasons)
    .where(isNull(khatMapSeasons.deleted_at))
    .groupBy(khatMapSeasons.status)

  const seasons = { planning: 0, active: 0, completed: 0, archived: 0 }
  for (const r of statusCounts) {
    const key = r.status as KhatMapSeasonStatus
    if (key in seasons) seasons[key] = Number(r.count) || 0
  }

  const activeRows = await db!
    .select()
    .from(khatMapSeasons)
    .where(
      and(
        isNull(khatMapSeasons.deleted_at),
        isNull(khatMapSeasons.archived_at),
        sql`${khatMapSeasons.status} <> 'completed'`,
      ),
    )
    .orderBy(desc(khatMapSeasons.updated_at))
    .limit(1)
  const active_season = activeRows[0] ? mapSeason(activeRows[0]) : null

  const topicCounts = await db!
    .select({
      freshness: khatMapTopicBank.freshness,
      count: sql<number>`count(*)::int`,
    })
    .from(khatMapTopicBank)
    .where(eq(khatMapTopicBank.status, "active"))
    .groupBy(khatMapTopicBank.freshness)
  const topic_bank = { total: 0, fresh: 0, deeply_covered: 0 }
  for (const r of topicCounts) {
    topic_bank.total += Number(r.count) || 0
    if (r.freshness === "fresh") topic_bank.fresh = Number(r.count) || 0
    if (r.freshness === "deeply_covered") topic_bank.deeply_covered = Number(r.count) || 0
  }

  const invasionCounts = await db!
    .select({
      freshness: khatMapTopicBank.freshness,
      count: sql<number>`count(*)::int`,
    })
    .from(khatMapTopicBank)
    .where(
      and(
        eq(khatMapTopicBank.category, "invasion"),
        eq(khatMapTopicBank.status, "active"),
      ),
    )
    .groupBy(khatMapTopicBank.freshness)
  const invasion_angles = { total: 0, fresh: 0, recently_used: 0 }
  for (const r of invasionCounts) {
    invasion_angles.total += Number(r.count) || 0
    if (r.freshness === "fresh") invasion_angles.fresh = Number(r.count) || 0
    if (r.freshness === "recently_used")
      invasion_angles.recently_used = Number(r.count) || 0
  }

  const fingerprint = await getCurrentFingerprint()
  const fingerprintState = {
    current_version: fingerprint?.version ?? null,
    last_generated_at: fingerprint?.generated_at ?? null,
    needs_refresh:
      !fingerprint ||
      Date.now() - new Date(fingerprint.generated_at).getTime() >
        90 * 24 * 60 * 60 * 1000,
  }

  const pendingEpisodes = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.status, "proposed"))
  const pendingGuests = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.status, "proposed"))

  return {
    seasons,
    active_season,
    topic_bank,
    invasion_angles,
    fingerprint: fingerprintState,
    pending_review: {
      episode_candidates: Number(pendingEpisodes[0]?.count) || 0,
      guest_candidates: Number(pendingGuests[0]?.count) || 0,
    },
  }
}
