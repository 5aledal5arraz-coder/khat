/**
 * Phase X Step 5 — Live Recording V2 action implementations.
 *
 * Pure DB-side logic, no auth gating. The server actions in
 * app/admin/recording/[roomId]/v2/actions.ts wrap these with
 * requireAdmin() so the surface stays minimal and the smoke can call
 * the implementations directly without monkey-patching read-only ES
 * module exports.
 */

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  collaborationRooms,
  roomParticipants,
  roomSessionMarkers,
} from "@/lib/db/schema/collaboration"
import { syncEirFromRoomStatus } from "@/lib/khat-brain"
import type { SectionKind } from "@/lib/preparation/v2/types"
import { QUICK_MARKER_TYPES, type QuickMarkerType } from "./marker-types"

export const ALLOWED_MARKER_TYPES = QUICK_MARKER_TYPES
export type LiveV2MarkerType = QuickMarkerType

// ─── Helpers ──────────────────────────────────────────────────────────

async function ensureParticipant(
  roomId: string,
  userId: string,
  displayName: string,
): Promise<string> {
  const scoped = await db!
    .select({ id: roomParticipants.id })
    .from(roomParticipants)
    .where(eq(roomParticipants.room_id, roomId))
  // The unique key is (room_id, user_id). Drizzle doesn't expose a
  // single-condition AND helper inline cleanly; do the join in code:
  const matching = scoped.find(async (p) => {
    const [check] = await db!
      .select({ user_id: roomParticipants.user_id })
      .from(roomParticipants)
      .where(eq(roomParticipants.id, p.id))
      .limit(1)
    return check?.user_id === userId
  })
  if (matching) {
    // Re-resolve synchronously (the find above can't await) — second pass.
    for (const p of scoped) {
      const [check] = await db!
        .select({ user_id: roomParticipants.user_id })
        .from(roomParticipants)
        .where(eq(roomParticipants.id, p.id))
        .limit(1)
      if (check?.user_id === userId) return p.id
    }
  }
  const [row] = await db!
    .insert(roomParticipants)
    .values({
      room_id: roomId,
      user_id: userId,
      display_name: displayName,
      role: "director",
      is_online: true,
    })
    .returning({ id: roomParticipants.id })
  return row.id
}

async function loadRoom(roomId: string) {
  const [room] = await db!
    .select()
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, roomId))
    .limit(1)
  return room ?? null
}

// ─── Timer ─────────────────────────────────────────────────────────────

export async function startTimer(roomId: string) {
  const now = new Date()
  await db!
    .update(collaborationRooms)
    .set({
      status: "live",
      recording_started_at: now,
      recording_paused_at: null,
      recording_ended_at: null,
      updated_at: now,
    })
    .where(eq(collaborationRooms.id, roomId))
  const room = await loadRoom(roomId)
  if (room?.eir_id) {
    await syncEirFromRoomStatus({ eirId: room.eir_id, status: "live" })
  }
  return { ok: true as const }
}

export async function pauseTimer(roomId: string) {
  const now = new Date()
  const room = await loadRoom(roomId)
  if (!room) return { ok: false as const, error: "room_not_found" }
  const liveElapsedMs =
    room.recording_started_at && !room.recording_paused_at
      ? Math.max(0, now.getTime() - room.recording_started_at.getTime())
      : 0
  const elapsed_ms = room.recording_elapsed_ms + liveElapsedMs
  await db!
    .update(collaborationRooms)
    .set({
      status: "paused",
      recording_paused_at: now,
      recording_elapsed_ms: elapsed_ms,
      updated_at: now,
    })
    .where(eq(collaborationRooms.id, roomId))
  if (room.eir_id) {
    await syncEirFromRoomStatus({ eirId: room.eir_id, status: "paused" })
  }
  // Return the authoritative banked elapsed so the client can align its
  // local baseline exactly (avoids an RTT-sized drift until the next reload).
  return { ok: true as const, elapsed_ms }
}

export async function resumeTimer(roomId: string) {
  const now = new Date()
  await db!
    .update(collaborationRooms)
    .set({
      status: "live",
      recording_started_at: now,
      recording_paused_at: null,
      updated_at: now,
    })
    .where(eq(collaborationRooms.id, roomId))
  const room = await loadRoom(roomId)
  if (room?.eir_id) {
    await syncEirFromRoomStatus({ eirId: room.eir_id, status: "live" })
  }
  return { ok: true as const }
}

