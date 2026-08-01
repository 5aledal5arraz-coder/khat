/**
 * UX-3a — Episode Workspace data loader.
 *
 *   loadEpisodeWorkspace(eirId)
 *     One round-trip-batched read that gathers everything the
 *     /admin/khat-brain/episodes/[eirId] page renders:
 *       - the EIR row + editorial intent
 *       - linked season name (when present)
 *       - linked guest summary (when present)
 *       - the candidate that produced this EIR (for hybrid provenance)
 *       - whether a preparation / studio session / episode exists
 *       - the last 12 phase transitions (for the timeline)
 *
 *   listEpisodeWorkspaceIndex({ phase?, seasonId?, hasGuest?, q? })
 *     The /admin/khat-brain/episodes index. Server-side filters; light
 *     pagination not yet — list size is bounded by the EIR table being
 *     small in this product (≤ a few hundred rows).
 *
 * No write paths. No new tables. Pure aggregation on existing schema.
 */

import { and, desc, eq, ilike, isNotNull, isNull, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  episodeIntelligenceRecords,
  eirPhaseTransitions,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import { khatMapSeasons, khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import { guests } from "@/lib/db/schema/guests"
import { guestIdentityProfiles } from "@/lib/db/schema/guest-identity"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodes } from "@/lib/db/schema/episodes"

// ─── Index list (with filters) ───────────────────────────────────────

export interface EpisodeIndexFilter {
  phase?: EpisodePhase | null
  /**
   * Restrict to a SET of phases — how the admin home's five-stage funnel
   * filters (`?stage=…`, resolved through `lib/khat-brain/pipeline-stages.ts`).
   * Combines with `phase` as an AND, so a stage link plus an explicit phase
   * narrows rather than contradicts. An EMPTY array is ignored, never applied:
   * `inArray(col, [])` matches nothing, which would render as "no episodes in
   * this stage" — a lie the operator cannot see through.
   */
  phases?: readonly EpisodePhase[] | null
  seasonId?: string | null
  /** "has" → guest_id IS NOT NULL; "missing" → IS NULL; null/undefined → no filter. */
  hasGuest?: "has" | "missing" | null
  /** Free-text search over working_title (case-insensitive). */
  q?: string | null
  limit?: number
}

export interface EpisodeIndexRow {
  id: string
  working_title: string
  phase: EpisodePhase
  season_id: string | null
  season_name: string | null
  guest_id: string | null
  guest_name: string | null
  /**
   * Same display fallback as `EpisodeWorkspaceSnapshot.guest_fallback_name`,
   * for the same reason — see the long note there. It has to exist on BOTH
   * paths: the index is the operator's normal entry point, so fixing only the
   * detail page left the contradiction on the first screen they see (a row
   * reading «بلا ضيف» that opens onto «الأستاذ علي دريساوي»).
   *
   * Never a canonical guest: null whenever `guest_id` is set, and it carries
   * no id, so nothing may render it as a link.
   */
  guest_fallback_name: string | null
  updated_at: string
}

export async function listEpisodeWorkspaceIndex(
  filter: EpisodeIndexFilter = {},
): Promise<EpisodeIndexRow[]> {
  const conds = [isNull(episodeIntelligenceRecords.archived_at)]
  if (filter.phase) {
    conds.push(eq(episodeIntelligenceRecords.phase, filter.phase))
  }
  if (filter.phases && filter.phases.length > 0) {
    conds.push(inArray(episodeIntelligenceRecords.phase, [...filter.phases]))
  }
  if (filter.seasonId) {
    conds.push(eq(episodeIntelligenceRecords.season_id, filter.seasonId))
  }
  if (filter.hasGuest === "has") {
    conds.push(isNotNull(episodeIntelligenceRecords.guest_id))
  } else if (filter.hasGuest === "missing") {
    conds.push(isNull(episodeIntelligenceRecords.guest_id))
  }
  if (filter.q && filter.q.trim().length > 0) {
    conds.push(
      ilike(episodeIntelligenceRecords.working_title, `%${filter.q.trim()}%`),
    )
  }

  const where = conds.length === 1 ? conds[0] : and(...conds)
  const limit = filter.limit ?? 100

  const rows = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
      phase: episodeIntelligenceRecords.phase,
      season_id: episodeIntelligenceRecords.season_id,
      guest_id: episodeIntelligenceRecords.guest_id,
      updated_at: episodeIntelligenceRecords.updated_at,
      season_name: khatMapSeasons.name,
      guest_name: guests.name,
    })
    .from(episodeIntelligenceRecords)
    .leftJoin(
      khatMapSeasons,
      eq(khatMapSeasons.id, episodeIntelligenceRecords.season_id),
    )
    .leftJoin(guests, eq(guests.id, episodeIntelligenceRecords.guest_id))
    .where(where)
    .orderBy(desc(episodeIntelligenceRecords.updated_at))
    .limit(limit)

  // One extra batched read for the rows that have NO canonical guest — never
  // one query per row. It projects two small columns (no JSONB) and is
  // skipped entirely when every row already has a linked guest.
  const unlinkedIds = rows.filter((r) => !r.guest_name).map((r) => r.id)
  const fallbackByEir = await loadPrepGuestNames(unlinkedIds)

  return rows.map((r) => ({
    id: r.id,
    working_title: r.working_title,
    phase: r.phase as EpisodePhase,
    season_id: r.season_id ?? null,
    season_name: r.season_name ?? null,
    guest_id: r.guest_id ?? null,
    guest_name: r.guest_name ?? null,
    guest_fallback_name: r.guest_name
      ? null
      : (fallbackByEir.get(r.id) ?? null),
    updated_at: r.updated_at.toISOString(),
  }))
}

