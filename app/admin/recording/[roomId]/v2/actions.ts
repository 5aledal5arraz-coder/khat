"use server"

/**
 * Phase X Step 5 — Live Recording V2 server actions.
 *
 * Thin wrappers around lib/recording-v2/actions-impl.ts. Each action
 * gates on requireActionRole("EDITOR") and forwards to the implementation. Keeping
 * the DB logic outside the "use server" boundary lets the smoke call
 * the implementations directly without monkey-patching ES exports.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole, getAdminAuthUser } from "@/lib/api-utils"
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  endTimer,
  setCurrentSection,
  saveDirectorNotes,
  createMarker,
  toggleQuestionDone,
  setTakeCameraOffset,
  recordChecklistOverride,
  recordTakeStartMarker,
  ALLOWED_MARKER_TYPES,
  type LiveV2MarkerType,
} from "@/lib/recording-v2/actions-impl"
import { setChecklistItem } from "@/lib/recording-v2/checklist"
import { resolveMemberName } from "@/lib/admin/team-identity"
import { resolveRoomRole } from "@/lib/collaboration/room-roles"
import { getRoomById, updateRoom } from "@/lib/collaboration/rooms"
import { broadcast } from "@/lib/collaboration/broadcast"
import type { SectionKind } from "@/lib/preparation/v2/types"

function revalidate(roomId: string) {
  revalidatePath(`/admin/recording/${roomId}/v2`)
}

/**
 * Push the room row to every connected screen.
 *
 * These actions used to `revalidatePath` and stop there — which reaches the
 * caller's own page and nobody else's. So the director's screen never learned
 * that the take had started, that it was paused, or that the host had moved to
 * another section: it sat on the pre-shoot checklist until the SSE stream
 * happened to reconnect and re-send a snapshot. Every other room mutation in
 * this file already broadcasts (`toggleQuestionDone`, `setChecklistItem`); the
 * transport was the gap, and it is the one the director's clock hangs off.
 */
async function broadcastRoom(roomId: string) {
  const room = await getRoomById(roomId)
  if (!room) return
  broadcast(roomId, {
    type: "room_update",
    data: room,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Start the take. Callable from BOTH the host's gate and the director's
 * checklist — the two of them are in the same room shouting at each other, and
 * "first press wins" is enforced in `startTimer` (the loser gets `ok` with
 * `already_started`, never an error).
 *
 * Permission is unchanged and deliberately not widened: `requireActionRole`
 * reads `admin_users.role`, exactly as before. What changed is which SCREEN
 * offers the button — and the director's copy is locked behind the same
 * completed checklist the host's is.
 */
export async function startTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await startTimer(roomId)
  // Attribution: who pressed it. Only on the press that actually started the
  // take — the losing half of a two-press race must not log a second start.
  if (r.ok && !("already_started" in r && r.already_started)) {
    const user = await getAdminAuthUser()
    if (user) {
      await recordTakeStartMarker({
        roomId,
        actorUserId: user.id,
        actorDisplayName: resolveMemberName(user),
        actorRoomRole: resolveRoomRole({ jobTitle: user.job_title, adminRole: user.role }),
      })
    }
  }
  await broadcastRoom(roomId)
  revalidate(roomId)
  return r
}

export async function pauseTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await pauseTimer(roomId)
  await broadcastRoom(roomId)
  revalidate(roomId)
  return r
}

export async function resumeTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await resumeTimer(roomId)
  await broadcastRoom(roomId)
  revalidate(roomId)
  return r
}

export async function resetTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await resetTimer(roomId)
  await broadcastRoom(roomId)
  revalidate(roomId)
  return r
}

export async function endTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await endTimer(roomId)
  await broadcastRoom(roomId)
  revalidate(roomId)
  return r
}

/**
 * Confirm / waive / clear one pre-shoot checklist item.
 *
 * Gated on `requireActionRole("EDITOR")`, consistent with every other v2 action.
 * Permission is deliberately NOT derived from the room role, and that stays true
 * now that `ensureParticipant` writes the real role instead of a hardcoded
 * "director": the room role is a projection of `job_title`, a descriptive field
 * edited on /admin/team. Gating an action on it would let a label change grant
 * the action. `admin_users.role` is the only permission input.
 *
 * The confirming identity comes from the session (`admin_users.id`).
 */
