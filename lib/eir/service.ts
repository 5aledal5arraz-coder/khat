/**
 * Khat Brain — Episode Intelligence Record service.
 *
 * The single API for creating, reading, listing, and transitioning EIRs.
 * Every other subsystem (Khat Map, preparation, recording, studio,
 * publishing, performance) calls into this module rather than touching
 * the table directly. The state machine in `./transitions.ts` is enforced
 * here — server actions and API routes get clean errors when callers
 * attempt invalid moves.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  episodeIntelligenceRecords,
  eirPhaseTransitions,
  type EditorialIntent,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import type {
  KhatMapTopicDomain,
  KhatMapEpisodeType,
  KhatMapRiskLevel,
  KhatMapEffortLevel,
} from "@/types/khat-map"
import { assertAllowedTransition } from "./transitions"
// Phase 1.3 — JSONB validation wrapper. REPORT mode by default.
import {
  validateJsonbWrite,
  editorialIntentSchema,
  EDITORIAL_INTENT_COLUMN,
  EDITORIAL_INTENT_TABLE,
} from "@/lib/db/validators"
// Phase 2.3.b — unified event log. Fire-and-forget per emit contract;
// failures are caught inside emitSystemEvent and never propagate here.
import { emitSystemEvent } from "@/lib/system-events/emit"
import { buildEirTransitionEvent } from "@/lib/system-events/builders"

type EirRow = typeof episodeIntelligenceRecords.$inferSelect

export interface EpisodeIntelligenceRecord {
  id: string
  phase: EpisodePhase
  season_id: string | null
  working_title: string
  final_title: string | null
  topic_domain: KhatMapTopicDomain | null
  episode_type: KhatMapEpisodeType | null
  topic_angle_code: string | null
  guest_id: string | null
  editorial_intent: EditorialIntent
  risk_level: KhatMapRiskLevel | null
  effort_level: KhatMapEffortLevel | null
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

function mapRow(row: EirRow): EpisodeIntelligenceRecord {
  return {
    id: row.id,
    phase: row.phase as EpisodePhase,
    season_id: row.season_id,
    working_title: row.working_title,
    final_title: row.final_title,
    topic_domain: row.topic_domain,
    episode_type: row.episode_type,
    topic_angle_code: row.topic_angle_code,
    guest_id: row.guest_id,
    editorial_intent: (row.editorial_intent ?? {}) as EditorialIntent,
    risk_level: row.risk_level,
    effort_level: row.effort_level,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    archived_at: row.archived_at ? row.archived_at.toISOString() : null,
  }
}

// ─── Create ────────────────────────────────────────────────────────────

export interface CreateEirInput {
  working_title: string
  /** Defaults to "idea". Useful for seeding tests at a specific phase. */
  phase?: EpisodePhase
  season_id?: string | null
  topic_domain?: KhatMapTopicDomain | null
  episode_type?: KhatMapEpisodeType | null
  topic_angle_code?: string | null
  guest_id?: string | null
  editorial_intent?: EditorialIntent
  risk_level?: KhatMapRiskLevel | null
  effort_level?: KhatMapEffortLevel | null
  created_by?: string | null
}

export async function createEpisodeIntelligenceRecord(
  input: CreateEirInput,
): Promise<EpisodeIntelligenceRecord> {
  const phase = input.phase ?? "idea"

  // Phase 1.3 — validate editorial_intent. REPORT mode never throws;
  // ENFORCE mode would throw JsonbValidationError that the caller can
  // catch. The value passed through is always byte-equivalent to the
  // input on the success path.
  const editorialIntentValue = (input.editorial_intent ?? {}) as EditorialIntent
  validateJsonbWrite(
    { table: EDITORIAL_INTENT_TABLE, column: EDITORIAL_INTENT_COLUMN, rowId: null },
    editorialIntentValue,
    editorialIntentSchema,
  )

  const [row] = await db!
    .insert(episodeIntelligenceRecords)
    .values({
      phase,
      working_title: input.working_title,
      season_id: input.season_id ?? null,
      topic_domain: input.topic_domain ?? null,
      episode_type: input.episode_type ?? null,
      topic_angle_code: input.topic_angle_code ?? null,
      guest_id: input.guest_id ?? null,
      editorial_intent: editorialIntentValue,
      risk_level: input.risk_level ?? null,
      effort_level: input.effort_level ?? null,
      created_by: input.created_by ?? null,
    })
    .returning()

  // Seed transition log with the initial phase (from = null).
  await db!.insert(eirPhaseTransitions).values({
    eir_id: row.id,
    from_phase: null,
    to_phase: phase,
    actor_id: input.created_by ?? null,
    reason: "created",
    metadata: null,
  })

  // P2.3.b — mirror to unified event log. Fire-and-forget; the emit
  // helper's hard contract guarantees no exception propagates.
  void emitSystemEvent(
    buildEirTransitionEvent({
      eir_id: row.id,
      from_phase: null,
      to_phase: phase,
      actor: input.created_by ?? null,
    }),
  )

  return mapRow(row)
}

// ─── Read ──────────────────────────────────────────────────────────────

export async function getEpisodeIntelligenceRecord(
  id: string,
): Promise<EpisodeIntelligenceRecord | null> {
  const rows = await db!
    .select()
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.id, id))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