/**
 * eir_id → the most recently updated preparation's `guest_name`, for the
 * given EIRs only. Empty input short-circuits without a query.
 *
 * Deliberately ONE statement for the whole page: `listPreparations` already
 * demonstrates how a list route degrades when it pulls more per row than it
 * needs, and adding a per-row read here would be strictly worse. Ordering by
 * `updated_at DESC` and keeping the first hit per eir_id reproduces exactly
 * what `loadEpisodeWorkspace` does for a single episode, so the index and the
 * detail page cannot disagree about which preparation they read.
 */
async function loadPrepGuestNames(
  eirIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (eirIds.length === 0) return out
  const prepRows = await db!
    .select({
      eir_id: episodePreparations.eir_id,
      guest_name: episodePreparations.guest_name,
    })
    .from(episodePreparations)
    .where(inArray(episodePreparations.eir_id, eirIds))
    .orderBy(desc(episodePreparations.updated_at))
  // `seen` is tracked apart from `out`: the newest preparation is the one that
  // answers, even when its guest_name is empty. Falling through to an OLDER
  // prep's name would make the index show a guest the detail page does not —
  // the same class of contradiction this whole fix exists to remove.
  const seen = new Set<string>()
  for (const p of prepRows) {
    if (!p.eir_id || seen.has(p.eir_id)) continue
    seen.add(p.eir_id)
    const name = p.guest_name?.trim()
    if (name) out.set(p.eir_id, name)
  }
  return out
}

// ─── Workspace snapshot ──────────────────────────────────────────────

export interface WorkspaceTransition {
  id: string
  from_phase: EpisodePhase | null
  to_phase: EpisodePhase
  reason: string | null
  created_at: string
}

export interface WorkspaceGuest {
  id: string
  name: string
  slug: string
  bio: string | null
  photo_url: string | null
  external_links: Record<string, string> | null
  identity: Record<string, unknown> | null
}

export interface WorkspaceLinks {
  preparation_id: string | null
  studio_session_id: string | null
  /**
   * YouTube video id of the linked studio session. The studio page has
   * no per-session route — deep-links are `/admin/studio?video=<id>` —
   * so link builders need this alongside studio_session_id. Null for
   * audio-upload sessions (those are only reachable from the list).
   */
  studio_video_id: string | null
  episode_id: string | null
}

export interface WorkspaceHybridProvenance {
  source: string | null
  market_inspiration: string | null
  original_lens: string | null
  strength_score: number | null
}

