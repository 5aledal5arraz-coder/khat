"use server"

/**
 * Phase 2 — Market Signal review server actions.
 *
 * Thin wrappers over the mutation layer. Each action:
 *   • requires an authenticated admin (operator)
 *   • passes the operator's id as `actor_id` to every audit event
 *   • revalidates /admin/khat-brain/market/signals so the queue
 *     refreshes without a manual reload
 *
 * Never auto-fires. Only invoked from operator UI form submissions.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import {
  approveSignal,
  rejectSignal,
  archiveSignal,
  restoreSignal,
  addSignalTag,
  removeSignalTag,
  setSignalNote,
  bulkApproveSignals,
  bulkRejectSignals,
  bulkArchiveSignals,
  bulkAddSignalTag,
  type SingleSignalResult,
  type BulkResult,
} from "@/lib/market-intelligence/review-mutations"
import {
  SIGNAL_EDITORIAL_TAGS,
  type SignalEditorialTag,
} from "@/lib/db/schema/editorial-intelligence"

const REVIEW_PATH = "/admin/khat-brain/market/signals"

async function actorOrFail(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, error: gate.error }
  return { ok: true, userId: gate.user.id }
}

function bumpPath() {
  revalidatePath(REVIEW_PATH)
}

function isTag(t: string): t is SignalEditorialTag {
  return (SIGNAL_EDITORIAL_TAGS as readonly string[]).includes(t)
}

// ─── Per-signal actions ──────────────────────────────────────────────

export async function approveSignalAction(input: {
  signalId: string
  note?: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  const r = await approveSignal(input.signalId, { actorId: actor.userId }, input.note)
  bumpPath()
  return r
}

export async function rejectSignalAction(input: {
  signalId: string
  note?: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  const r = await rejectSignal(input.signalId, { actorId: actor.userId }, input.note)
  bumpPath()
  return r
}

export async function archiveSignalAction(input: {
  signalId: string
  note?: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  const r = await archiveSignal(input.signalId, { actorId: actor.userId }, input.note)
  bumpPath()
  return r
}

export async function restoreSignalAction(input: {
  signalId: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  const r = await restoreSignal(input.signalId, { actorId: actor.userId })
  bumpPath()
  return r
}

export async function addTagAction(input: {
  signalId: string
  tag: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  if (!isTag(input.tag)) {
    return {
      ok: false,
      signalId: input.signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: "وسم غير معتمد.",
    }
  }
  const r = await addSignalTag(input.signalId, input.tag, { actorId: actor.userId })
  bumpPath()
  return r
}

export async function removeTagAction(input: {
  signalId: string
  tag: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  if (!isTag(input.tag)) {
    return {
      ok: false,
      signalId: input.signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: "وسم غير معتمد.",
    }
  }
  const r = await removeSignalTag(input.signalId, input.tag, { actorId: actor.userId })
  bumpPath()
  return r
}

export async function setNoteAction(input: {
  signalId: string
  note: string
}): Promise<SingleSignalResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, signalId: input.signalId, previousStatus: null, newStatus: null, eventId: null, message: actor.error }
  const r = await setSignalNote(input.signalId, input.note, { actorId: actor.userId })
  bumpPath()
  return r
}

// ─── Bulk actions ────────────────────────────────────────────────────

export async function bulkApproveAction(input: {
  signalIds: string[]
}): Promise<BulkResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, affected: 0, eventIds: [], skipped: input.signalIds }
  const r = await bulkApproveSignals(input.signalIds, { actorId: actor.userId })
  bumpPath()
  return r
}

export async function bulkRejectAction(input: {
  signalIds: string[]
}): Promise<BulkResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, affected: 0, eventIds: [], skipped: input.signalIds }
  const r = await bulkRejectSignals(input.signalIds, { actorId: actor.userId })
  bumpPath()
  return r
}

export async function bulkArchiveAction(input: {
  signalIds: string[]
}): Promise<BulkResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, affected: 0, eventIds: [], skipped: input.signalIds }
  const r = await bulkArchiveSignals(input.signalIds, { actorId: actor.userId })
  bumpPath()
  return r
}

export async function bulkTagAction(input: {
  signalIds: string[]
  tag: string
}): Promise<BulkResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, affected: 0, eventIds: [], skipped: input.signalIds }
  if (!isTag(input.tag)) {
    return { ok: false, affected: 0, eventIds: [], skipped: input.signalIds }
  }
  const r = await bulkAddSignalTag(input.signalIds, input.tag, { actorId: actor.userId })
  bumpPath()
  return r
}
