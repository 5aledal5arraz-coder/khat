/**
 * Phase 2 — Market Signals review mutations.
 *
 * Every mutation here:
 *   1. Updates the signal row.
 *   2. Writes a row to `market_signal_review_events` (audit log + Phase 5
 *      learning input). The two writes go in a single transaction so we
 *      never have an audit gap.
 *   3. Returns a small diff so the caller can revalidate cleanly.
 *
 * Hard rule: NO mutation here is allowed to fire from a non-operator
 * context. Server actions enforce `requireAdmin()` + pass `actor_id`.
 * That keeps approve/reject strictly human.
 *
 * Tag vocabulary is closed (SIGNAL_EDITORIAL_TAGS). Mutations validate
 * against that vocabulary before writing.
 */

import { sql, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { marketTopicSignals } from "@/lib/db/schema/market-intelligence"
import {
  marketSignalReviewEvents,
  SIGNAL_EDITORIAL_TAGS,
  type SignalEditorialTag,
  type SignalReviewStatus,
  type SignalReviewAction,
} from "@/lib/db/schema/editorial-intelligence"
import { applyReviewEventLearning } from "./taste-learning"

export interface MutationContext {
  /** admin_users.id — required. Mutations refuse to run with a null
   *  actor. Operator decisions only. */
  actorId: string
}

export interface SingleSignalResult {
  ok: boolean
  signalId: string
  previousStatus: SignalReviewStatus | null
  newStatus: SignalReviewStatus | null
  eventId: string | null
  message?: string
}

export interface BulkResult {
  ok: boolean
  affected: number
  eventIds: string[]
  skipped: string[]
}

// ─── Learning hook ───────────────────────────────────────────────────
// Fire-and-forget — never blocks the mutation. We lift the signal's
// taste context after the audit row is written, then apply soft EMA
// updates to editorial_taste_weights.

async function pushLearning(
  signalId: string,
  action: SignalReviewAction,
  tag?: SignalEditorialTag,
): Promise<void> {
  if (!db) return
  try {
    const [ctx] = await db
      .select({
        theme: marketTopicSignals.theme,
        language: marketTopicSignals.language,
        trusted_source_id: marketTopicSignals.trusted_source_id,
        operator_created: marketTopicSignals.operator_created,
      })
      .from(marketTopicSignals)
      .where(eq(marketTopicSignals.id, signalId))
      .limit(1)
    if (!ctx) return
    await applyReviewEventLearning({
      action,
      tag,
      ctx: {
        theme: (ctx.theme as string | null) ?? null,
        language: (ctx.language as string | null) ?? "ar",
        trusted_source_id:
          (ctx.trusted_source_id as string | null) ?? null,
        operator_created: ctx.operator_created === true,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[review-mutations] learning push failed:", msg)
  }
}

// ─── Status transitions ──────────────────────────────────────────────

async function transition(
  signalId: string,
  newStatus: SignalReviewStatus,
  action: "approve" | "reject" | "archive" | "restore",
  ctx: MutationContext,
  note?: string,
): Promise<SingleSignalResult> {
  if (!db) {
    return {
      ok: false,
      signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: "db_unavailable",
    }
  }
  if (!ctx.actorId) {
    return {
      ok: false,
      signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: "actor_required",
    }
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ review_status: marketTopicSignals.review_status })
      .from(marketTopicSignals)
      .where(eq(marketTopicSignals.id, signalId))
      .limit(1)
    if (!current) {
      return {
        ok: false,
        signalId,
        previousStatus: null,
        newStatus: null,
        eventId: null,
        message: "signal_not_found",
      }
    }
    const previousStatus = current.review_status as SignalReviewStatus

    await tx
      .update(marketTopicSignals)
      .set({
        review_status: newStatus,
        reviewed_by: ctx.actorId,
        reviewed_at: new Date(),
        ...(note ? { operator_notes: note } : {}),
      })
      .where(eq(marketTopicSignals.id, signalId))

    const [event] = await tx
      .insert(marketSignalReviewEvents)
      .values({
        signal_id: signalId,
        actor_id: ctx.actorId,
        action,
        previous_status: previousStatus,
        new_status: newStatus,
        note: note ?? null,
      })
      .returning({ id: marketSignalReviewEvents.id })

    return {
      ok: true,
      signalId,
      previousStatus,
      newStatus,
      eventId: event.id,
    }
  })
}

async function transitionWithLearning(
  signalId: string,
  newStatus: SignalReviewStatus,
  action: "approve" | "reject" | "archive" | "restore",
  ctx: MutationContext,
  note?: string,
): Promise<SingleSignalResult> {
  const r = await transition(signalId, newStatus, action, ctx, note)
  if (r.ok) await pushLearning(signalId, action)
  return r
}

export function approveSignal(
  signalId: string,
  ctx: MutationContext,
  note?: string,
) {
  return transitionWithLearning(signalId, "approved", "approve", ctx, note)
}

export function rejectSignal(
  signalId: string,
  ctx: MutationContext,
  note?: string,
) {
  return transitionWithLearning(signalId, "rejected", "reject", ctx, note)
}

export function archiveSignal(
  signalId: string,
  ctx: MutationContext,
  note?: string,
) {
  return transitionWithLearning(signalId, "archived", "archive", ctx, note)
}

export function restoreSignal(
  signalId: string,
  ctx: MutationContext,
  note?: string,
) {
  return transitionWithLearning(signalId, "new", "restore", ctx, note)
}

// ─── Tagging ─────────────────────────────────────────────────────────

async function mutateTag(
  signalId: string,
  tag: SignalEditorialTag,
  op: "add" | "remove",
  ctx: MutationContext,
): Promise<SingleSignalResult> {
  if (!db || !ctx.actorId) {
    return {
      ok: false,
      signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: !db ? "db_unavailable" : "actor_required",
    }
  }
  if (!(SIGNAL_EDITORIAL_TAGS as readonly string[]).includes(tag)) {
    return {
      ok: false,
      signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: "invalid_tag",
    }
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        review_status: marketTopicSignals.review_status,
        editorial_tags: marketTopicSignals.editorial_tags,
      })
      .from(marketTopicSignals)
      .where(eq(marketTopicSignals.id, signalId))
      .limit(1)
    if (!current) {
      return {
        ok: false,
        signalId,
        previousStatus: null,
        newStatus: null,
        eventId: null,
        message: "signal_not_found",
      }
    }
    const existing: string[] = Array.isArray(current.editorial_tags)
      ? (current.editorial_tags as string[])
      : []
    const nextTags =
      op === "add"
        ? Array.from(new Set([...existing, tag]))
        : existing.filter((t) => t !== tag)

    await tx
      .update(marketTopicSignals)
      .set({ editorial_tags: nextTags })
      .where(eq(marketTopicSignals.id, signalId))

    const [event] = await tx
      .insert(marketSignalReviewEvents)
      .values({
        signal_id: signalId,
        actor_id: ctx.actorId,
        action: op === "add" ? "tag" : "untag",
        tag,
      })
      .returning({ id: marketSignalReviewEvents.id })

    return {
      ok: true,
      signalId,
      previousStatus: current.review_status as SignalReviewStatus,
      newStatus: current.review_status as SignalReviewStatus,
      eventId: event.id,
    }
  })
}

