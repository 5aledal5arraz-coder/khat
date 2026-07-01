/**
 * Episode Preparation Studio — DB query layer.
 *
 * All reads/writes against `episode_preparations` go through here so API
 * routes stay thin and the JSON ↔ typed-record boundary is owned by one file.
 */

import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { eq, desc, isNull, isNotNull, and } from "drizzle-orm"
import type {
  EpisodePreparation,
  EpisodePreparationLiveView,
  PreparationInputs,
  PreparationSectionKey,
  PreparationSectionsStatus,
  PreparationSectionStatus,
  PreparationStatus,
  PreparationLiveState,
  PreparationGuestIdentity,
} from "@/types/preparation"
import { PREPARATION_STATUS_RANK } from "@/types/preparation"
import { hashLiveToken } from "./token"

/** The 9 editorial sections (research excluded). */
const EDITORIAL_SECTIONS: PreparationSectionKey[] = [
  "executive_summary",
  "knowledge_bank",
  "guest_intelligence",
  "conversation_axes",
  "episode_flow",
  "question_system",
  "host_instructions",
  "quotes_references",
  "viral_moments",
]

/**
 * Research readiness — a preparation's research corpus is only considered
 * usable when it actually grounds downstream generation. Empty sources or
 * empty claims mean the research layer produced nothing the editorial
 * generators can work with, regardless of whether the HTTP call succeeded.
 *
 * This is the single source of truth for "is research usable?" — both
 * auto-status and the generate/regenerate routes gate on it.
 */
export function isResearchUsable(prep: EpisodePreparation): boolean {
  const r = prep.research_data
  if (!r) return false
  if (prep.sections_status.research?.status !== "ready") return false
  if (!Array.isArray(r.sources) || r.sources.length === 0) return false
  if (!Array.isArray(r.claims) || r.claims.length === 0) return false
  return true
}

/**
 * Pure function: what status would this record have if we computed it from
 * scratch, ignoring the stored `status` value? This is used by the force
 * recompute path (re-run research, regenerate section) to re-evaluate state
 * without being blocked by the "never demote" guard.
 */
export function statusFromData(prep: EpisodePreparation): PreparationStatus {
  const researchUsable = isResearchUsable(prep)
  const allEditorialReady = EDITORIAL_SECTIONS.every(
    (s) => prep.sections_status[s]?.status === "ready",
  )
  if (researchUsable && allEditorialReady) return "prepared"
  if (researchUsable) return "researched"
  return "draft"
}

/**
 * Auto-bump path — called after every successful section write.
 * Never demotes: `reviewed` / `approved` survive individual section updates
 * unless the caller explicitly demotes them via the force-recompute path.
 */
export function computeAutoStatus(prep: EpisodePreparation): PreparationStatus {
  const fromData = statusFromData(prep)
  return PREPARATION_STATUS_RANK[fromData] > PREPARATION_STATUS_RANK[prep.status]
    ? fromData
    : prep.status
}

/**
 * Force recompute with an optional max cap. Used when the data foundation
 * changed in a way that invalidates human signoff (re-running research, or
 * regenerating an editorial section while the record was `reviewed` /
 * `approved`). Unlike `computeAutoStatus`, this CAN demote.
 *
 *   computeForceStatus(prep, "researched")  →  re-run research
 *   computeForceStatus(prep, "prepared")    →  regenerate section
 */
export function computeForceStatus(
  prep: EpisodePreparation,
  maxCap: PreparationStatus,
): PreparationStatus {
  const fromData = statusFromData(prep)
  return PREPARATION_STATUS_RANK[fromData] > PREPARATION_STATUS_RANK[maxCap]
    ? maxCap
    : fromData
}

/**
 * Apply a computed status directly, bypassing the never-demote rule. Used by
 * the routes that explicitly call `computeForceStatus`.
 */
export async function forceSetStatus(
  id: string,
  next: PreparationStatus,
): Promise<EpisodePreparation | null> {
  const [row] = await db!
    .update(episodePreparations)
    .set({ status: next, updated_at: new Date() })
    .where(eq(episodePreparations.id, id))
    .returning()
  await syncEirForPrepRow(row, next)
  return row ? mapRow(row) : null
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

type PrepRow = typeof episodePreparations.$inferSelect

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : v
}

