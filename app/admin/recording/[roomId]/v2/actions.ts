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
  ALLOWED_MARKER_TYPES,
  type LiveV2MarkerType,
} from "@/lib/recording-v2/actions-impl"
import { setChecklistItem } from "@/lib/recording-v2/checklist"
import { resolveMemberName } from "@/lib/admin/team-identity"
import { resolveRoomRole } from "@/lib/collaboration/room-roles"
import { getRoomById } from "@/lib/collaboration/rooms"
import { broadcast } from "@/lib/collaboration/broadcast"
import type { SectionKind } from "@/lib/preparation/v2/types"

function revalidate(roomId: string) {
  revalidatePath(`/admin/recording/${roomId}/v2`)
}

export async function startTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await startTimer(roomId)
  revalidate(roomId)
  return r
}

export async function pauseTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await pauseTimer(roomId)
  revalidate(roomId)
  return r
}

export async function resumeTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await resumeTimer(roomId)
  revalidate(roomId)
  return r
}

export async function resetTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await resetTimer(roomId)
  revalidate(roomId)
  return r
}

export async function endTimerAction(roomId: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const r = await endTimer(roomId)
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