export async function addSignalTag(
  signalId: string,
  tag: SignalEditorialTag,
  ctx: MutationContext,
): Promise<SingleSignalResult> {
  const r = await mutateTag(signalId, tag, "add", ctx)
  if (r.ok) await pushLearning(signalId, "tag", tag)
  return r
}

export async function removeSignalTag(
  signalId: string,
  tag: SignalEditorialTag,
  ctx: MutationContext,
): Promise<SingleSignalResult> {
  const r = await mutateTag(signalId, tag, "remove", ctx)
  if (r.ok) await pushLearning(signalId, "untag", tag)
  return r
}

// ─── Notes ───────────────────────────────────────────────────────────

export async function setSignalNote(
  signalId: string,
  note: string,
  ctx: MutationContext,
): Promise<SingleSignalResult> {
  if (!db || !ctx.actorId) {
    return {
      ok: false,
      signalId,
      previousStatus: null,
      newStatus: null,
      eventId: null,
      message: !db ? "db_unavailable" : "actor_required",
    }
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ review_status: marketTopicSignals.review_status })
      .from(marketTopicSignals)
      .where(eq(marketTopicSignals.id, signalId))
      .limit(1)
    if (!current) {
      return {
        ok: false,
        signalId,
        previousStatus: null,
        newStatus: null,
        eventId: null,
        message: "signal_not_found",
      }
    }
    await tx
      .update(marketTopicSignals)
      .set({ operator_notes: note })
      .where(eq(marketTopicSignals.id, signalId))

    const [event] = await tx
      .insert(marketSignalReviewEvents)
      .values({
        signal_id: signalId,
        actor_id: ctx.actorId,
        action: "note",
        note,
      })
      .returning({ id: marketSignalReviewEvents.id })

    return {
      ok: true,
      signalId,
      previousStatus: current.review_status as SignalReviewStatus,
      newStatus: current.review_status as SignalReviewStatus,
      eventId: event.id,
    }
  })
}

