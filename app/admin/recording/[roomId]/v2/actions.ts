"use server"

/**
 * Phase X Step 5 — Live Recording V2 server actions.
 *
 * Thin wrappers around lib/recording-v2/actions-impl.ts. Each action
 * gates on requireAdmin() and forwards to the implementation. Keeping
 * the DB logic outside the "use server" boundary lets the smoke call
 * the implementations directly without monkey-patching ES exports.
 */

import { revalidatePath } from "next/cache"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  endTimer,
  setCurrentSection,
  saveDirectorNotes,
  createMarker,
  ALLOWED_MARKER_TYPES,
  type LiveV2MarkerType,
} from "@/lib/recording-v2/actions-impl"
import type { SectionKind } from "@/lib/preparation/v2/types"

function revalidate(roomId: string) {
  revalidatePath(`/admin/recording/${roomId}/v2`)
}

export async function startTimerAction(roomId: string) {
  await requireAdmin()
  const r = await startTimer(roomId)
  revalidate(roomId)
  return r
}

export async function pauseTimerAction(roomId: string) {
  await requireAdmin()
  const r = await pauseTimer(roomId)
  revalidate(roomId)
  return r
}

export async function resumeTimerAction(roomId: string) {
  await requireAdmin()
  const r = await resumeTimer(roomId)
  revalidate(roomId)
  return r
}

export async function resetTimerAction(roomId: string) {
  await requireAdmin()
  const r = await resetTimer(roomId)
  revalidate(roomId)
  return r
}

export async function endTimerAction(roomId: string) {
  await requireAdmin()
  const r = await endTimer(roomId)
  revalidate(roomId)
  return r
}

export async function setCurrentSectionAction(input: {
  roomId: string
  index: number
  key: SectionKind
}) {
  await requireAdmin()
  const r = await setCurrentSection(input)
  revalidate(input.roomId)
  return r
}

export async function saveDirectorNotesAction(input: {
  roomId: string
  notes: string
}) {
  await requireAdmin()
  return await saveDirectorNotes(input)
}

export async function createMarkerAction(input: {
  roomId: string
  markerType: LiveV2MarkerType
  label: string
  note?: string | null
  sectionKey?: SectionKind | null
}) {
  await requireAdmin()
  if (!ALLOWED_MARKER_TYPES.includes(input.markerType)) {
    return { ok: false as const, error: "invalid_marker_type" }
  }
  const user = await getAdminAuthUser()
  if (!user) return { ok: false as const, error: "no_user" }
  const r = await createMarker({
    ...input,
    authorUserId: user.id,
    authorDisplayName: user.email.split("@")[0],
  })
  revalidate(input.roomId)
  return r
}
