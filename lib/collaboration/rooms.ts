/**
 * Collaboration Rooms — CRUD + state operations.
 */

import { db } from "@/lib/db"
import {
  collaborationRooms,
  roomParticipants,
  roomCardState,
  roomCardNotes,
  roomSessionMarkers,
  interviewCards,
  cardMaterials,
} from "@/lib/db/schema"
import { eq, and, asc, inArray, lt } from "drizzle-orm"
import {
  getEirIdForPreparation,
  syncEirFromRoomStatus,
  walkForwardIfBehind,
} from "@/lib/khat-brain"
import type { CollaborationRoomStatus } from "@/lib/khat-brain"
import type {
  CollaborationRoom,
  CollaborationRoomSnapshot,
  CollaborationRoomListItem,
  RoomParticipant,
  RoomCardState,
  RoomCardNote,
  RoomSessionMarker,
  CreateRoomInput,
  UpdateRoomInput,
  CreateRoomNoteInput,
  CreateSessionMarkerInput,
  InterviewCardWithMaterials,
  CardMaterial,
  ParticipantRole,
} from "@/types/collaboration"

// ─── Rooms ──────────────────────────────────────────────────────────

export async function getRoomsByPreparation(preparationId: string): Promise<CollaborationRoomListItem[]> {
  const rows = await db!
    .select()
    .from(collaborationRooms)
    .where(eq(collaborationRooms.preparation_id, preparationId))
    .orderBy(asc(collaborationRooms.created_at))

  // Get participant counts
  const roomIds = rows.map((r) => r.id)
  if (roomIds.length === 0) return []

  const participants = await db!
    .select({ room_id: roomParticipants.room_id })
    .from(roomParticipants)
    .where(eq(roomParticipants.is_online, true))

  const countByRoom = new Map<string, number>()
  for (const p of participants) {
    if (roomIds.includes(p.room_id)) {
      countByRoom.set(p.room_id, (countByRoom.get(p.room_id) || 0) + 1)
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as CollaborationRoomListItem["status"],
    phase: r.phase,
    participants_count: countByRoom.get(r.id) || 0,
    created_at: r.created_at?.toISOString?.() ?? String(r.created_at),
  }))
}

export async function getRoomById(id: string): Promise<CollaborationRoom | null> {
  const [row] = await db!
    .select()
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, id))
    .limit(1)
  return row ? rowToRoom(row) : null
}

export async function getRoomSnapshot(roomId: string): Promise<CollaborationRoomSnapshot | null> {
  const room = await getRoomById(roomId)
  if (!room) return null

  // Fetch cards for the room's preparation (non-deleted)
  const cardRows = await db!
    .select()
    .from(interviewCards)
    .where(and(
      eq(interviewCards.preparation_id, room.preparation_id),
      eq(interviewCards.is_deleted, false),
    ))
    .orderBy(asc(interviewCards.sort_order))

  // Fetch all materials for those cards
  const cardIds = cardRows.map((c) => c.id)
  let materialRows: CardMaterial[] = []
  if (cardIds.length > 0) {
    const rawMaterials = await db!
      .select()
      .from(cardMaterials)
      .where(inArray(cardMaterials.card_id, cardIds))
      .orderBy(asc(cardMaterials.sort_order))
    materialRows = rawMaterials.map(rowToMaterial)
  }

  const materialsByCard = new Map<string, CardMaterial[]>()
  for (const m of materialRows) {
    const list = materialsByCard.get(m.card_id) || []
    list.push(m)
    materialsByCard.set(m.card_id, list)
  }

  const cards: InterviewCardWithMaterials[] = cardRows.map((c) => ({
    ...rowToCard(c),
    materials: materialsByCard.get(c.id) || [],
  }))

  // Fetch participants
  const participantRows = await db!
    .select()
    .from(roomParticipants)
    .where(eq(roomParticipants.room_id, roomId))

  // Fetch card states
  const cardStateRows = await db!
    .select()
    .from(roomCardState)
    .where(eq(roomCardState.room_id, roomId))

  // Fetch notes
  const noteRows = await db!
    .select()
    .from(roomCardNotes)
    .where(eq(roomCardNotes.room_id, roomId))
    .orderBy(asc(roomCardNotes.created_at))

  // Fetch session markers
  const markerRows = await db!
    .select()
    .from(roomSessionMarkers)
    .where(eq(roomSessionMarkers.room_id, roomId))
    .orderBy(asc(roomSessionMarkers.recording_ms))

  return {
    ...room,
    cards,
    participants: participantRows.map(rowToParticipant),
    card_states: cardStateRows.map(rowToCardState),
    notes: noteRows.map(rowToNote),
    markers: markerRows.map(rowToMarker),
  }
}