function mapRow(row: PrepRow): EpisodePreparation {
  return {
    id: row.id,
    title: row.title,
    guest_name: row.guest_name,
    guest_description: row.guest_description,
    guest_profile_link: row.guest_profile_link,
    guest_identity: row.guest_identity ?? null,
    short_description: row.short_description,
    episode_goal: row.episode_goal,
    key_questions: row.key_questions ?? [],
    tone_type: (row.tone_type as EpisodePreparation["tone_type"]) ?? null,
    focus_mode: (row.focus_mode as EpisodePreparation["focus_mode"]) ?? null,
    expected_duration_min: row.expected_duration_min,
    depth_level: row.depth_level,
    boldness_level: row.boldness_level,
    content_focus: (row.content_focus ?? []) as EpisodePreparation["content_focus"],
    inputs_meta: row.inputs_meta ?? null,
    research_data: row.research_data ?? null,
    executive_summary: row.executive_summary ?? null,
    knowledge_bank: row.knowledge_bank ?? null,
    guest_intelligence: row.guest_intelligence ?? null,
    conversation_axes: row.conversation_axes ?? null,
    episode_flow: row.episode_flow ?? null,
    question_system: row.question_system ?? null,
    host_instructions: row.host_instructions ?? null,
    quotes_references: row.quotes_references ?? null,
    viral_moments: row.viral_moments ?? null,
    sections_status: (row.sections_status ?? {}) as PreparationSectionsStatus,
    status: (row.status as PreparationStatus) ?? "draft",
    approved_at: toIso(row.approved_at),
    live_token_hash: row.live_token_hash,
    live_state: row.live_state ?? null,
    linked_episode_id: row.linked_episode_id,
    archived_at: toIso(row.archived_at),
    deleted_at: toIso(row.deleted_at),
    created_by: row.created_by,
    created_at: toIso(row.created_at) ?? new Date().toISOString(),
    updated_at: toIso(row.updated_at) ?? new Date().toISOString(),
  }
}

