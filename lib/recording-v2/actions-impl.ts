/**
 * Phase X Step 5 — Live Recording V2 action implementations.
 *
 * Pure DB-side logic, no auth gating. The server actions in
 * app/admin/recording/[roomId]/v2/actions.ts wrap these with
 * requireAdmin() so the surface stays minimal and the smoke can call
 * the implementations directly without monkey-patching read-only ES
 * module exports.
 */

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  collaborationRooms,
  roomParticipants,
  roomSessionMarkers,
  roomTakes,
} from "@/lib/db/schema/collaboration"
import { syncEirFromRoomStatus, syncEirOnRetake } from "@/lib/khat-brain"
import type { SectionKind } from "@/lib/preparation/v2/types"
import { QUICK_MARKER_TYPES, type QuickMarkerType } from "./marker-types"

/**
 * Marker types the cockpit may create via the server action. The quick-tag set
 * plus `insight_used` — the host marking a question's support card as deployed
 * live (system markers like `energy_change` are written server-side, not here).
 */
export type LiveV2MarkerType = QuickMarkerType | "insight_used"
export const ALLOWED_MARKER_TYPES: readonly LiveV2MarkerType[] = [
  ...QUICK_MARKER_TYPES,
  "insight_used",
]

// ─── Helpers ──────────────────────────────────────────────────────────