// ─── Bulk variants ───────────────────────────────────────────────────
// Each bulk runs in a single transaction; events are written per row
// so the audit trail still shows individual decisions.

async function bulkTransition(
  signalIds: string[],
  newStatus: SignalReviewStatus,
  action: "approve" | "reject" | "archive",
  ctx: MutationContext,
): Promise<BulkResult> {
  if (!db || !ctx.actorId) {
    return {
      ok: false,
      affected: 0,
      eventIds: [],
      skipped: signalIds,
    }
  }
  if (signalIds.length === 0) {
    return { ok: true, affected: 0, eventIds: [], skipped: [] }
  }
  return db.transaction(async (tx) => {
    const current = await tx
      .select({
        id: marketTopicSignals.id,
        review_status: marketTopicSignals.review_status,
      })
      .from(marketTopicSignals)
      .where(inArray(marketTopicSignals.id, signalIds))
    const knownIds = new Set(current.map((c) => c.id))
    const skipped = signalIds.filter((id) => !knownIds.has(id))

    await tx
      .update(marketTopicSignals)
      .set({
        review_status: newStatus,
        reviewed_by: ctx.actorId,
        reviewed_at: new Date(),
      })
      .where(inArray(marketTopicSignals.id, Array.from(knownIds)))

    const eventRows = current.map((c) => ({
      signal_id: c.id,
      actor_id: ctx.actorId,
      action,
      previous_status: c.review_status as SignalReviewStatus,
      new_status: newStatus,
    }))
    if (eventRows.length === 0) {
      return { ok: true, affected: 0, eventIds: [], skipped }
    }
    const events = await tx
      .insert(marketSignalReviewEvents)
      .values(eventRows)
      .returning({ id: marketSignalReviewEvents.id })

    return {
      ok: true,
      affected: current.length,
      eventIds: events.map((e) => e.id),
      skipped,
    }
  })
}

async function bulkTransitionWithLearning(
  signalIds: string[],
  newStatus: SignalReviewStatus,
  action: "approve" | "reject" | "archive",
  ctx: MutationContext,
): Promise<BulkResult> {
  const r = await bulkTransition(signalIds, newStatus, action, ctx)
  if (r.ok && r.affected > 0) {
    const known = signalIds.filter((id) => !r.skipped.includes(id))
    await Promise.all(known.map((id) => pushLearning(id, action)))
  }
  return r
}

export function bulkApproveSignals(signalIds: string[], ctx: MutationContext) {
  return bulkTransitionWithLearning(signalIds, "approved", "approve", ctx)
}
export function bulkRejectSignals(signalIds: string[], ctx: MutationContext) {
  return bulkTransitionWithLearning(signalIds, "rejected", "reject", ctx)
}
export function bulkArchiveSignals(signalIds: string[], ctx: MutationContext) {
  return bulkTransitionWithLearning(signalIds, "archived", "archive", ctx)
}

export async function bulkAddSignalTag(
  signalIds: string[],
  tag: SignalEditorialTag,
  ctx: MutationContext,
): Promise<BulkResult> {
  if (!db || !ctx.actorId) {
    return { ok: false, affected: 0, eventIds: [], skipped: signalIds }
  }
  if (!(SIGNAL_EDITORIAL_TAGS as readonly string[]).includes(tag)) {
    return { ok: false, affected: 0, eventIds: [], skipped: signalIds }
  }
  if (signalIds.length === 0) {
    return { ok: true, affected: 0, eventIds: [], skipped: [] }
  }
  return db.transaction(async (tx) => {
    // Use a SQL-level upsert of the tag inside the jsonb array so we
    // avoid a read-modify-write race when bulk-tagging is concurrent.
    await tx.execute(sql`
      UPDATE market_topic_signals
         SET editorial_tags = (
           SELECT to_jsonb(array_agg(DISTINCT t))
           FROM jsonb_array_elements_text(
             COALESCE(editorial_tags, '[]'::jsonb) || ${JSON.stringify([tag])}::jsonb
           ) AS t
         )
       WHERE id = ANY(${signalIds})
    `)
    const eventRows = signalIds.map((id) => ({
      signal_id: id,
      actor_id: ctx.actorId,
      action: "tag" as const,
      tag,
    }))
    const events = await tx
      .insert(marketSignalReviewEvents)
      .values(eventRows)
      .returning({ id: marketSignalReviewEvents.id })
    return {
      ok: true,
      affected: signalIds.length,
      eventIds: events.map((e) => e.id),
      skipped: [],
    }
  }).then(async (r) => {
    if (r.ok && r.affected > 0) {
      await Promise.all(signalIds.map((id) => pushLearning(id, "tag", tag)))
    }
    return r
  })
}