export interface EpisodeWorkspaceSnapshot {
  eir: {
    id: string
    working_title: string
    final_title: string | null
    phase: EpisodePhase
    season_id: string | null
    season_name: string | null
    topic_domain: string | null
    episode_type: string | null
    topic_angle_code: string | null
    risk_level: string | null
    effort_level: string | null
    recording_scheduled_at: string | null
    editorial_intent: Record<string, unknown> | null
    archived_at: string | null
    created_by: string | null
    created_at: string
    updated_at: string
  }
  guest: WorkspaceGuest | null
  /**
   * The guest name the preparation carries, when no canonical guest is linked.
   *
   * Why this exists: `eir.guest_id` has exactly one writer — the manual
   * "إسناد ضيف" button — so it is NULL on 8 of 8 local EIRs even when the
   * preparation names a guest and holds a full extraction strategy for them.
   * The workspace derived the guest ONLY from `eir.guest_id`, so the guest tab
   * showed "لم يتم ربط ضيف" + a discovery CTA while the preparation tab, on
   * the same screen, showed that guest's name and strategy — an operator
   * acting on the first spends money re-discovering someone already chosen.
   *
   * This is a DISPLAY fallback and is deliberately NOT folded into `guest`:
   * there is no canonical `guests` row behind it, so it has no id, no slug,
   * and no profile link. Every render of it must say so.
   */
  guest_fallback_name: string | null
  transitions: WorkspaceTransition[]
  links: WorkspaceLinks
  hybrid_provenance: WorkspaceHybridProvenance | null
  /** True when at least one row in episode_preparations.eir_id matches. */
  has_preparation: boolean
  has_studio_session: boolean
  has_episode: boolean
}

