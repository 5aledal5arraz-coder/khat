/**
 * Studio Wave 2 — the episode-project repository.
 *
 * `studio_projects` is the parent row that links the three phases of a
 * produced episode (raw upload → review → publish) into ONE journey and
 * carries its `state`. This module is the ONLY write path to that table.
 *
 * The state machine is enforced here, not just documented: an illegal
 * jump throws (see `assertLegalStudioProjectTransition`). A same-state
 * transition is an idempotent no-op — job handlers (e.g. the episode-map
 * re-generate) may fire the same transition twice and must not fail.
 *
 * Style mirrors lib/studio/analysis-records.ts: a local mapped interface
 * (StudioProject), a mapRow(), and thin repository functions over db!.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  studioProjects,
  STUDIO_PROJECT_STATES,
  type StudioProjectState,
} from "@/lib/db/schema/studio-projects"

type Row = typeof studioProjects.$inferSelect

export interface StudioProject {
  id: string
  eir_id: string | null
  raw_session_id: string | null
  edited_session_id: string | null
  state: StudioProjectState
  created_at: string
  updated_at: string
}

function mapRow(r: Row): StudioProject {
  return {
    id: r.id,
    eir_id: r.eir_id,
    raw_session_id: r.raw_session_id,
    edited_session_id: r.edited_session_id,
    state: r.state as StudioProjectState,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }
}

// ─── State machine ───────────────────────────────────────────────────────────
//
// The legal forward edges of the journey. Terminal state (published) has
// none. Enforced by assertLegalStudioProjectTransition below — this is a
// quality gate, not a hint: skipping a state, or moving backward, throws.

export const LEGAL_STUDIO_PROJECT_TRANSITIONS: Record<
  StudioProjectState,
  readonly StudioProjectState[]
> = {
  draft: ["raw_uploaded"],
  raw_uploaded: ["mapped"],
  mapped: ["reviewed"],
  reviewed: ["finalized"],
  finalized: ["published"],
  published: [],
}

/**
 * True when `to` is reachable from `from` in ONE step. A same-state
 * transition (from === to) is treated as legal (idempotent no-op).
 */
export function isLegalStudioProjectTransition(
  from: StudioProjectState,
  to: StudioProjectState,
): boolean {
  if (from === to) return true
  return LEGAL_STUDIO_PROJECT_TRANSITIONS[from].includes(to)
}

/** Throws on an illegal transition. Used by transitionState + callers that
 *  want to validate before touching the DB. */
export function assertLegalStudioProjectTransition(
  from: StudioProjectState,
  to: StudioProjectState,
): void {
  if (!(STUDIO_PROJECT_STATES as readonly string[]).includes(to)) {
    throw new Error(`studio project: unknown target state "${to}"`)
  }
  if (!isLegalStudioProjectTransition(from, to)) {
    throw new Error(
      `studio project: illegal state transition "${from}" → "${to}"`,
    )
  }
}

// ─── Repository ──────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  /** The Phase-1 raw recording session (studio_sessions.id, uuid). */
  rawSessionId: string
  /** Spine link to the EIR, if known at creation. */
  eirId?: string | null
  /** Initial state. Defaults to raw_uploaded (the only creation path today). */
  state?: StudioProjectState
}

/**
 * Create a project for a freshly-uploaded raw session. Defaults to state
 * `raw_uploaded`. Does NOT dedup — the raw-upload path always creates a
 * brand-new session id, so a collision would be a programming error.
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<StudioProject> {
  if (!input.rawSessionId) {
    throw new Error("createProject: rawSessionId is required")
  }
  const state: StudioProjectState = input.state ?? "raw_uploaded"
  const [row] = await db!
    .insert(studioProjects)
    .values({
      raw_session_id: input.rawSessionId,
      eir_id: input.eirId ?? null,
      state,
    })
    .returning()
  return mapRow(row)
}

/**
 * Attach the Phase-2 (post-montage) edited session to an existing
 * project. This is the orphan fix: instead of the edited upload minting a
 * disconnected session, it becomes `edited_session_id` on the SAME
 * project the raw session created.
 *
 * Sets the FK only — it does NOT advance `state`. The `mapped → reviewed`
 * transition belongs to the review step (Wave 2, step 2+), because that
 * is when review actually happens; forcing `reviewed` here would be a lie
 * about what occurred. Throws if the project does not exist (callers
 * resolve the project first and only attach when one was found).
 */
export async function attachEditedSession(
  projectId: string,
  editedSessionId: string,
): Promise<StudioProject> {
  const [row] = await db!
    .update(studioProjects)
    .set({ edited_session_id: editedSessionId, updated_at: new Date() })
    .where(eq(studioProjects.id, projectId))
    .returning()
  if (!row) {
    throw new Error(`attachEditedSession: project ${projectId} not found`)
  }
  return mapRow(row)
}

export async function getProject(id: string): Promise<StudioProject | null> {
  const rows = await db!
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, id))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getProjectByRawSession(
  rawSessionId: string,
): Promise<StudioProject | null> {
  const rows = await db!
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.raw_session_id, rawSessionId))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getProjectByEditedSession(
  editedSessionId: string,
): Promise<StudioProject | null> {
  const rows = await db!
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.edited_session_id, editedSessionId))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

/**
 * Every project row. Small table (one per produced episode), read once by
 * the studio list so it can tag each raw/edited session with its project
 * phase — cheaper than an N-per-row lookup. Unordered; callers index it.
 */
export async function listProjects(): Promise<StudioProject[]> {
  const rows = await db!.select().from(studioProjects)
  return rows.map(mapRow)
}

/**
 * Move a project to `newState`, enforcing the legal state machine. A
 * same-state transition is an idempotent no-op (returns the row
 * unchanged) so a re-run of a job that stamps the same state doesn't
 * fail. An illegal jump throws — this is the quality gate.
 */
export async function transitionState(
  projectId: string,
  newState: StudioProjectState,
): Promise<StudioProject> {
  const current = await getProject(projectId)
  if (!current) {
    throw new Error(`transitionState: project ${projectId} not found`)
  }

  // Throws on an illegal jump; passes on a legal edge OR a same-state no-op.
  assertLegalStudioProjectTransition(current.state, newState)

  // Same-state: nothing to write.
  if (current.state === newState) return current

  const [row] = await db!
    .update(studioProjects)
    .set({ state: newState, updated_at: new Date() })
    .where(eq(studioProjects.id, projectId))
    .returning()
  if (!row) {
    throw new Error(`transitionState: project ${projectId} not found`)
  }
  return mapRow(row)
}
