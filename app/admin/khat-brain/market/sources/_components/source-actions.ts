"use server"

/**
 * Phase 3 — Trusted Sources server actions.
 *
 * Thin wrappers. Each action gates on requireActionRole("EDITOR") and stamps the actor.
 * Validation + dedup live in the mutation layer.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
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

async function actorOrFail(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, error: gate.error }
  return { ok: true, userId: gate.user.id }
}
function bump() {
  revalidatePath(ROUTE)
}

export async function createSourceAction(
  input: CreateSourceInput,
): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await createTrustedSource(input, { actorId: actor.userId })
  bump()
  return r
}

export async function updateSourceAction(
  input: UpdateSourceInput,
): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await updateTrustedSource(input, { actorId: actor.userId })
  bump()
  return r
}

export async function setActiveAction(input: {
  id: string
  active: boolean
}): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await setSourceActive(input.id, input.active, { actorId: actor.userId })
  bump()
  return r
}

export async function archiveSourceAction(input: {
  id: string
}): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await archiveSource(input.id, { actorId: actor.userId })
  bump()
  return r
}

export async function restoreSourceAction(input: {
  id: string
}): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await restoreSource(input.id, { actorId: actor.userId })
  bump()
  return r
}

export async function adjustTrustAction(input: {
  id: string
  score: number
}): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await adjustTrustScore(input.id, input.score, { actorId: actor.userId })
  bump()
  return r
}

export async function adjustAlignmentAction(input: {
  id: string
  score: number
}): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await adjustAlignmentScore(input.id, input.score, { actorId: actor.userId })
  bump()
  return r
}

export async function setNotesAction(input: {
  id: string
  notes: string
}): Promise<MutationResult> {
  const actor = await actorOrFail()
  if (!actor.ok) return { ok: false, error: "actor_required", message: actor.error }
  const r = await setSourceNotes(input.id, input.notes, { actorId: actor.userId })
  bump()
  return r
}