export interface ListEirOptions {
  phase?: EpisodePhase
  season_id?: string
  guest_id?: string
  /** Default true — exclude archived rows. */
  exclude_archived?: boolean
  limit?: number
  offset?: number
}

export async function listEpisodeIntelligenceRecords(
  opts: ListEirOptions = {},
): Promise<EpisodeIntelligenceRecord[]> {
  const conditions = []
  if (opts.phase) conditions.push(eq(episodeIntelligenceRecords.phase, opts.phase))
  if (opts.season_id) conditions.push(eq(episodeIntelligenceRecords.season_id, opts.season_id))
  if (opts.guest_id) conditions.push(eq(episodeIntelligenceRecords.guest_id, opts.guest_id))
  if (opts.exclude_archived !== false) {
    conditions.push(isNull(episodeIntelligenceRecords.archived_at))
  }

  const rows = await db!
    .select()
    .from(episodeIntelligenceRecords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(episodeIntelligenceRecords.updated_at))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0)
  return rows.map(mapRow)
}

// ─── Set guest ─────────────────────────────────────────────────────────

export interface SetEirGuestInput {
  eir_id: string
  guest_id: string | null
}

/**
 * Update the EIR's linked guest. Does not advance phase — callers
 * typically pair this with `walkEirToPhase` to move to `guest_assigned`.
 */
export async function setEpisodeIntelligenceGuest(
  input: SetEirGuestInput,
): Promise<EpisodeIntelligenceRecord> {
  const current = await getEpisodeIntelligenceRecord(input.eir_id)
  if (!current) {
    throw new Error(`EIR not found: ${input.eir_id}`)
  }
  await db!
    .update(episodeIntelligenceRecords)
    .set({
      guest_id: input.guest_id,
      updated_at: new Date(),
    })
    .where(eq(episodeIntelligenceRecords.id, input.eir_id))
  const next = await getEpisodeIntelligenceRecord(input.eir_id)
  if (!next) throw new Error("EIR vanished after guest assignment")
  return next
}

// ─── Transition ────────────────────────────────────────────────────────

export interface TransitionInput {
  eir_id: string
  to_phase: EpisodePhase
  actor_id?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Move an EIR to a new phase. Validates the transition is allowed and
 * appends to the audit log atomically. Throws InvalidPhaseTransitionError
 * if the move is not in the state machine.
 *
 * Returns the updated EIR.
 */
export async function transitionEpisodePhase(
  input: TransitionInput,
): Promise<EpisodeIntelligenceRecord> {
  const current = await getEpisodeIntelligenceRecord(input.eir_id)
  if (!current) {
    throw new Error(`EIR not found: ${input.eir_id}`)
  }

  // Idempotent no-op — same phase, no audit row, no error.
  if (current.phase === input.to_phase) return current

  assertAllowedTransition(current.phase, input.to_phase)

  // Single-statement update + transition row inside a transaction.
  await db!.transaction(async (tx) => {
    const archive = input.to_phase === "archived" ? new Date() : undefined
    await tx
      .update(episodeIntelligenceRecords)
      .set({
        phase: input.to_phase,
        updated_at: new Date(),
        ...(archive ? { archived_at: archive } : {}),
      })
      .where(eq(episodeIntelligenceRecords.id, input.eir_id))

    await tx.insert(eirPhaseTransitions).values({
      eir_id: input.eir_id,
      from_phase: current.phase,
      to_phase: input.to_phase,
      actor_id: input.actor_id ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
    })
  })

  // P2.3.b — mirror to unified event log. Placed post-commit so the
  // emit only fires on a successful transition. Fire-and-forget; the
  // emit helper's hard contract guarantees no exception propagates.
  void emitSystemEvent(
    buildEirTransitionEvent({
      eir_id: input.eir_id,
      from_phase: current.phase,
      to_phase: input.to_phase,
      actor: input.actor_id ?? null,
    }),
  )

  const next = await getEpisodeIntelligenceRecord(input.eir_id)
  if (!next) throw new Error("EIR vanished mid-transition")
  return next
}

// ─── Counts (for dashboards) ───────────────────────────────────────────

export async function countByPhase(): Promise<Record<EpisodePhase, number>> {
  const rows = await db!
    .select({
      phase: episodeIntelligenceRecords.phase,
      count: sql<number>`count(*)::int`,
    })
    .from(episodeIntelligenceRecords)
    .where(isNull(episodeIntelligenceRecords.archived_at))
    .groupBy(episodeIntelligenceRecords.phase)
  const out = {} as Record<EpisodePhase, number>
  for (const r of rows) out[r.phase as EpisodePhase] = Number(r.count)
  return out
}

// ─── Phase transition history ──────────────────────────────────────────

export interface PhaseTransitionEntry {
  id: string
  from_phase: EpisodePhase | null
  to_phase: EpisodePhase
  actor_id: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function getEpisodePhaseHistory(
  eir_id: string,
): Promise<PhaseTransitionEntry[]> {
  const rows = await db!
    .select()
    .from(eirPhaseTransitions)
    .where(eq(eirPhaseTransitions.eir_id, eir_id))
    .orderBy(desc(eirPhaseTransitions.created_at))
  return rows.map((r) => ({
    id: r.id,
    from_phase: r.from_phase as EpisodePhase | null,
    to_phase: r.to_phase as EpisodePhase,
    actor_id: r.actor_id,
    reason: r.reason,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    created_at: r.created_at.toISOString(),
  }))
}
