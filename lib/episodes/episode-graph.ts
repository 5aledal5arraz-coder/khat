/**
 * Episode knowledge-graph repository (Studio redesign, Goal 2).
 *
 * Read/write layer for the additive graph tables: episode_guests (multi-guest),
 * episode_relationships (semantic related episodes), topics + episode_topics
 * (taxonomy). The public knowledge-hub pages read through here; the Studio
 * push path + backfill write through here.
 */

import { db } from "@/lib/db"
import {
  episodeGuests,
  episodeRelationships,
  topics,
  episodeTopics,
  type EpisodeGuestRole,
  type EpisodeRelationType,
} from "@/lib/db/schema/episode-graph"
import { guests } from "@/lib/db/schema/guests"
import { desc, eq, inArray, sql } from "drizzle-orm"

// ─── Slug ───────────────────────────────────────────────────────────────

/**
 * Topic slug — preserves Arabic letters (URL-safe after percent-encoding),
 * lowercases Latin, strips diacritics/tatweel, collapses whitespace +
 * punctuation to hyphens.
 */
export function topicSlug(name: string): string {
  return (
    name
      .normalize("NFKC")
      .replace(/[ً-ْٰـ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "topic"
  )
}

// ─── episode_guests ─────────────────────────────────────────────────────

export interface EpisodeGuestRow {
  guest_id: string
  role: EpisodeGuestRole
  appearance_order: number
  name: string | null
  slug: string | null
  photo_url: string | null
}

export interface EpisodeGuestInput {
  guestId: string
  role?: EpisodeGuestRole
  order?: number
}

/** List the people on an episode, ordered, joined to guest display fields. */
export async function getEpisodeGuests(episodeId: string): Promise<EpisodeGuestRow[]> {
  if (!db) return []
  const rows = await db
    .select({
      guest_id: episodeGuests.guest_id,
      role: episodeGuests.role,
      appearance_order: episodeGuests.appearance_order,
      name: guests.name,
      slug: guests.slug,
      photo_url: guests.photo_url,
    })
    .from(episodeGuests)
    .leftJoin(guests, eq(episodeGuests.guest_id, guests.id))
    .where(eq(episodeGuests.episode_id, episodeId))
    .orderBy(episodeGuests.appearance_order)
  return rows as EpisodeGuestRow[]
}

/** Idempotently attach one guest to an episode (no-op if already linked). */
export async function addEpisodeGuest(
  episodeId: string,
  guestId: string,
  role: EpisodeGuestRole = "guest",
  order = 0,
): Promise<void> {
  if (!db) return
  await db
    .insert(episodeGuests)
    .values({ episode_id: episodeId, guest_id: guestId, role, appearance_order: order })
    .onConflictDoNothing({ target: [episodeGuests.episode_id, episodeGuests.guest_id] })
}

/** Replace the full guest list for an episode (used by the Studio push). */
export async function setEpisodeGuests(episodeId: string, list: EpisodeGuestInput[]): Promise<void> {
  if (!db) return
  await db.delete(episodeGuests).where(eq(episodeGuests.episode_id, episodeId))
  if (list.length === 0) return
  await db.insert(episodeGuests).values(
    list.map((g, i) => ({
      episode_id: episodeId,
      guest_id: g.guestId,
      role: g.role ?? "guest",
      appearance_order: g.order ?? i,
    })),
  )
}

/** Episodes a guest has appeared on (for the guest page). */
export async function getEpisodesForGuest(guestId: string): Promise<string[]> {
  if (!db) return []
  const rows = await db
    .select({ episode_id: episodeGuests.episode_id })
    .from(episodeGuests)
    .where(eq(episodeGuests.guest_id, guestId))
  return rows.map((r) => r.episode_id)
}

// ─── episode_relationships ──────────────────────────────────────────────

export interface RelatedEpisodeInput {
  relatedEpisodeId: string
  relationType?: EpisodeRelationType
  score?: number
}

/** Replace the related-episode set for an episode. */
export async function setEpisodeRelationships(episodeId: string, list: RelatedEpisodeInput[]): Promise<void> {
  if (!db) return
  await db.delete(episodeRelationships).where(eq(episodeRelationships.episode_id, episodeId))
  if (list.length === 0) return
  await db
    .insert(episodeRelationships)
    .values(
      list.map((r) => ({
        episode_id: episodeId,
        related_episode_id: r.relatedEpisodeId,
        relation_type: r.relationType ?? "related",
        score: r.score ?? 0,
      })),
    )
    .onConflictDoNothing({
      target: [episodeRelationships.episode_id, episodeRelationships.related_episode_id, episodeRelationships.relation_type],
    })
}

/**
 * Related episode ids for an episode, highest score first.
 *
 * One episode may be linked under several relation_types (uq_episode_rel
 * permits it), so we de-dupe by related_episode_id IN SQL — keeping the max
 * score per target — BEFORE applying the limit. Doing it after the limit
 * (the naive way) silently under-returns when a target occupies >1 of the
 * top rows.
 */
export async function getRelatedEpisodeIds(episodeId: string, limit = 6): Promise<string[]> {
  if (!db) return []
  const rows = await db
    .select({
      related_episode_id: episodeRelationships.related_episode_id,
      best: sql<number>`max(${episodeRelationships.score})`,
    })
    .from(episodeRelationships)
    .where(eq(episodeRelationships.episode_id, episodeId))
    .groupBy(episodeRelationships.related_episode_id)
    .orderBy(desc(sql`max(${episodeRelationships.score})`))
    .limit(limit)
  return rows.map((r) => r.related_episode_id)
}

// ─── topics + episode_topics ────────────────────────────────────────────

export interface TopicRow {
  id: string
  name: string
  slug: string
}

/** Get-or-create a topic by name (slug derived, unique). */
export async function upsertTopic(name: string): Promise<TopicRow | null> {
  if (!db) return null
  const trimmed = name.trim()
  if (!trimmed) return null
  const slug = topicSlug(trimmed)

  const existing = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1)
  if (existing[0]) return { id: existing[0].id, name: existing[0].name, slug: existing[0].slug }

  const [row] = await db
    .insert(topics)
    .values({ name: trimmed, slug })
    .onConflictDoNothing({ target: topics.slug })
    .returning()
  if (row) return { id: row.id, name: row.name, slug: row.slug }

  // Lost a race — re-read.
  const after = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1)
  return after[0] ? { id: after[0].id, name: after[0].name, slug: after[0].slug } : null
}