export async function setChecklistItemAction(input: {
  roomId: string
  itemKey: string
  state: "done" | "not_applicable" | "pending"
  notApplicableReason?: string | null
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const user = await getAdminAuthUser()
  const r = await setChecklistItem({
    roomId: input.roomId,
    itemKey: input.itemKey,
    state: input.state,
    notApplicableReason: input.notApplicableReason ?? null,
    actorId: user?.id ?? null,
  })
  if (r.ok) {
    // Its own event type + its own context slice: `room_update` replaces the
    // whole `room` object, so carrying checklist state on it would drop it.
    broadcast(input.roomId, {
      type: "checklist_update",
      data: { take_number: r.takeNumber, entries: r.entries },
      timestamp: new Date().toISOString(),
    })
    revalidate(input.roomId)
  }
  return r
}

/**
 * Emergency override of the checklist gate.
 *
 * Reached ONLY from the host bar's `no_director` / `offline` states — never as a
 * general shortcut. Recorded as a `tech_issue` marker rather than a bespoke audit
 * table so it lands in the CSV export and the wrap screen automatically: the
 * decision to shoot unverified shows up next to the footage it affected, where
 * post will actually see it.
 */
export async function overrideChecklistGateAction(input: {
  roomId: string
  reason: string
  resolvedCount: number
  total: number
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const user = await getAdminAuthUser()
  if (!user) return { ok: false as const, error: "no_user" }
  const reason = input.reason.trim().slice(0, 200)
  if (!reason) return { ok: false as const, error: "reason_required" }

  const r = await recordChecklistOverride({
    roomId: input.roomId,
    reason,
    resolvedCount: input.resolvedCount,
    total: input.total,
    actorUserId: user.id,
    actorDisplayName: resolveMemberName(user),
    actorRoomRole: resolveRoomRole({ jobTitle: user.job_title, adminRole: user.role }),
  })
  if (r.ok) revalidate(input.roomId)
  return r
}

export async function setTakeCameraOffsetAction(input: {
  roomId: string
  takeNumber: number
  offsetMs: number
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await setTakeCameraOffset(input)
  revalidate(input.roomId)
  return r
}

export async function setCurrentSectionAction(input: {
  roomId: string
  index: number
  key: SectionKind
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await setCurrentSection(input)
  // The director's screen follows `current_section_index`, and his section
  // clock is stamped from the moment this lands. Without the broadcast both sat
  // still.
  await broadcastRoom(input.roomId)
  revalidate(input.roomId)
  return r
}

export async function saveDirectorNotesAction(input: {
  roomId: string
  notes: string
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  return await saveDirectorNotes(input)
}

export async function createMarkerAction(input: {
  roomId: string
  markerType: LiveV2MarkerType
  label: string
  note?: string | null
  sectionKey?: SectionKind | null
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  if (!ALLOWED_MARKER_TYPES.includes(input.markerType)) {
    return { ok: false as const, error: "invalid_marker_type" }
  }
  const user = await getAdminAuthUser()
  if (!user) return { ok: false as const, error: "no_user" }
  const r = await createMarker({
    ...input,
    authorUserId: user.id,
    authorDisplayName: resolveMemberName(user),
    authorRoomRole: resolveRoomRole({ jobTitle: user.job_title, adminRole: user.role }),
  })
  revalidate(input.roomId)
  return r
}

/**
 * Broadcast WHICH QUESTION THE HOST IS ON RIGHT NOW.
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 * Khaled: «فيصل وشاهين لازم يشوفون السؤال اللي بيطرحه المحاور عشان يتابعون مع
 * المحاور ويعرفون اي سؤال الان وماهو السؤال التالي».
 *
 * The room tracked only `completed_question_ids` — which questions had been
 * ASKED. From that the others could infer "he is probably on the first undone
 * one", and that inference breaks the moment the host skips a question or
 * doubles back, which is exactly when a director most needs to know where he
 * is. Nothing in the room ever said "now".
 *
 * ── WHY `active_card_id` AND NOT A NEW COLUMN ──────────────────────────────
 * `collaboration_rooms.active_card_id` already exists, already broadcasts with
 * every room update, and is unused by this room — the preparation room uses it
 * for the same idea. So this needs no migration and no new SSE payload: the
 * participant views already receive the field, they were simply never given
 * anything to read from it.
 *
 * EDITOR role is the gate, matching `toggleQuestionDoneAction` beside it — the
 * host drives this, but a director correcting a mis-set question mid-take is a
 * repair, not an escalation.
 */
export async function setCurrentQuestionAction(input: {
  roomId: string
  questionId: string | null
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const room = await updateRoom(input.roomId, { active_card_id: input.questionId })
  revalidate(input.roomId)
  if (room) {
    broadcast(input.roomId, {
      type: "room_update",
      data: room,
      timestamp: new Date().toISOString(),
    })
  }
  return { ok: true as const }
}

export async function toggleQuestionDoneAction(input: {
  roomId: string
  questionId: string
}) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await toggleQuestionDone(input)
  revalidate(input.roomId)
  // Broadcast the updated room so participant views reflect coverage live.
  if (r.ok) {
    const room = await getRoomById(input.roomId)
    if (room) {
      broadcast(input.roomId, {
        type: "room_update",
        data: room,
        timestamp: new Date().toISOString(),
      })
    }
  }
  return r
}
