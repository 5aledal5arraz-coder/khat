/**
 * Phase X Step 2 — Original Thinking topic bank CRUD.
 *
 * Pure data-access functions for the original_thinking_topics table.
 * The generator and the admin UI both consume these — no direct table
 * access elsewhere.
 */

import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { originalThinkingTopics } from "@/lib/db/schema/original-thinking"

export interface OriginalThinkingTopic {
  id: string
  title: string
  lens: string
  philosophical_frame: string
  conflict: string
  emotional_hook: string
  language: string
  generated_at: string
  consumed_at: string | null
  expires_at: string
  /** Derived: true when expires_at < now and not consumed. */
  is_expired: boolean
  is_consumed: boolean
}

export interface ListOptions {
  language?: string
  lens?: string
  /** include consumed rows (default false) */
  includeConsumed?: boolean
  /** include expired rows (default false) */
  includeExpired?: boolean
  limit?: number
  offset?: number
}

export async function listOriginalThinkingTopics(
  opts: ListOptions = {},
): Promise<OriginalThinkingTopic[]> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0
  const conds: SQL[] = []
  if (opts.language) conds.push(eq(originalThinkingTopics.language, opts.language))
  if (opts.lens) conds.push(eq(originalThinkingTopics.lens, opts.lens))
  if (!opts.includeConsumed) conds.push(isNull(originalThinkingTopics.consumed_at))

  const rows = await db!
    .select()
    .from(originalThinkingTopics)
    .where(conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds))
    .orderBy(desc(originalThinkingTopics.generated_at))
    .limit(limit)
    .offset(offset)

  const now = Date.now()
  return rows
    .map((r) => mapRow(r, now))
    .filter((r) => (opts.includeExpired ? true : !r.is_expired))
}

export async function getOriginalThinkingTopic(
  id: string,
): Promise<OriginalThinkingTopic | null> {
  const rows = await db!
    .select()
    .from(originalThinkingTopics)
    .where(eq(originalThinkingTopics.id, id))
    .limit(1)
  if (!rows[0]) return null
  return mapRow(rows[0], Date.now())
}

export async function getExistingTitles(language?: string): Promise<string[]> {
  const rows = await db!
    .select({ title: originalThinkingTopics.title, language: originalThinkingTopics.language })
    .from(originalThinkingTopics)
    .where(language ? eq(originalThinkingTopics.language, language) : undefined)
  return rows.map((r) => r.title)
}

export async function markOriginalTopicConsumed(id: string): Promise<boolean> {
  const r = await db!
    .update(originalThinkingTopics)
    .set({ consumed_at: new Date() })
    .where(
      and(
        eq(originalThinkingTopics.id, id),
        isNull(originalThinkingTopics.consumed_at),
      ),
    )
    .returning({ id: originalThinkingTopics.id })
  return r.length > 0
}

export async function expireOldOriginalTopics(): Promise<{ expired: number }> {
  // Delete rows whose expires_at has passed AND that were never consumed.
  // Consumed rows stay forever (history). Expired-unconsumed are dropped.
  const r = await db!.execute(sql`
    DELETE FROM original_thinking_topics
     WHERE consumed_at IS NULL AND expires_at <= now()
     RETURNING id
  `)
  return { expired: (r.rows as Array<{ id: string }>).length }
}

export interface InsertableTopic {
  title: string
  lens: string
  philosophical_frame: string
  conflict: string
  emotional_hook: string
  language: string
}

export async function insertOriginalTopics(
  rows: InsertableTopic[],
  opts?: { ttlDays?: number },
): Promise<OriginalThinkingTopic[]> {
  if (rows.length === 0) return []
  const ttlDays = opts?.ttlDays ?? 90
  const now = new Date()
  const expires_at = new Date(now.getTime() + ttlDays * 86400_000)
  const inserted = await db!
    .insert(originalThinkingTopics)
    .values(
      rows.map((r) => ({
        title: r.title,
        lens: r.lens,
        philosophical_frame: r.philosophical_frame,
        conflict: r.conflict,
        emotional_hook: r.emotional_hook,
        language: r.language,
        generated_at: now,
        expires_at,
      })),
    )
    .returning()
  const ts = Date.now()
  return inserted.map((r) => mapRow(r, ts))
}

function mapRow(
  r: typeof originalThinkingTopics.$inferSelect,
  nowMs: number,
): OriginalThinkingTopic {
  const expiresAt = r.expires_at
  const isExpired = expiresAt.getTime() <= nowMs
  return {
    id: r.id,
    title: r.title,
    lens: r.lens,
    philosophical_frame: r.philosophical_frame,
    conflict: r.conflict,
    emotional_hook: r.emotional_hook,
    language: r.language,
    generated_at: r.generated_at.toISOString(),
    consumed_at: r.consumed_at ? r.consumed_at.toISOString() : null,
    expires_at: expiresAt.toISOString(),
    is_expired: isExpired,
    is_consumed: r.consumed_at !== null,
  }
}