/** Replace the topic set for an episode (creates topics as needed). */
export async function setEpisodeTopics(episodeId: string, names: string[]): Promise<TopicRow[]> {
  if (!db) return []
  const resolvedRaw: TopicRow[] = []
  for (const n of names) {
    const t = await upsertTopic(n)
    if (t) resolvedRaw.push(t)
  }
  // Distinct display names can slug to the same topic id — de-dupe by id so we
  // neither insert in-batch duplicates nor return a topic twice to callers.
  const resolved = [...new Map(resolvedRaw.map((t) => [t.id, t])).values()]
  await db.delete(episodeTopics).where(eq(episodeTopics.episode_id, episodeId))
  if (resolved.length > 0) {
    await db
      .insert(episodeTopics)
      .values(resolved.map((t) => ({ episode_id: episodeId, topic_id: t.id })))
      .onConflictDoNothing({ target: [episodeTopics.episode_id, episodeTopics.topic_id] })
  }
  return resolved
}

/** Topics attached to an episode. */
export async function getEpisodeTopics(episodeId: string): Promise<TopicRow[]> {
  if (!db) return []
  const rows = await db
    .select({ id: topics.id, name: topics.name, slug: topics.slug })
    .from(episodeTopics)
    .innerJoin(topics, eq(episodeTopics.topic_id, topics.id))
    .where(eq(episodeTopics.episode_id, episodeId))
  return rows
}

/** A topic by slug (for topic pages). */
export async function getTopicBySlug(slug: string): Promise<TopicRow | null> {
  if (!db) return null
  const rows = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1)
  return rows[0] ? { id: rows[0].id, name: rows[0].name, slug: rows[0].slug } : null
}

/** Episode ids tagged with a topic. */
export async function getEpisodesForTopic(topicId: string): Promise<string[]> {
  if (!db) return []
  const rows = await db
    .select({ episode_id: episodeTopics.episode_id })
    .from(episodeTopics)
    .where(eq(episodeTopics.topic_id, topicId))
  return rows.map((r) => r.episode_id)
}

/** Topics with their episode counts (for a topic index page). */
export async function listTopicsWithCounts(): Promise<Array<TopicRow & { episode_count: number }>> {
  if (!db) return []
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      slug: topics.slug,
      episode_count: sql<number>`count(${episodeTopics.episode_id})`,
    })
    .from(topics)
    .leftJoin(episodeTopics, eq(episodeTopics.topic_id, topics.id))
    .groupBy(topics.id, topics.name, topics.slug)
    .orderBy(desc(sql`count(${episodeTopics.episode_id})`))
  return rows.map((r) => ({ ...r, episode_count: Number(r.episode_count) }))
}

/** Bulk-load guests for a set of episodes (for related-episode cards). */
export async function getEpisodeGuestsBulk(episodeIds: string[]): Promise<Record<string, EpisodeGuestRow[]>> {
  if (!db || episodeIds.length === 0) return {}
  const rows = await db
    .select({
      episode_id: episodeGuests.episode_id,
      guest_id: episodeGuests.guest_id,
      role: episodeGuests.role,
      appearance_order: episodeGuests.appearance_order,
      name: guests.name,
      slug: guests.slug,
      photo_url: guests.photo_url,
    })
    .from(episodeGuests)
    .leftJoin(guests, eq(episodeGuests.guest_id, guests.id))
    .where(inArray(episodeGuests.episode_id, episodeIds))
    .orderBy(episodeGuests.appearance_order)
  const out: Record<string, EpisodeGuestRow[]> = {}
  for (const r of rows) {
    const { episode_id, ...rest } = r
    ;(out[episode_id] ??= []).push(rest as EpisodeGuestRow)
  }
  return out
}