export async function loadEpisodeWorkspace(
  eirId: string,
): Promise<EpisodeWorkspaceSnapshot | null> {
  const [row] = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
      final_title: episodeIntelligenceRecords.final_title,
      phase: episodeIntelligenceRecords.phase,
      season_id: episodeIntelligenceRecords.season_id,
      topic_domain: episodeIntelligenceRecords.topic_domain,
      episode_type: episodeIntelligenceRecords.episode_type,
      topic_angle_code: episodeIntelligenceRecords.topic_angle_code,
      risk_level: episodeIntelligenceRecords.risk_level,
      effort_level: episodeIntelligenceRecords.effort_level,
      recording_scheduled_at: episodeIntelligenceRecords.recording_scheduled_at,
      editorial_intent: episodeIntelligenceRecords.editorial_intent,
      guest_id: episodeIntelligenceRecords.guest_id,
      archived_at: episodeIntelligenceRecords.archived_at,
      created_by: episodeIntelligenceRecords.created_by,
      created_at: episodeIntelligenceRecords.created_at,
      updated_at: episodeIntelligenceRecords.updated_at,
      season_name: khatMapSeasons.name,
    })
    .from(episodeIntelligenceRecords)
    .leftJoin(
      khatMapSeasons,
      eq(khatMapSeasons.id, episodeIntelligenceRecords.season_id),
    )
    .where(eq(episodeIntelligenceRecords.id, eirId))
    .limit(1)
  if (!row) return null

  const [
    transitionRows,
    guestRow,
    candidateRow,
    prepRow,
    studioRow,
    episodeRow,
  ] = await Promise.all([
    db!
      .select({
        id: eirPhaseTransitions.id,
        from_phase: eirPhaseTransitions.from_phase,
        to_phase: eirPhaseTransitions.to_phase,
        reason: eirPhaseTransitions.reason,
        created_at: eirPhaseTransitions.created_at,
      })
      .from(eirPhaseTransitions)
      .where(eq(eirPhaseTransitions.eir_id, eirId))
      .orderBy(desc(eirPhaseTransitions.created_at))
      .limit(12),
    row.guest_id
      ? db!
          .select({
            id: guests.id,
            name: guests.name,
            slug: guests.slug,
            bio: guests.bio,
            photo_url: guests.photo_url,
            external_links: guests.external_links,
            identity: guestIdentityProfiles,
          })
          .from(guests)
          .leftJoin(
            guestIdentityProfiles,
            eq(guestIdentityProfiles.guest_id, guests.id),
          )
          .where(eq(guests.id, row.guest_id))
          .limit(1)
      : Promise.resolve([] as never),
    // Hybrid provenance lives in candidate.production_notes (JSON
    // stringified). The EIR's editorial_intent.source_id points back
    // to the candidate.
    (() => {
      const sourceId =
        ((row.editorial_intent ?? {}) as { source_id?: string | null })
          .source_id ?? null
      if (!sourceId) return Promise.resolve([] as never)
      return db!
        .select({ production_notes: khatMapEpisodeCandidates.production_notes })
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, sourceId))
        .limit(1)
    })(),
    db!
      .select({
        id: episodePreparations.id,
        guest_name: episodePreparations.guest_name,
      })
      .from(episodePreparations)
      .where(eq(episodePreparations.eir_id, eirId))
      .orderBy(desc(episodePreparations.updated_at))
      .limit(1),
    db!
      .select({ id: studioSessions.id, video_id: studioSessions.video_id })
      .from(studioSessions)
      .where(eq(studioSessions.eir_id, eirId))
      .orderBy(desc(studioSessions.updated_at))
      .limit(1),
    db!
      .select({ id: episodes.id })
      .from(episodes)
      .where(eq(episodes.eir_id, eirId))
      .limit(1),
  ])

  const guest =
    guestRow && Array.isArray(guestRow) && guestRow[0]
      ? mapGuest(guestRow[0])
      : null

  const hybrid_provenance = (() => {
    const note = candidateRow?.[0]?.production_notes ?? null
    if (!note) return null
    try {
      const parsed = JSON.parse(note) as Record<string, unknown>
      if (parsed?.source !== "hybrid_topics") return null
      return {
        source: "hybrid_topics",
        market_inspiration: (parsed.market_inspiration as string | null) ?? null,
        original_lens: (parsed.original_lens as string | null) ?? null,
        strength_score:
          typeof parsed.strength_score === "number"
            ? (parsed.strength_score as number)
            : null,
      }
    } catch {
      return null
    }
  })()

  return {
    eir: {
      id: row.id,
      working_title: row.working_title,
      final_title: row.final_title ?? null,
      phase: row.phase as EpisodePhase,
      season_id: row.season_id ?? null,
      season_name: row.season_name ?? null,
      topic_domain: row.topic_domain ?? null,
      episode_type: row.episode_type ?? null,
      topic_angle_code: row.topic_angle_code ?? null,
      risk_level: row.risk_level ?? null,
      effort_level: row.effort_level ?? null,
      recording_scheduled_at: row.recording_scheduled_at
        ? row.recording_scheduled_at.toISOString()
        : null,
      editorial_intent:
        (row.editorial_intent ?? null) as Record<string, unknown> | null,
      archived_at: row.archived_at ? row.archived_at.toISOString() : null,
      created_by: row.created_by ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    },
    guest,
    // Only when there is no canonical guest — a linked guest is always the
    // authority, and showing both would be a second contradiction.
    guest_fallback_name: guest
      ? null
      : (prepRow?.[0]?.guest_name?.trim() || null),
    transitions: transitionRows.map((t) => ({
      id: t.id,
      from_phase: (t.from_phase ?? null) as EpisodePhase | null,
      to_phase: t.to_phase as EpisodePhase,
      reason: t.reason ?? null,
      created_at: t.created_at.toISOString(),
    })),
    links: {
      preparation_id: prepRow?.[0]?.id ?? null,
      studio_session_id: studioRow?.[0]?.id ?? null,
      studio_video_id: studioRow?.[0]?.video_id ?? null,
      episode_id: episodeRow?.[0]?.id ?? null,
    },
    hybrid_provenance,
    has_preparation: Boolean(prepRow?.[0]?.id),
    has_studio_session: Boolean(studioRow?.[0]?.id),
    has_episode: Boolean(episodeRow?.[0]?.id),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function mapGuest(row: {
  id: string
  name: string
  slug: string
  bio: string | null
  photo_url: string | null
  external_links: Record<string, string> | null
  identity: typeof guestIdentityProfiles.$inferSelect | null
}): WorkspaceGuest {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    photo_url: row.photo_url,
    external_links: row.external_links ?? null,
    identity: (row.identity ?? null) as Record<string, unknown> | null,
  }
}

/**
 * Reverse lookup used by the legacy preparation route's redirect: given
 * a preparation_id, find the EIR id that prep is linked to. Returns
 * null when the prep is unlinked (we keep the legacy page for those).
 */
export async function findEirIdByPreparationId(
  preparationId: string,
): Promise<string | null> {
  const [row] = await db!
    .select({ eir_id: episodePreparations.eir_id })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, preparationId))
    .limit(1)
  return row?.eir_id ?? null
}

void inArray
void sql