function toLiveView(p: EpisodePreparation): EpisodePreparationLiveView {
  return {
    id: p.id,
    title: p.title,
    guest_name: p.guest_name,
    tone_type: p.tone_type,
    expected_duration_min: p.expected_duration_min,
    executive_summary: p.executive_summary,
    episode_flow: p.episode_flow,
    question_system: p.question_system,
    host_instructions: p.host_instructions,
    viral_moments: p.viral_moments,
    live_state: p.live_state,
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export type PreparationListFilter = "active" | "archived" | "all"

export async function listPreparations(
  filter: PreparationListFilter = "active",
): Promise<EpisodePreparation[]> {
  // Never return soft-deleted rows through the normal listing.
  const notDeleted = isNull(episodePreparations.deleted_at)

  const where =
    filter === "archived"
      ? and(notDeleted, isNotNull(episodePreparations.archived_at))
      : filter === "active"
        ? and(notDeleted, isNull(episodePreparations.archived_at))
        : notDeleted // "all" — everything except soft-deleted

  const rows = await db!
    .select()
    .from(episodePreparations)
    .where(where)
    .orderBy(desc(episodePreparations.updated_at))
    .limit(200)
  return rows.map(mapRow)
}

export async function getPreparationById(id: string): Promise<EpisodePreparation | null> {
  const rows = await db!
    .select()
    .from(episodePreparations)
    .where(and(eq(episodePreparations.id, id), isNull(episodePreparations.deleted_at)))
    .limit(1)
  const row = rows[0]
  return row ? mapRow(row) : null
}

export async function getPreparationByLiveToken(
  token: string,
): Promise<EpisodePreparationLiveView | null> {
  const hash = hashLiveToken(token)
  const rows = await db!
    .select()
    .from(episodePreparations)
    .where(eq(episodePreparations.live_token_hash, hash))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const prep = mapRow(row)
  if (prep.status !== "approved") return null
  return toLiveView(prep)
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createPreparation(input: {
  inputs: PreparationInputs
  guest_identity: PreparationGuestIdentity
  created_by: string
}): Promise<EpisodePreparation> {
  const [row] = await db!
    .insert(episodePreparations)
    .values({
      title: input.inputs.title || "إعداد جديد",
      guest_name: input.inputs.guest_name,
      guest_description: input.inputs.guest_description,
      guest_profile_link: input.inputs.guest_profile_link,
      guest_identity: input.guest_identity,
      short_description: input.inputs.short_description,
      episode_goal: input.inputs.episode_goal,
      key_questions: input.inputs.key_questions ?? [],
      tone_type: input.inputs.tone_type,
      focus_mode: input.inputs.focus_mode,
      expected_duration_min: input.inputs.expected_duration_min,
      depth_level: input.inputs.depth_level ?? 3,
      boldness_level: input.inputs.boldness_level ?? 3,
      content_focus: input.inputs.content_focus ?? [],
      inputs_meta: input.inputs.meta ?? null,
      sections_status: {},
      status: "draft",
      created_by: input.created_by,
    })
    .returning()
  return mapRow(row)
}

/**
 * Persist a confirmed identity onto an existing preparation AND wipe every
 * downstream artifact in a single UPDATE. Used by the re-identify flow.
 *
 * Changing the identity invalidates all research and every editorial section
 * because they were produced against the previous person. We also force the
 * preparation back to `draft` and null the live token so stale content can
 * never be generated or consumed.
 *
 * Fields preserved: title, guest_description, short_description, episode_goal,
 * key_questions, tone_type, focus_mode, expected_duration_min, depth_level,
 * boldness_level, content_focus, inputs_meta, linked_episode_id, created_by.
 */
export async function setGuestIdentity(
  id: string,
  identity: PreparationGuestIdentity,
): Promise<EpisodePreparation | null> {
  const [row] = await db!
    .update(episodePreparations)
    .set({
      guest_identity: identity,
      guest_name: identity.name,
      guest_profile_link: identity.profile_link,
      // Wipe research + every editorial section — they were produced for the
      // previous person and must not survive.
      research_data: null,
      executive_summary: null,
      knowledge_bank: null,
      guest_intelligence: null,
      conversation_axes: null,
      episode_flow: null,
      question_system: null,
      host_instructions: null,
      quotes_references: null,
      viral_moments: null,
      sections_status: {},
      status: "draft",
      approved_at: null,
      // Nuke the live token — an approved record cannot survive an identity
      // change, so any outstanding live URL stops working immediately.
      live_token_hash: null,
      live_state: null,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

/**
 * Wipe research + every editorial section + the live token, and force the
 * preparation back to `draft`. Used when an anchoring input (e.g. the guest
 * description used as the research query anchor) changes, making the existing
 * research corpus stale. Inputs themselves are preserved — the caller is
 * expected to have already updated them.
 */
export async function wipeResearchAndDownstream(
  id: string,
): Promise<EpisodePreparation | null> {
  const [row] = await db!
    .update(episodePreparations)
    .set({
      research_data: null,
      executive_summary: null,
      knowledge_bank: null,
      guest_intelligence: null,
      conversation_axes: null,
      episode_flow: null,
      question_system: null,
      host_instructions: null,
      quotes_references: null,
      viral_moments: null,
      sections_status: {},
      status: "draft",
      approved_at: null,
      live_token_hash: null,
      live_state: null,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

export async function updatePreparationInputs(
  id: string,
  inputs: Partial<PreparationInputs>,
): Promise<EpisodePreparation | null> {
  const patch: Partial<typeof episodePreparations.$inferInsert> = { updated_at: new Date() }
  if (inputs.title !== undefined) patch.title = inputs.title
  if (inputs.guest_name !== undefined) patch.guest_name = inputs.guest_name
  if (inputs.guest_description !== undefined) patch.guest_description = inputs.guest_description
  if (inputs.guest_profile_link !== undefined)
    patch.guest_profile_link = inputs.guest_profile_link
  if (inputs.short_description !== undefined) patch.short_description = inputs.short_description
  if (inputs.episode_goal !== undefined) patch.episode_goal = inputs.episode_goal
  if (inputs.key_questions !== undefined) patch.key_questions = inputs.key_questions
  if (inputs.tone_type !== undefined) patch.tone_type = inputs.tone_type
  if (inputs.focus_mode !== undefined) patch.focus_mode = inputs.focus_mode
  if (inputs.expected_duration_min !== undefined)
    patch.expected_duration_min = inputs.expected_duration_min
  if (inputs.depth_level !== undefined) patch.depth_level = inputs.depth_level
  if (inputs.boldness_level !== undefined) patch.boldness_level = inputs.boldness_level
  if (inputs.content_focus !== undefined) patch.content_focus = inputs.content_focus

  const [row] = await db!
    .update(episodePreparations)
    .set(patch)
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

const SECTION_COLUMN: Record<PreparationSectionKey, keyof typeof episodePreparations.$inferInsert> = {
  research: "research_data",
  executive_summary: "executive_summary",
  knowledge_bank: "knowledge_bank",
  guest_intelligence: "guest_intelligence",
  conversation_axes: "conversation_axes",
  episode_flow: "episode_flow",
  question_system: "question_system",
  host_instructions: "host_instructions",
  quotes_references: "quotes_references",
  viral_moments: "viral_moments",
}

export async function setPreparationSection(
  id: string,
  section: PreparationSectionKey,
  data: unknown,
  current: PreparationSectionsStatus,
): Promise<EpisodePreparation | null> {
  const col = SECTION_COLUMN[section]
  const nextStatus: PreparationSectionsStatus = {
    ...current,
    [section]: { status: "ready", updated_at: new Date().toISOString() },
  }
  const [row] = await db!
    .update(episodePreparations)
    // Drizzle types are narrow here; casting is safe because col is constrained.
    .set({ [col]: data, sections_status: nextStatus, updated_at: new Date() } as Partial<
      typeof episodePreparations.$inferInsert
    >)
    .where(eq(episodePreparations.id, id))
    .returning()
  if (!row) return null
  const updated = mapRow(row)

  // Auto-transition the workflow based on what's now present.
  const auto = computeAutoStatus(updated)
  if (auto !== updated.status) {
    const [bumped] = await db!
      .update(episodePreparations)
      .set({ status: auto, updated_at: new Date() })
      .where(eq(episodePreparations.id, id))
      .returning()
    await syncEirForPrepRow(bumped, auto)
    return bumped ? mapRow(bumped) : updated
  }
  return updated
}

/**
 * Write a research payload AND mark its section_status as `error` atomically.
 *
 * Used when the pipeline produced a technically-valid `PreparationResearch`
 * object but the result is unusable (empty sources, all claims rejected, etc.).
 * This avoids the brief window — present in the naive "write ready then flip
 * to error" approach — where a concurrent reader sees a fake "ready" state.
 *
 * Does NOT auto-bump status: the caller owns the demotion decision and will
 * call `forceSetStatus` (and optionally `clearLiveToken`) afterwards.
 */
export async function writeResearchErrorState(
  id: string,
  research: unknown,
  reason: string,
  current: PreparationSectionsStatus,
): Promise<EpisodePreparation | null> {
  const nextStatus: PreparationSectionsStatus = {
    ...current,
    research: { status: "error", error: reason, updated_at: new Date().toISOString() },
  }
  const [row] = await db!
    .update(episodePreparations)
    .set({
      research_data: research as typeof episodePreparations.$inferInsert.research_data,
      sections_status: nextStatus,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

export async function setSectionStatus(
  id: string,
  section: PreparationSectionKey,
  status: PreparationSectionStatus,
  error?: string,
): Promise<void> {
  const current = await getPreparationById(id)
  if (!current) return
  const nextStatus: PreparationSectionsStatus = {
    ...current.sections_status,
    [section]: { status, error, updated_at: new Date().toISOString() },
  }
  await db!
    .update(episodePreparations)
    .set({ sections_status: nextStatus, updated_at: new Date() })
    .where(eq(episodePreparations.id, id))
}

/**
 * Sync the linked EIR phase after ANY prep status change. Monotonic +
 * non-blocking: a sync failure never fails the status write, and the EIR is
 * never dragged backward. Every function that writes `episode_preparations.status`
 * must call this — otherwise the EIR silently stalls (the bug this replaced:
 * only manual review/approve synced, so a fully-prepared episode stayed at the
 * `researching` phase forever).
 */
async function syncEirForPrepRow(
  row: PrepRow | undefined,
  status: PreparationStatus,
): Promise<void> {
  if (!row?.eir_id) return
  try {
    const { syncEirFromPrepStatus } = await import("@/lib/khat-brain")
    await syncEirFromPrepStatus({ eirId: row.eir_id, status })
  } catch (err) {
    console.error("[khat-brain] prep status sync failed:", err)
  }
}

export async function updatePreparationStatus(
  id: string,
  status: PreparationStatus,
): Promise<EpisodePreparation | null> {
  const patch: Partial<typeof episodePreparations.$inferInsert> = {
    status,
    updated_at: new Date(),
  }
  if (status === "approved") patch.approved_at = new Date()
  const [row] = await db!
    .update(episodePreparations)
    .set(patch)
    .where(eq(episodePreparations.id, id))
    .returning()

  // Sync EIR phase after the row update so it never advances ahead of the
  // recorded prep status.
  await syncEirForPrepRow(row, status)

  return row ? mapRow(row) : null
}

export async function setLiveTokenHash(
  id: string,
  hash: string,
): Promise<EpisodePreparation | null> {
  const initialLive: PreparationLiveState = {
    started_at: null,
    current_phase: null,
    used_question_ids: [],
    energy_level: 3,
    notes: "",
    updated_at: new Date().toISOString(),
  }
  const [row] = await db!
    .update(episodePreparations)
    .set({ live_token_hash: hash, live_state: initialLive, updated_at: new Date() })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

/**
 * Rotate the live token: replace the stored hash atomically and reset the
 * live_state. Returns the updated record so the caller can confirm the swap
 * landed. The old token's hash is overwritten in the same UPDATE, so there
 * is no window where both tokens work.
 */
export async function rotateLiveTokenHash(
  id: string,
  newHash: string,
): Promise<EpisodePreparation | null> {
  const freshLive: PreparationLiveState = {
    started_at: null,
    current_phase: null,
    used_question_ids: [],
    energy_level: 3,
    notes: "",
    updated_at: new Date().toISOString(),
  }
  const [row] = await db!
    .update(episodePreparations)
    .set({
      live_token_hash: newHash,
      live_state: freshLive,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

/**
 * Clear the live token entirely (used when the preparation is manually reset
 * to `draft`). Any outstanding live URL stops working immediately because
 * `getPreparationByLiveToken` requires an `approved` record AND a matching
 * hash lookup; both are now false.
 */
export async function clearLiveToken(
  id: string,
): Promise<EpisodePreparation | null> {
  const [row] = await db!
    .update(episodePreparations)
    .set({ live_token_hash: null, live_state: null, updated_at: new Date() })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

export async function updateLiveStateByToken(
  token: string,
  patch: Partial<PreparationLiveState>,
): Promise<PreparationLiveState | null> {
  const hash = hashLiveToken(token)
  const rows = await db!
    .select()
    .from(episodePreparations)
    .where(eq(episodePreparations.live_token_hash, hash))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  // Gate writes by the same contract as reads: only approved preparations
  // accept live state mutations. A demoted record must not accept writes
  // even if a stale client still holds the raw token.
  if (row.status !== "approved") return null
  const prev: PreparationLiveState = row.live_state ?? {
    started_at: null,
    current_phase: null,
    used_question_ids: [],
    energy_level: 3,
    notes: "",
    updated_at: new Date().toISOString(),
  }
  const next: PreparationLiveState = {
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  await db!
    .update(episodePreparations)
    .set({ live_state: next, updated_at: new Date() })
    .where(eq(episodePreparations.id, row.id))
  return next
}

// ─── Lifecycle: archive / restore / soft-delete ──────────────────────────────

export async function archivePreparation(id: string): Promise<EpisodePreparation | null> {
  // Archiving an approved preparation must also revoke the live token so the
  // public /prepare/live endpoint stops working immediately.
  const [row] = await db!
    .update(episodePreparations)
    .set({
      archived_at: new Date(),
      live_token_hash: null,
      live_state: null,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

export async function restorePreparation(id: string): Promise<EpisodePreparation | null> {
  const [row] = await db!
    .update(episodePreparations)
    .set({ archived_at: null, updated_at: new Date() })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

export async function softDeletePreparation(id: string): Promise<EpisodePreparation | null> {
  const [row] = await db!
    .update(episodePreparations)
    .set({
      deleted_at: new Date(),
      live_token_hash: null,
      live_state: null,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, id))
    .returning()
  return row ? mapRow(row) : null
}

export async function deletePreparation(id: string): Promise<boolean> {
  const result = await db!
    .delete(episodePreparations)
    .where(eq(episodePreparations.id, id))
    .returning({ id: episodePreparations.id })
  return result.length > 0
}