export async function createRoom(input: CreateRoomInput, createdBy: string): Promise<CollaborationRoom> {
  // Khat Brain — inherit EIR from the preparation. The room's existence
  // signals the episode is "ready_to_record"; the walker is monotonic so
  // it's a no-op when the EIR is already further along (e.g. recording).
  const eirId = await getEirIdForPreparation(input.preparation_id)

  const [row] = await db!
    .insert(collaborationRooms)
    .values({
      preparation_id: input.preparation_id,
      name: input.name,
      created_by: createdBy,
      eir_id: eirId,
    })
    .returning()

  if (eirId) {
    try {
      await walkForwardIfBehind(eirId, "ready_to_record", {
        actorId: createdBy,
        reason: "room_created",
      })
    } catch (err) {
      console.error("[khat-brain] room_created walk failed:", err)
    }
  }

  return rowToRoom(row)
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<CollaborationRoom | null> {
  const values: Record<string, unknown> = {}
  if (input.status !== undefined) values.status = input.status
  if (input.phase !== undefined) values.phase = input.phase
  if (input.energy_level !== undefined) values.energy_level = input.energy_level
  if (input.active_card_id !== undefined) values.active_card_id = input.active_card_id
  if (input.host_notes !== undefined) values.host_notes = input.host_notes
  if (input.recording_paused_at !== undefined) values.recording_paused_at = input.recording_paused_at
  if (input.recording_elapsed_ms !== undefined) values.recording_elapsed_ms = input.recording_elapsed_ms

  // ── Timer state machine (status transitions) ──────────────────
  if (input.status) {
    const current = await getRoomById(id)
    if (current) {
      const now = new Date()

      if (input.status === "live" && current.status === "waiting") {
        // Start: fresh recording
        values.recording_started_at = now
        values.recording_elapsed_ms = 0
        values.recording_paused_at = null
        values.recording_ended_at = null
      } else if (input.status === "live" && current.status === "paused") {
        // Resume: restart timer reference, keep accumulated elapsed
        values.recording_started_at = now
        values.recording_paused_at = null
      } else if (input.status === "paused" && current.status === "live") {
        // Pause: accumulate elapsed time
        const startedAt = current.recording_started_at ? new Date(current.recording_started_at).getTime() : now.getTime()
        values.recording_elapsed_ms = (current.recording_elapsed_ms || 0) + (now.getTime() - startedAt)
        values.recording_paused_at = now
      } else if (input.status === "ended") {
        // End: finalize elapsed time
        if (current.status === "live") {
          const startedAt = current.recording_started_at ? new Date(current.recording_started_at).getTime() : now.getTime()
          values.recording_elapsed_ms = (current.recording_elapsed_ms || 0) + (now.getTime() - startedAt)
        }
        values.recording_ended_at = now
        values.recording_paused_at = null
      } else if (input.status === "waiting") {
        // Reset: clear all timer state
        values.recording_started_at = null
        values.recording_ended_at = null
        values.recording_paused_at = null
        values.recording_elapsed_ms = 0
      }
    }
  }

  if (Object.keys(values).length === 0) return await getRoomById(id)

  const [row] = await db!
    .update(collaborationRooms)
    .set(values)
    .where(eq(collaborationRooms.id, id))
    .returning()

  // Khat Brain — when status changes, walk the linked EIR forward.
  // Monotonic: room going waiting→live→ended walks ready_to_record→
  // recording→recorded; pause/resume don't generate redundant rows.
  if (row && input.status && row.eir_id) {
    try {
      await syncEirFromRoomStatus({
        eirId: row.eir_id,
        status: input.status as CollaborationRoomStatus,
      })
    } catch (err) {
      console.error("[khat-brain] room status sync failed:", err)
    }
  }

  return row ? rowToRoom(row) : null
}

// ─── Participants ───────────────────────────────────────────────────

export async function joinRoom(
  roomId: string,
  userId: string,
  displayName: string,
  role: ParticipantRole = "viewer"
): Promise<RoomParticipant> {
  // Upsert: if participant already exists (same room + user), update online status
  const existing = await db!
    .select()
    .from(roomParticipants)
    .where(and(
      eq(roomParticipants.room_id, roomId),
      eq(roomParticipants.user_id, userId),
    ))
    .limit(1)

  if (existing.length > 0) {
    const [row] = await db!
      .update(roomParticipants)
      .set({
        is_online: true,
        last_heartbeat: new Date(),
        left_at: null,
        display_name: displayName,
        role,
      })
      .where(eq(roomParticipants.id, existing[0].id))
      .returning()
    return rowToParticipant(row)
  }

  const [row] = await db!
    .insert(roomParticipants)
    .values({
      room_id: roomId,
      user_id: userId,
      display_name: displayName,
      role,
    })
    .returning()
  return rowToParticipant(row)
}

export async function leaveRoom(participantId: string): Promise<void> {
  await db!
    .update(roomParticipants)
    .set({ is_online: false, left_at: new Date() })
    .where(eq(roomParticipants.id, participantId))
}

export async function heartbeat(participantId: string): Promise<void> {
  await db!
    .update(roomParticipants)
    .set({ last_heartbeat: new Date(), is_online: true })
    .where(eq(roomParticipants.id, participantId))
}

/**
 * Sweep stale participants in a room.
 *
 * Any participant with is_online=true whose last_heartbeat is older
 * than STALE_THRESHOLD_MS is marked offline. Returns the IDs that
 * transitioned so the caller can broadcast participant_update events.
 *
 * Called piggyback on each heartbeat request — no global cron needed.
 */
const STALE_THRESHOLD_MS = 90_000 // 90 seconds (3 missed 30s heartbeats)

export async function sweepStaleParticipants(roomId: string): Promise<string[]> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS)

  const stale = await db!
    .select({ id: roomParticipants.id })
    .from(roomParticipants)
    .where(and(
      eq(roomParticipants.room_id, roomId),
      eq(roomParticipants.is_online, true),
      lt(roomParticipants.last_heartbeat, cutoff),
    ))

  if (stale.length === 0) return []

  const staleIds = stale.map((r) => r.id)

  await db!
    .update(roomParticipants)
    .set({ is_online: false })
    .where(inArray(roomParticipants.id, staleIds))

  return staleIds
}