export async function resetTimer(roomId: string) {
  const now = new Date()
  await db!
    .update(collaborationRooms)
    .set({
      status: "waiting",
      recording_started_at: null,
      recording_paused_at: null,
      recording_ended_at: null,
      recording_elapsed_ms: 0,
      updated_at: now,
    })
    .where(eq(collaborationRooms.id, roomId))
  return { ok: true as const }
}

export async function endTimer(roomId: string) {
  const now = new Date()
  const room = await loadRoom(roomId)
  if (!room) return { ok: false as const, error: "room_not_found" }
  const liveElapsedMs =
    room.recording_started_at && !room.recording_paused_at
      ? Math.max(0, now.getTime() - room.recording_started_at.getTime())
      : 0
  const elapsed_ms = room.recording_elapsed_ms + liveElapsedMs
  await db!
    .update(collaborationRooms)
    .set({
      status: "ended",
      recording_ended_at: now,
      recording_elapsed_ms: elapsed_ms,
      updated_at: now,
    })
    .where(eq(collaborationRooms.id, roomId))
  if (room.eir_id) {
    await syncEirFromRoomStatus({ eirId: room.eir_id, status: "ended" })
  }
  return { ok: true as const, elapsed_ms }
}

// ─── Flow ──────────────────────────────────────────────────────────────

export async function setCurrentSection(input: {
  roomId: string
  index: number
  key: SectionKind
}) {
  await db!
    .update(collaborationRooms)
    .set({
      current_section_key: input.key,
      current_section_index: input.index,
      updated_at: new Date(),
    })
    .where(eq(collaborationRooms.id, input.roomId))
  return { ok: true as const }
}

/**
 * Toggle a prep_v2 question's "asked/covered" state on the room. Read–modify–
 * write the jsonb array and return the new set so the caller can broadcast it.
 */
export async function toggleQuestionDone(input: {
  roomId: string
  questionId: string
}) {
  // Atomic toggle in a single UPDATE — no read-modify-write race if two toggles
  // land concurrently. Adds the id if absent, removes it if present, and returns
  // the authoritative array so the client can reconcile its optimistic state.
  const arr = JSON.stringify([input.questionId])
  const [row] = await db!
    .update(collaborationRooms)
    .set({
      completed_question_ids: sql`(case
        when ${collaborationRooms.completed_question_ids} @> ${arr}::jsonb
          then ${collaborationRooms.completed_question_ids} - ${input.questionId}
        else ${collaborationRooms.completed_question_ids} || ${arr}::jsonb
      end)`,
      updated_at: new Date(),
    })
    .where(eq(collaborationRooms.id, input.roomId))
    .returning({ completed: collaborationRooms.completed_question_ids })

  if (!row) return { ok: false as const, error: "room_not_found" }
  const completed = Array.isArray(row.completed) ? (row.completed as string[]) : []
  return { ok: true as const, completed, done: completed.includes(input.questionId) }
}

// ─── Notes ─────────────────────────────────────────────────────────────

export async function saveDirectorNotes(input: {
  roomId: string
  notes: string
}) {
  await db!
    .update(collaborationRooms)
    .set({
      director_notes: input.notes,
      updated_at: new Date(),
    })
    .where(eq(collaborationRooms.id, input.roomId))
  return { ok: true as const }
}

// ─── Markers ───────────────────────────────────────────────────────────

export async function createMarker(input: {
  roomId: string
  markerType: LiveV2MarkerType
  label: string
  note?: string | null
  sectionKey?: SectionKind | null
  authorUserId: string
  authorDisplayName: string
}) {
  if (!ALLOWED_MARKER_TYPES.includes(input.markerType)) {
    return { ok: false as const, error: "invalid_marker_type" }
  }
  const room = await loadRoom(input.roomId)
  if (!room) return { ok: false as const, error: "room_not_found" }

  const now = new Date()
  let liveElapsedMs = 0
  if (room.recording_started_at && !room.recording_paused_at) {
    liveElapsedMs = Math.max(0, now.getTime() - room.recording_started_at.getTime())
  }
  const recording_ms = room.recording_elapsed_ms + liveElapsedMs

  const participantId = await ensureParticipant(
    input.roomId,
    input.authorUserId,
    input.authorDisplayName,
  )

  const [row] = await db!
    .insert(roomSessionMarkers)
    .values({
      room_id: input.roomId,
      author_id: participantId,
      marker_type: input.markerType,
      label: input.label,
      note: input.note ?? null,
      recording_ms,
      section_key: input.sectionKey ?? room.current_section_key ?? null,
    } as never)
    .returning({ id: roomSessionMarkers.id })

  return { ok: true as const, marker_id: row.id, recording_ms }
}
