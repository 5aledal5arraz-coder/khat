/**
 * Khat Brain Phase 5 — discovery_runs CRUD + transitions.
 */

import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  discoveryRuns,
  type DiscoveryArchetype,
  type DiscoveryRunStatus,
  type DiscoverySourceConfig,
} from "@/lib/db/schema/discovery"

type RunRow = typeof discoveryRuns.$inferSelect

/** Allowed status transitions for the discovery_runs state machine. */
const RUN_TRANSITIONS: Record<DiscoveryRunStatus, DiscoveryRunStatus[]> = {
  pending: ["seeding", "cancelled", "failed"],
  seeding: ["searching", "failed", "cancelled"],
  searching: ["verifying", "failed", "cancelled"],
  verifying: ["ranking", "failed", "cancelled"],
  ranking: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
}

export function canTransitionRun(
  from: DiscoveryRunStatus,
  to: DiscoveryRunStatus,
): boolean {
  return RUN_TRANSITIONS[from]?.includes(to) ?? false
}

export interface DiscoveryRunRecord {
  id: string
  season_id: string | null
  source_episode_candidate_id: string | null
  status: DiscoveryRunStatus
  seed_prompt: string | null
  archetypes: DiscoveryArchetype[] | null
  source_config: DiscoverySourceConfig | null
  candidate_count: number
  started_at: string | null
  completed_at: string | null
  created_by: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

function mapRow(r: RunRow): DiscoveryRunRecord {
  return {
    id: r.id,
    season_id: r.season_id,
    source_episode_candidate_id: r.source_episode_candidate_id,
    status: r.status as DiscoveryRunStatus,
    seed_prompt: r.seed_prompt,
    archetypes: (r.archetypes ?? null) as DiscoveryArchetype[] | null,
    source_config: (r.source_config ?? null) as DiscoverySourceConfig | null,
    candidate_count: r.candidate_count,
    started_at: r.started_at ? r.started_at.toISOString() : null,
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    created_by: r.created_by,
    error_message: r.error_message,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }
}

export interface CreateDiscoveryRunInput {
  season_id?: string | null
  /**
   * Phase B redesign — pin the run to a specific episode candidate so
   * results attach back to the right slot. Optional for legacy / season-
   * wide runs.
   */
  source_episode_candidate_id?: string | null
  seed_prompt?: string | null
  source_config?: DiscoverySourceConfig
  created_by?: string | null
}

export async function createDiscoveryRun(
  input: CreateDiscoveryRunInput,
): Promise<DiscoveryRunRecord> {
  const [row] = await db!
    .insert(discoveryRuns)
    .values({
      season_id: input.season_id ?? null,
      source_episode_candidate_id: input.source_episode_candidate_id ?? null,
      seed_prompt: input.seed_prompt ?? null,
      source_config: input.source_config ?? null,
      created_by: input.created_by ?? null,
    })
    .returning()
  return mapRow(row)
}

export async function getDiscoveryRun(
  id: string,
): Promise<DiscoveryRunRecord | null> {
  const rows = await db!
    .select()
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, id))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

export async function listDiscoveryRuns(
  opts: { limit?: number; status?: DiscoveryRunStatus } = {},
): Promise<DiscoveryRunRecord[]> {
  const conditions = []
  if (opts.status) conditions.push(eq(discoveryRuns.status, opts.status))
  const rows = await db!
    .select()
    .from(discoveryRuns)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(discoveryRuns.created_at))
    .limit(opts.limit ?? 50)
  return rows.map(mapRow)
}

export class InvalidDiscoveryTransitionError extends Error {
  constructor(public readonly from: DiscoveryRunStatus, public readonly to: DiscoveryRunStatus) {
    super(`Invalid discovery run transition: ${from} → ${to}`)
    this.name = "InvalidDiscoveryTransitionError"
  }
}

export async function transitionDiscoveryRun(input: {
  id: string
  to: DiscoveryRunStatus
  error?: string | null
  archetypes?: DiscoveryArchetype[]
  candidateCount?: number
}): Promise<DiscoveryRunRecord> {
  const current = await getDiscoveryRun(input.id)
  if (!current) throw new Error(`run not found: ${input.id}`)
  if (current.status === input.to) return current
  if (!canTransitionRun(current.status, input.to)) {
    throw new InvalidDiscoveryTransitionError(current.status, input.to)
  }

  const patch: Partial<typeof discoveryRuns.$inferInsert> = {
    status: input.to,
    updated_at: new Date(),
  }
  if (input.to === "seeding" && !current.started_at) {
    patch.started_at = new Date()
  }
  if (["completed", "failed", "cancelled"].includes(input.to)) {
    patch.completed_at = new Date()
  }
  if (input.error !== undefined) patch.error_message = input.error
  if (input.archetypes !== undefined) patch.archetypes = input.archetypes
  if (input.candidateCount !== undefined) patch.candidate_count = input.candidateCount

  const [row] = await db!
    .update(discoveryRuns)
    .set(patch)
    .where(eq(discoveryRuns.id, input.id))
    .returning()
  return mapRow(row)
}

export async function bumpCandidateCount(runId: string, delta: number): Promise<void> {
  await db!
    .update(discoveryRuns)
    .set({
      candidate_count: sql`${discoveryRuns.candidate_count} + ${delta}`,
      updated_at: new Date(),
    })
    .where(eq(discoveryRuns.id, runId))
}