// ─── Card State ─────────────────────────────────────────────────────

export async function updateCardState(
  roomId: string,
  cardId: string,
  status: RoomCardState["status"],
): Promise<RoomCardState> {
  const timestamps: Record<string, Date> = {}
  if (status === "active") timestamps.activated_at = new Date()
  if (status === "used" || status === "skipped") timestamps.completed_at = new Date()

  // Upsert
  const existing = await db!
    .select()
    .from(roomCardState)
    .where(and(
      eq(roomCardState.room_id, roomId),
      eq(roomCardState.card_id, cardId),
    ))
    .limit(1)

  if (existing.length > 0) {
    const [row] = await db!
      .update(roomCardState)
      .set({ status, ...timestamps })
      .where(eq(roomCardState.id, existing[0].id))
      .returning()
    return rowToCardState(row)
  }

  const [row] = await db!
    .insert(roomCardState)
    .values({
      room_id: roomId,
      card_id: cardId,
      status,
      ...timestamps,
    })
    .returning()
  return rowToCardState(row)
}

export async function pinCardInRoom(roomId: string, cardId: string, isPinned: boolean): Promise<RoomCardState> {
  const existing = await db!
    .select()
    .from(roomCardState)
    .where(and(
      eq(roomCardState.room_id, roomId),
      eq(roomCardState.card_id, cardId),
    ))
    .limit(1)

  if (existing.length > 0) {
    const [row] = await db!
      .update(roomCardState)
      .set({ is_pinned: isPinned })
      .where(eq(roomCardState.id, existing[0].id))
      .returning()
    return rowToCardState(row)
  }

  const [row] = await db!
    .insert(roomCardState)
    .values({ room_id: roomId, card_id: cardId, is_pinned: isPinned })
    .returning()
  return rowToCardState(row)
}

// ─── Notes ──────────────────────────────────────────────────────────