async function ensureParticipant(
  roomId: string,
  userId: string,
  displayName: string,
): Promise<string> {
  // The unique key is (room_id, user_id) — match both directly. (The previous
  // implementation used `Array.find` with an async predicate, which always
  // "matched" the first row because the returned Promise is truthy, then did an
  // N+1 second pass to compensate.)
  const [existing] = await db!
    .select({ id: roomParticipants.id })
    .from(roomParticipants)
    .where(and(eq(roomParticipants.room_id, roomId), eq(roomParticipants.user_id, userId)))
    .limit(1)
  if (existing) return existing.id
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

/**
 * Ensure the current take has an anchor row, and NEVER move an existing one.
 *
 * `anchor_at` is the single wall-clock zero point every editor-facing timestamp
 * is measured from, so it must survive every resume, pause and end of the take.
 * `ON CONFLICT DO NOTHING` on the (room_id, take_number) unique key gives us
 * write-once semantics in one statement — no read-then-write race if two
 * operators press "ابدأ التسجيل" at the same moment.
 *
 * (This is why `recording_started_at` is not the anchor: `resumeTimer`
 * overwrites it on every resume.)
 */
async function ensureTakeAnchor(
  roomId: string,
  takeNumber: number,
  anchorAt: Date,
): Promise<void> {
  await db!
    .insert(roomTakes)
    .values({ room_id: roomId, take_number: takeNumber, anchor_at: anchorAt })
    .onConflictDoNothing({
      target: [roomTakes.room_id, roomTakes.take_number],
    })
}

// ─── Timer ─────────────────────────────────────────────────────────────

export async function startTimer(roomId: string) {
  const now = new Date()
  const room = await loadRoom(roomId)
  if (!room) return { ok: false as const, error: "room_not_found" }
  // Anchor BEFORE flipping to live: once the room is live, markers can arrive,
  // and a marker whose take has no anchor row cannot be placed on a timeline.
  await ensureTakeAnchor(roomId, room.take_number, now)
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
  if (room.eir_id) {
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
  // `recording_started_at` is re-based here so the net-elapsed accumulator can
  // measure the new live window. It is deliberately NOT an anchor for camera
  // time — `room_takes.anchor_at` is, and nothing in this function touches it.
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

/**
 * Open a NEW take in the same room ("إعادة ضبط لتسجيل جديد" / mid-take reset).
 *
 * Three things this has to get right, all of which it previously got wrong:
 *
 *  1. **Bump the take.** The counter moves forward so take-2 markers are
 *     distinguishable from take-1's. The previous take's rows and anchor stay
 *     exactly where they are — nothing is deleted.
 *  2. **Clear the previous take's progress.** `completed_question_ids`, the
 *     section pointer and the director notes all described take 1; leaving them
 *     meant take 2 started with every question already ticked "asked".
 *  3. **Walk the EIR back.** The episode is about to be re-shot, so it is no
 *     longer `recorded` — it is `ready_to_record` again. This is the one
 *     backward transition in the state machine (`retake`); everything else is
 *     forward-only. Without it the producer's screens keep reading «مسجّلة»
 *     while the crew is resetting the lights for another attempt.
 */
export async function resetTimer(roomId: string) {
  const now = new Date()
  const room = await loadRoom(roomId)
  if (!room) return { ok: false as const, error: "room_not_found" }
  const take_number = room.take_number + 1
  await db!
    .update(collaborationRooms)
    .set({
      status: "waiting",
      recording_started_at: null,
      recording_paused_at: null,
      recording_ended_at: null,
      recording_elapsed_ms: 0,
      take_number,
      // Take-1 progress must not leak into take 2.
      completed_question_ids: [],
      current_section_key: null,
      current_section_index: null,
      director_notes: null,
      updated_at: now,
    })
    .where(eq(collaborationRooms.id, roomId))
  // The new take's anchor is written by `startTimer`, not here — a reset is not
  // a start, and stamping an anchor now would date the take to the reset click.
  if (room.eir_id) {
    await syncEirOnRetake({ eirId: room.eir_id })
  }
  return { ok: true as const, take_number }
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
  // Close the take's anchor row. `anchor_at` is untouched — only the end is
  // stamped, and only if it isn't already (a second "أوقف" must not move it).
  await db!
    .update(roomTakes)
    .set({ ended_at: now })
    .where(
      and(
        eq(roomTakes.room_id, roomId),
        eq(roomTakes.take_number, room.take_number),
        sql`${roomTakes.ended_at} is null`,
      ),
    )
  if (room.eir_id) {
    await syncEirFromRoomStatus({ eirId: room.eir_id, status: "ended" })
  }
  return { ok: true as const, elapsed_ms }
}

/**
 * Stable label identifying a checklist-gate override marker. Presence of one of
 * these for the current take is what keeps the gate open across a page reload —
 * the override is derived from the audit record rather than held in component
 * state, so it survives a refresh and cannot be silently forgotten.
 */
export const CHECKLIST_OVERRIDE_LABEL = "checklist_override"

/**
 * Record that the host started recording without a completed pre-shoot
 * checklist.
 *
 * Written as a `tech_issue` marker rather than into a bespoke audit table so it
 * flows into the CSV export and the wrap screen for free: the decision to shoot
 * unverified appears beside the footage it affected, where post will see it.
 *
 * Deliberately bypasses `createMarker`'s `status === "waiting"` guard — an
 * override happens BEFORE the take starts, which is exactly the state that guard
 * rejects. The consequence is intended: with no anchor yet, this marker has no
 * derivable camera time, so it is excluded from the EDL and shown in the CSV as
 * unanchored. It is a session fact, not a timeline position.
 */
export async function recordChecklistOverride(input: {
  roomId: string
  reason: string
  resolvedCount: number
  total: number
  actorUserId: string
  actorDisplayName: string
}) {
  const room = await loadRoom(input.roomId)
  if (!room) return { ok: false as const, error: "room_not_found" }

  const participantId = await ensureParticipant(
    input.roomId,
    input.actorUserId,
    input.actorDisplayName,
  )
  const now = new Date()
  const [row] = await db!
    .insert(roomSessionMarkers)
    .values({
      room_id: input.roomId,
      author_id: participantId,
      marker_type: "tech_issue",
      label: CHECKLIST_OVERRIDE_LABEL,
      note: `تجاوز التشك-ليست: ${input.reason} — ${input.resolvedCount} من ${input.total} بند مؤكّد`,
      net_recording_ms: room.recording_elapsed_ms,
      take_number: room.take_number,
      wall_time: now,
      section_key: null,
    } as never)
    .returning({ id: roomSessionMarkers.id })

  return { ok: true as const, marker_id: row.id }
}

/**
 * Has the gate been overridden for this room's current take? Derived from the
 * audit marker so a reload cannot lose it.
 */
export async function hasChecklistOverride(
  roomId: string,
  takeNumber: number,
): Promise<boolean> {
  const [row] = await db!
    .select({ id: roomSessionMarkers.id })
    .from(roomSessionMarkers)
    .where(
      and(
        eq(roomSessionMarkers.room_id, roomId),
        eq(roomSessionMarkers.take_number, takeNumber),
        eq(roomSessionMarkers.label, CHECKLIST_OVERRIDE_LABEL),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Record the measured gap between the camera rolling and someone pressing
 * "ابدأ التسجيل" on this take.
 *
 * Positive = the camera started BEFORE we did (the normal case: the camera is
 * rolling while the operator reaches for the laptop). Every exported camera
 * timestamp shifts by this amount, derived on read — so a corrected measurement
 * fixes an already-delivered export with no re-tagging and no data rewrite.
 *
 * Bounded to ±1h: this is a sync nudge of seconds, and an unbounded value would
 * push markers off the far end of the editor's timeline.
 */
export const MAX_CAMERA_OFFSET_MS = 3_600_000

export async function setTakeCameraOffset(input: {
  roomId: string
  takeNumber: number
  offsetMs: number
}) {
  if (!Number.isFinite(input.offsetMs)) {
    return { ok: false as const, error: "invalid_offset" }
  }
  const offset = Math.trunc(input.offsetMs)
  if (Math.abs(offset) > MAX_CAMERA_OFFSET_MS) {
    return { ok: false as const, error: "offset_out_of_range" }
  }
  const [row] = await db!
    .update(roomTakes)
    .set({ camera_offset_ms: offset })
    .where(
      and(
        eq(roomTakes.room_id, input.roomId),
        eq(roomTakes.take_number, input.takeNumber),
      ),
    )
    .returning({ camera_offset_ms: roomTakes.camera_offset_ms })
  // No row means the take was never started, so there is no anchor to correct.
  if (!row) return { ok: false as const, error: "take_not_found" }
  return { ok: true as const, camera_offset_ms: row.camera_offset_ms }
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

  // A marker before the take has started has no anchor to measure against, so
  // its camera timestamp would be undefined (or negative). The cockpit already
  // hides the tag buttons while `waiting`, but a stale tab left open across a
  // reset can still fire this action — mirrors the `status !== "live"` guard in
  // `recordEnergyChangeMarker`, relaxed to allow flagging during a pause.
  if (room.status === "waiting") {
    return { ok: false as const, error: "recording_not_started" }
  }

  const now = new Date()
  let liveElapsedMs = 0
  if (room.recording_started_at && !room.recording_paused_at) {
    liveElapsedMs = Math.max(0, now.getTime() - room.recording_started_at.getTime())
  }
  const net_recording_ms = room.recording_elapsed_ms + liveElapsedMs

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
      net_recording_ms,
      // Copied from the room NOW, never resolved at read time: the room's
      // counter moves on the next reset, so a late lookup would relabel this
      // take-1 marker as take-3 and defeat the whole point of the column.
      take_number: room.take_number,
      // Written from the Node clock — the same clock that stamped
      // `room_takes.anchor_at` — so camera time carries no app↔DB skew. Never
      // left to the Postgres `now()` default.
      wall_time: now,
      section_key: input.sectionKey ?? room.current_section_key ?? null,
    } as never)
    .returning({ id: roomSessionMarkers.id })

  return { ok: true as const, marker_id: row.id, net_recording_ms }
}
