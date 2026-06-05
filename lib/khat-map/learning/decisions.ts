/**
 * Decision journal for Khat Map v2.
 *
 * The journal is append-only: every accept / reject / skip the admin
 * makes in the wizard lands here and is NEVER deleted. `undone_at` is
 * set when the 10-second undo toast is tapped — the row stays, but
 * downstream consumers filter it out.
 *
 * This module is pure DB access — no AI, no similarity math. The batch
 * engine (PR2) and the taste recompute (this PR) both read from here.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapSeasonDecisions } from "@/lib/db/schema/khat-map"
import type {
  KhatMapSeasonDecision,
  KhatMapDecisionKind,
  KhatMapDecisionTarget,
  KhatMapFeedbackReasonCategory,
} from "@/types/khat-map"

type DecisionRow = typeof khatMapSeasonDecisions.$inferSelect

/** 10-second undo window, matching the UX spec. */
export const UNDO_WINDOW_MS = 10_000

function mapDecision(row: DecisionRow): KhatMapSeasonDecision {
  return {
    id: row.id,
    season_id: row.season_id,
    admin_id: row.admin_id,
    batch_index: row.batch_index,
    kind: row.kind,
    target: row.target,
    topic_candidate_id: row.topic_candidate_id,
    guest_candidate_id: row.guest_candidate_id,
    reason_category: row.reason_category,
    reason_text: row.reason_text,
    undone_at: row.undone_at ? row.undone_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
  }
}

export interface RecordDecisionInput {
  season_id: string
  admin_id?: string | null
  batch_index?: number
  kind: KhatMapDecisionKind
  target?: KhatMapDecisionTarget
  topic_candidate_id?: string | null
  guest_candidate_id?: string | null
  reason_category?: KhatMapFeedbackReasonCategory | null
  reason_text?: string | null
}

/**
 * Append one decision to the journal. The only invariant enforced here
 * is that target=pair implies at least one candidate id is present —
 * accepting a pair with no topic or guest is a caller bug.
 */
export async function recordDecision(
  input: RecordDecisionInput,
): Promise<KhatMapSeasonDecision> {
  if (
    (input.target ?? "pair") === "pair" &&
    !input.topic_candidate_id &&
    !input.guest_candidate_id
  ) {
    throw new Error(
      "recordDecision: a 'pair' decision must carry at least one candidate id",
    )
  }
  const [row] = await db!
    .insert(khatMapSeasonDecisions)
    .values({
      season_id: input.season_id,
      admin_id: input.admin_id ?? null,
      batch_index: input.batch_index ?? 0,
      kind: input.kind,
      target: input.target ?? "pair",
      topic_candidate_id: input.topic_candidate_id ?? null,
      guest_candidate_id: input.guest_candidate_id ?? null,
      reason_category: input.reason_category ?? null,
      reason_text: input.reason_text ?? null,
    })
    .returning()
  return mapDecision(row)
}

/**
 * Mark a decision as undone. Returns null when the undo window has
 * already elapsed — UI should surface this as "too late to undo"
 * rather than silently failing.
 */
export async function undoDecision(
  decision_id: string,
  opts: { window_ms?: number } = {},
): Promise<KhatMapSeasonDecision | null> {
  const window = opts.window_ms ?? UNDO_WINDOW_MS
  const rows = await db!
    .select()
    .from(khatMapSeasonDecisions)
    .where(eq(khatMapSeasonDecisions.id, decision_id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.undone_at) return mapDecision(row) // already undone — idempotent
  const ageMs = Date.now() - new Date(row.created_at).getTime()
  if (ageMs > window) return null
  const [updated] = await db!
    .update(khatMapSeasonDecisions)
    .set({ undone_at: new Date() })
    .where(eq(khatMapSeasonDecisions.id, decision_id))
    .returning()
  return mapDecision(updated)
}

/**
 * List decisions that still count — drops any row with `undone_at` set.
 * This is the default read for state-computation code (batch engine,
 * taste recompute, UI progress bar).
 */
export async function listEffectiveDecisions(
  season_id: string,
): Promise<KhatMapSeasonDecision[]> {
  const rows = await db!
    .select()
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        isNull(khatMapSeasonDecisions.undone_at),
      ),
    )
    .orderBy(desc(khatMapSeasonDecisions.created_at))
  return rows.map(mapDecision)
}

/** Full history including undone rows — for audit / debug. */
export async function listAllDecisions(
  season_id: string,
): Promise<KhatMapSeasonDecision[]> {
  const rows = await db!
    .select()
    .from(khatMapSeasonDecisions)
    .where(eq(khatMapSeasonDecisions.season_id, season_id))
    .orderBy(desc(khatMapSeasonDecisions.created_at))
  return rows.map(mapDecision)
}

/**
 * Cross-season decisions for one admin user — feeds the taste profile
 * recompute. Filters undone.
 */
export async function listDecisionsByAdmin(
  admin_id: string,
): Promise<KhatMapSeasonDecision[]> {
  const rows = await db!
    .select()
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.admin_id, admin_id),
        isNull(khatMapSeasonDecisions.undone_at),
      ),
    )
    .orderBy(desc(khatMapSeasonDecisions.created_at))
  return rows.map(mapDecision)
}

/** Count of effective decisions for a season — cheap dashboard stat. */
export async function countEffectiveDecisions(
  season_id: string,
): Promise<{ accept: number; reject: number; skip: number }> {
  const rows = await db!
    .select({
      kind: khatMapSeasonDecisions.kind,
      c: sql<number>`count(*)::int`,
    })
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        isNull(khatMapSeasonDecisions.undone_at),
      ),
    )
    .groupBy(khatMapSeasonDecisions.kind)
  const out = { accept: 0, reject: 0, skip: 0 }
  for (const r of rows) {
    if (r.kind === "accept") out.accept = r.c
    else if (r.kind === "reject") out.reject = r.c
    else if (r.kind === "skip") out.skip = r.c
  }
  return out
}