export async function createNote(
  roomId: string,
  authorId: string,
  input: CreateRoomNoteInput
): Promise<RoomCardNote> {
  const [row] = await db!
    .insert(roomCardNotes)
    .values({
      room_id: roomId,
      card_id: input.card_id ?? null,
      section_key: input.section_key ?? null,
      author_id: authorId,
      content: input.content,
      note_type: input.note_type ?? "normal",
      priority: input.priority ?? "medium",
    })
    .returning()
  return rowToNote(row)
}

export async function markNoteSeen(noteId: string): Promise<void> {
  await db!
    .update(roomCardNotes)
    .set({ is_seen_by_host: true, seen_by_host_at: new Date() })
    .where(eq(roomCardNotes.id, noteId))
}

export async function resolveNote(noteId: string): Promise<void> {
  await db!
    .update(roomCardNotes)
    .set({ resolved_at: new Date() })
    .where(eq(roomCardNotes.id, noteId))
}

// ─── Session Markers ─────────────────────────────────────────────────

/** Compute current recording offset in ms from room state. */
function computeRecordingMs(room: CollaborationRoom): number {
  if (room.status === "live" && room.recording_started_at) {
    return (room.recording_elapsed_ms || 0) + (Date.now() - new Date(room.recording_started_at).getTime())
  }
  return room.recording_elapsed_ms || 0
}

export async function createMarker(
  roomId: string,
  authorId: string,
  input: CreateSessionMarkerInput,
): Promise<RoomSessionMarker> {
  const room = await getRoomById(roomId)
  const recordingMs = room ? computeRecordingMs(room) : 0

  const [row] = await db!
    .insert(roomSessionMarkers)
    .values({
      room_id: roomId,
      author_id: authorId,
      marker_type: input.marker_type,
      label: input.label,
      note: input.note ?? null,
      recording_ms: recordingMs,
      wall_time: new Date(),
    })
    .returning()
  return rowToMarker(row)
}

export async function getMarkersByRoom(roomId: string): Promise<RoomSessionMarker[]> {
  const rows = await db!
    .select()
    .from(roomSessionMarkers)
    .where(eq(roomSessionMarkers.room_id, roomId))
    .orderBy(asc(roomSessionMarkers.recording_ms))
  return rows.map(rowToMarker)
}

export async function deleteMarker(markerId: string): Promise<void> {
  await db!
    .delete(roomSessionMarkers)
    .where(eq(roomSessionMarkers.id, markerId))
}

// ─── Row → Type helpers ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRoom(row: any): CollaborationRoom {
  return {
    ...row,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    updated_at: row.updated_at?.toISOString?.() ?? row.updated_at,
    recording_started_at: row.recording_started_at?.toISOString?.() ?? row.recording_started_at ?? null,
    recording_ended_at: row.recording_ended_at?.toISOString?.() ?? row.recording_ended_at ?? null,
    recording_paused_at: row.recording_paused_at?.toISOString?.() ?? row.recording_paused_at ?? null,
    recording_elapsed_ms: row.recording_elapsed_ms ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCard(row: any) {
  return {
    ...row,
    follow_ups: row.follow_ups ?? [],
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    updated_at: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMaterial(row: any): CardMaterial {
  return {
    ...row,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToParticipant(row: any): RoomParticipant {
  return {
    ...row,
    last_heartbeat: row.last_heartbeat?.toISOString?.() ?? row.last_heartbeat,
    joined_at: row.joined_at?.toISOString?.() ?? row.joined_at,
    left_at: row.left_at?.toISOString?.() ?? row.left_at ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCardState(row: any): RoomCardState {
  return {
    ...row,
    activated_at: row.activated_at?.toISOString?.() ?? row.activated_at ?? null,
    completed_at: row.completed_at?.toISOString?.() ?? row.completed_at ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMarker(row: any): RoomSessionMarker {
  return {
    ...row,
    wall_time: row.wall_time?.toISOString?.() ?? row.wall_time,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToNote(row: any): RoomCardNote {
  return {
    ...row,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    seen_by_host_at: row.seen_by_host_at?.toISOString?.() ?? row.seen_by_host_at ?? null,
    resolved_at: row.resolved_at?.toISOString?.() ?? row.resolved_at ?? null,
  }
}
