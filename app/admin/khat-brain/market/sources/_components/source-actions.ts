"use server"

/**
 * Phase 3 — Trusted Sources server actions.
 *
 * Thin wrappers. Each action requireAdmin()'s and stamps the actor.
 * Validation + dedup live in the mutation layer.
 */

import { revalidatePath } from "next/cache"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import {
  createTrustedSource,
  updateTrustedSource,
  setSourceActive,
  archiveSource,
  restoreSource,
  adjustTrustScore,
  adjustAlignmentScore,
  setSourceNotes,
  type CreateSourceInput,
  type UpdateSourceInput,
  type MutationResult,
} from "@/lib/market-intelligence/sources-mutations"

const ROUTE = "/admin/khat-brain/market/sources"

async function actorOrFail(): Promise<string> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user?.id) {
    throw new Error("لا يمكن تنفيذ الإجراء بدون مستخدم مسجَّل دخوله.")
  }
  return user.id
}
function bump() {
  revalidatePath(ROUTE)
}

export async function createSourceAction(
  input: CreateSourceInput,
): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await createTrustedSource(input, { actorId })
  bump()
  return r
}

export async function updateSourceAction(
  input: UpdateSourceInput,
): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await updateTrustedSource(input, { actorId })
  bump()
  return r
}

export async function setActiveAction(input: {
  id: string
  active: boolean
}): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await setSourceActive(input.id, input.active, { actorId })
  bump()
  return r
}

export async function archiveSourceAction(input: {
  id: string
}): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await archiveSource(input.id, { actorId })
  bump()
  return r
}

export async function restoreSourceAction(input: {
  id: string
}): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await restoreSource(input.id, { actorId })
  bump()
  return r
}

export async function adjustTrustAction(input: {
  id: string
  score: number
}): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await adjustTrustScore(input.id, input.score, { actorId })
  bump()
  return r
}

export async function adjustAlignmentAction(input: {
  id: string
  score: number
}): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await adjustAlignmentScore(input.id, input.score, { actorId })
  bump()
  return r
}

export async function setNotesAction(input: {
  id: string
  notes: string
}): Promise<MutationResult> {
  const actorId = await actorOrFail()
  const r = await setSourceNotes(input.id, input.notes, { actorId })
  bump()
  return r
}
