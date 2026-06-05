/**
 * Khat Brain — phase synchronization helpers.
 *
 * Centralized mapping from existing-system status enums to EIR phases,
 * plus idempotent walk helpers that the rest of the codebase calls when
 * it observes an upstream state change. The contract is: callers
 * describe the new state of *their* domain, this module decides whether
 * the EIR needs to advance and (if so) walks it through the state
 * machine.
 *
 * Crucially: walking is monotonic. If the EIR is already at the target
 * phase or further along the linear chain (or archived), this module
 * does nothing. That's what makes these helpers safe to call on every
 * UPDATE without polluting the audit log with redundant rows.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { collaborationRooms } from "@/lib/db/schema/collaboration"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodes } from "@/lib/db/schema/episodes"
import { studioSessions } from "@/lib/db/schema/studio"
import {
  EPISODE_PHASES,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import {
  getEpisodeIntelligenceRecord,
} from "@/lib/eir"
import { walkEirToPhase } from "./v2-bridge"

// ─── Status → phase mappings ───────────────────────────────────────────

export type CollaborationRoomStatus = "waiting" | "live" | "paused" | "ended"

export function roomStatusToPhase(
  status: CollaborationRoomStatus,
): EpisodePhase {
  switch (status) {
    case "waiting":
      return "ready_to_record"
    case "live":
    case "paused":
      // Paused stays in "recording" — the editorial state didn't go
      // backwards, the engineer just hit pause.
      return "recording"
    case "ended":
      return "recorded"
  }
}

export type PreparationStatus = "draft" | "reviewed" | "approved"

/**
 * Map preparation.status → EIR phase.
 *
 *   - draft     → researching   (research happens during prep work)
 *   - reviewed  → prepared      (host has reviewed the questions)
 *   - approved  → prepared      (also prepared; ready_to_record only
 *                                triggers when a live recording room
 *                                exists — that's a separate signal)
 *
 * Note: the brief asked for "approved → ready_to_record if there's a
 * linked live session." We model that as: approved sets `prepared`
 * unconditionally; the room-creation code separately bumps to
 * `ready_to_record`. That keeps each transition driven by exactly one
 * signal, which makes the audit log clean.
 */
export function prepStatusToPhase(status: PreparationStatus): EpisodePhase {
  switch (status) {
    case "draft":
      return "researching"
    case "reviewed":
    case "approved":
      return "prepared"
  }
}

// ─── Monotonic walk ────────────────────────────────────────────────────

/**
 * Walk the EIR forward to `targetPhase` IF AND ONLY IF the current
 * phase is strictly behind it on the linear chain. Returns:
 *   - "advanced" — we walked the EIR forward
 *   - "noop"     — already at target or further; no audit row written
 *   - "archived" — EIR is archived; we never reanimate
 *   - "missing"  — no such EIR
 */
export type WalkResult = "advanced" | "noop" | "archived" | "missing"

export async function walkForwardIfBehind(
  eirId: string | null | undefined,
  targetPhase: EpisodePhase,
  opts: { actorId?: string | null; reason?: string | null } = {},
): Promise<WalkResult> {
  if (!eirId) return "missing"
  const eir = await getEpisodeIntelligenceRecord(eirId)
  if (!eir) return "missing"
  if (eir.phase === "archived") return "archived"

  const currentIdx = EPISODE_PHASES.indexOf(eir.phase)
  const targetIdx = EPISODE_PHASES.indexOf(targetPhase)
  if (currentIdx < 0 || targetIdx < 0) return "noop"
  if (currentIdx >= targetIdx) return "noop"

  await walkEirToPhase({
    eirId,
    toPhase: targetPhase,
    actorId: opts.actorId ?? null,
    reason: opts.reason ?? null,
  })
  return "advanced"
}

// ─── Domain-specific syncers ───────────────────────────────────────────
//
// One per upstream system. Each is a thin wrapper around
// walkForwardIfBehind that picks the right target phase + reason string,
// keeping callers free of state-machine knowledge.

export async function syncEirFromRoomStatus(input: {
  eirId: string | null | undefined
  status: CollaborationRoomStatus
  actorId?: string | null
}): Promise<WalkResult> {
  return walkForwardIfBehind(input.eirId, roomStatusToPhase(input.status), {
    actorId: input.actorId,
    reason: `room:${input.status}`,
  })
}

export async function syncEirFromPrepStatus(input: {
  eirId: string | null | undefined
  status: PreparationStatus
  actorId?: string | null
}): Promise<WalkResult> {
  return walkForwardIfBehind(input.eirId, prepStatusToPhase(input.status), {
    actorId: input.actorId,
    reason: `prep:${input.status}`,
  })
}

export async function syncEirOnEpisodePublish(input: {
  eirId: string | null | undefined
  actorId?: string | null
}): Promise<WalkResult> {
  return walkForwardIfBehind(input.eirId, "published", {
    actorId: input.actorId,
    reason: "episode_published",
  })
}

export async function syncEirOnPerformanceWrite(input: {
  eirId: string | null | undefined
}): Promise<WalkResult> {
  return walkForwardIfBehind(input.eirId, "analyzing", {
    reason: "performance_synced",
  })
}

export async function syncEirOnStudioPushed(input: {
  eirId: string | null | undefined
  actorId?: string | null
}): Promise<WalkResult> {
  return walkForwardIfBehind(input.eirId, "ready_to_publish", {
    actorId: input.actorId,
    reason: "studio_package_pushed",
  })
}

// ─── Lookup helpers ────────────────────────────────────────────────────
//
// Resolving "what's the EIR for this preparation / studio session /
// episode" lives here so callers don't have to import the schema +
// hand-write the SELECT every time.

export async function getEirIdForPreparation(
  preparationId: string,
): Promise<string | null> {
  const rows = await db!
    .select({ eir_id: episodePreparations.eir_id })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, preparationId))
    .limit(1)
  return rows[0]?.eir_id ?? null
}

export async function getEirIdForRoom(roomId: string): Promise<string | null> {
  const rows = await db!
    .select({ eir_id: collaborationRooms.eir_id })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, roomId))
    .limit(1)
  return rows[0]?.eir_id ?? null
}

export async function getEirIdForStudioSession(
  sessionId: string,
): Promise<string | null> {
  const rows = await db!
    .select({ eir_id: studioSessions.eir_id })
    .from(studioSessions)
    .where(eq(studioSessions.id, sessionId))
    .limit(1)
  return rows[0]?.eir_id ?? null
}

export async function getEirIdForEpisode(
  episodeId: string,
): Promise<string | null> {
  const rows = await db!
    .select({ eir_id: episodes.eir_id })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)
  return rows[0]?.eir_id ?? null
}
