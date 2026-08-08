/**
 * Topic taxonomy — the subject axis the archive never had.
 *
 * `episode_categories` sounds like it would answer "what is this episode
 * about?" and does not: its three rows are «الموسم الاول», «سالفة» and
 * «مقاطع خط», which are PROGRAMS — the lane an episode belongs to, not its
 * subject. So there was no way to ask for "the invasion episodes" or "the
 * history ones". `topics` + `episode_topics` are that missing axis. Both
 * tables already existed (lib/db/schema/episode-graph.ts) and both were
 * empty — 0 rows on production — so nothing here needed a migration.
 *
 * An episode may carry any number of topics; a topic may hold any number of
 * episodes. The junction has a unique index on the pair, so re-tagging is
 * idempotent.
 */

import { db } from "@/lib/db"
import { topics, episodeTopics } from "@/lib/db/schema/episode-graph"
import { episodes } from "@/lib/db/schema"
import { eq, asc, inArray, sql } from "drizzle-orm"

export interface Topic {
  id: string
  name: string
  slug: string
  description: string | null
  /** How many PUBLISHED episodes carry this topic. */
  episodeCount: number
}

/**
 * Arabic-safe slug. `encodeURIComponent` handles the URL side, so the slug
 * keeps its Arabic letters instead of being transliterated into nothing —
 * a naive `[^a-z0-9]` filter turns «الغزو» into an empty string and every
 * topic collides on "".
 */
export function topicSlug(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

/**
 * Every topic with its published-episode count.
 *
 * TWO PLAIN QUERIES, NOT ONE CLEVER ONE. This started as a single select with a
 * correlated `sql<number>` subquery interpolating two tables, and it threw on
 * every call — so the `catch { return [] }` handed back "no topics" and the
 * homepage heading quietly fell back to «أحدث الحلقات» while the FILTER itself
 * worked. A section showing exactly the right episodes under exactly the wrong
 * title, with nothing in any log. Failures are logged now rather than swallowed.
 */
export async function listTopics(): Promise<Topic[]> {
  if (!db) return []
  try {
    const rows = await db
      .select({ id: topics.id, name: topics.name, slug: topics.slug, description: topics.description })
      .from(topics)
      .orderBy(asc(topics.name))
    if (rows.length === 0) return []

    const counts = await db
      .select({ topic_id: episodeTopics.topic_id, n: sql<number>`count(*)::int` })
      .from(episodeTopics)
      .innerJoin(episodes, eq(episodes.id, episodeTopics.episode_id))
      .where(eq(episodes.status, "published"))
      .groupBy(episodeTopics.topic_id)

    // `sql<number>` is a claim about the type, not a cast — aggregates have come
    // back as strings from this driver before, and a string in a sort is silent.
    const byTopic = new Map(counts.map((c) => [c.topic_id, Number(c.n) || 0]))
    return rows.map((r) => ({ ...r, episodeCount: byTopic.get(r.id) ?? 0 }))
  } catch (e) {
    console.error("[topics] listTopics failed:", e)
    return []
  }
}

/** Create a topic, or return the existing one with the same slug. */
export async function ensureTopic(name: string, description?: string): Promise<Topic | null> {
  const trimmed = name.trim()
  if (!trimmed || !db) return null
  const slug = topicSlug(trimmed)
  if (!slug) return null
  await db
    .insert(topics)
    .values({ name: trimmed, slug, description: description?.trim() || null })
    .onConflictDoNothing({ target: topics.slug })
  const [row] = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1)
  return row ? { ...row, episodeCount: 0 } : null
}

export async function deleteTopic(id: string): Promise<void> {
  // episode_topics cascades on topic_id — the tags go with it.
  await db!.delete(topics).where(eq(topics.id, id))
}

/** Topic ids currently on an episode. */
export async function getEpisodeTopicIds(episodeId: string): Promise<string[]> {
  if (!db) return []
  try {
    const rows = await db
      .select({ topic_id: episodeTopics.topic_id })
      .from(episodeTopics)
      .where(eq(episodeTopics.episode_id, episodeId))
    return rows.map((r) => r.topic_id)
  } catch {
    return []
  }
}

/** Replace an episode's topics with exactly this set. */
export async function setEpisodeTopics(episodeId: string, topicIds: string[]): Promise<void> {
  const d = db!
  await d.delete(episodeTopics).where(eq(episodeTopics.episode_id, episodeId))
  const clean = [...new Set(topicIds.filter(Boolean))]
  if (clean.length === 0) return
  await d
    .insert(episodeTopics)
    .values(clean.map((topic_id) => ({ episode_id: episodeId, topic_id })))
    .onConflictDoNothing()
}

/** Every episode id carrying a topic, newest-first by the episode's date. */
export async function episodeIdsForTopicSlug(slug: string): Promise<string[]> {
  if (!db) return []
  try {
    const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.slug, slug)).limit(1)
    if (!topic) return []
    const rows = await db
      .select({ episode_id: episodeTopics.episode_id })
      .from(episodeTopics)
      .where(eq(episodeTopics.topic_id, topic.id))
    return rows.map((r) => r.episode_id)
  } catch {
    return []
  }
}

/** Topics for many episodes at once — one query, for the tagging screen. */
export async function getTopicsForEpisodes(
  episodeIds: string[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  if (!db || episodeIds.length === 0) return out
  try {
    const rows = await db
      .select({ episode_id: episodeTopics.episode_id, topic_id: episodeTopics.topic_id })
      .from(episodeTopics)
      .where(inArray(episodeTopics.episode_id, episodeIds))
    for (const r of rows) (out[r.episode_id] ??= []).push(r.topic_id)
    return out
  } catch {
    return out
  }
}
