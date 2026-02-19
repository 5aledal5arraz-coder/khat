import { stat } from "fs/promises"
import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmotionalPathSlug =
  | "understanding-people"
  | "motivation-work"
  | "faith-meaning"
  | "self-awareness"

export interface EpisodeAnalysis {
  episode_id: string
  title: string
  slug: string
  season: number | null
  guest_name: string | null
  main_topic: string
  secondary_topics: string[]
  emotional_path: EmotionalPathSlug
  keywords: string[]
  mood: string
  best_quote: {
    text: string
    attribution: string
    theme: string
  }
  reflection: {
    short_quote: string
    reflection_text: string
    thinking_question: string
  }
  related_episode_ids: string[]
}

export interface TopicEntry {
  name: string
  slug: string
  count: number
  episode_ids: string[]
}

export interface EpisodeKnowledgeMap {
  episodes: Record<string, EpisodeAnalysis>
  topic_taxonomy: TopicEntry[]
  relationships: Record<string, string[]>
  analyzed_at: string
  season_1_count: number
  season_2_count: number
}

// ---------------------------------------------------------------------------
// Config store (atomic writes + queue) — JSON fallback
// ---------------------------------------------------------------------------

const store = createConfigStore<EpisodeKnowledgeMap | null>("episode-knowledge-map.json", null)

// ---------------------------------------------------------------------------
// In-memory cache with TTL (5 minutes)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000

let memoryCache: EpisodeKnowledgeMap | null = null
let memoryCacheTime: number = 0
// For JSON fallback: mtime-based invalidation
let memoryCacheMtimeMs: number = 0

function isCacheValid(): boolean {
  if (!memoryCache) return false
  if (USE_DB) {
    return Date.now() - memoryCacheTime < CACHE_TTL_MS
  }
  return true // for JSON, validity is checked via mtime
}

async function getFileMtime(): Promise<number> {
  try {
    const s = await stat(store.filePath)
    return s.mtimeMs
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getKnowledgeMap(): Promise<EpisodeKnowledgeMap | null> {
  if (USE_DB) {
    // TTL-based cache
    if (isCacheValid()) return memoryCache

    try {
      const [episodesRes, metaRes] = await Promise.all([
        pool!.query(`SELECT episode_id, analysis FROM episode_knowledge`),
        pool!.query(`SELECT * FROM episode_knowledge_meta WHERE key = $1 LIMIT 1`, ["meta"]),
      ])

      if (metaRes.rows[0]) {
        const episodes: Record<string, EpisodeAnalysis> = {}
        for (const row of episodesRes.rows) {
          episodes[row.episode_id] = row.analysis as EpisodeAnalysis
        }

        const meta = metaRes.rows[0]
        const map: EpisodeKnowledgeMap = {
          episodes,
          topic_taxonomy: (meta.topic_taxonomy as TopicEntry[]) || [],
          relationships: (meta.relationships as Record<string, string[]>) || {},
          analyzed_at: meta.analyzed_at || new Date().toISOString(),
          season_1_count: meta.season_1_count || 0,
          season_2_count: meta.season_2_count || 0,
        }

        memoryCache = map
        memoryCacheTime = Date.now()
        return map
      }
    } catch (e) {
      console.error("getKnowledgeMap DB exception:", e)
    }
  }

  // JSON fallback with mtime-based cache
  const currentMtime = await getFileMtime()
  if (memoryCache && currentMtime === memoryCacheMtimeMs) {
    return memoryCache
  }
  memoryCache = await store.read()
  memoryCacheMtimeMs = currentMtime
  return memoryCache
}

export async function saveKnowledgeMap(map: EpisodeKnowledgeMap): Promise<void> {
  if (USE_DB) {
    try {
      // Upsert per-episode rows
      const episodeRows = Object.entries(map.episodes)

      // Batch in chunks of 50
      for (let i = 0; i < episodeRows.length; i += 50) {
        const chunk = episodeRows.slice(i, i + 50)
        for (const [episodeId, analysis] of chunk) {
          await pool!.query(
            `INSERT INTO episode_knowledge (episode_id, analysis)
             VALUES ($1, $2)
             ON CONFLICT (episode_id) DO UPDATE SET analysis = EXCLUDED.analysis`,
            [episodeId, JSON.stringify(analysis)]
          )
        }
      }

      // Upsert meta row
      await pool!.query(
        `INSERT INTO episode_knowledge_meta (key, topic_taxonomy, relationships, analyzed_at, season_1_count, season_2_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (key) DO UPDATE SET
           topic_taxonomy = EXCLUDED.topic_taxonomy,
           relationships = EXCLUDED.relationships,
           analyzed_at = EXCLUDED.analyzed_at,
           season_1_count = EXCLUDED.season_1_count,
           season_2_count = EXCLUDED.season_2_count`,
        [
          "meta",
          JSON.stringify(map.topic_taxonomy),
          JSON.stringify(map.relationships),
          map.analyzed_at,
          map.season_1_count,
          map.season_2_count,
        ]
      )

      // Update memory cache
      memoryCache = map
      memoryCacheTime = Date.now()
      return
    } catch (e) {
      console.error("saveKnowledgeMap DB exception:", e)
    }
  }

  await store.write(map)
  // Update memory cache immediately
  memoryCache = map
  memoryCacheMtimeMs = await getFileMtime()
}

// ---------------------------------------------------------------------------
// Relationship computation (topic overlap)
// ---------------------------------------------------------------------------

/**
 * Compute related episodes based on topic overlap.
 * Returns top 5 related episodes per episode.
 */
export function computeRelationships(
  episodes: Record<string, EpisodeAnalysis>
): Record<string, string[]> {
  const ids = Object.keys(episodes)
  const relationships: Record<string, string[]> = {}

  for (const id of ids) {
    const ep = episodes[id]
    const epTopics = new Set([
      ep.main_topic,
      ...ep.secondary_topics,
      ...ep.keywords,
    ])

    const scored: { id: string; score: number }[] = []

    for (const otherId of ids) {
      if (otherId === id) continue
      const other = episodes[otherId]
      const otherTopics = new Set([
        other.main_topic,
        ...other.secondary_topics,
        ...other.keywords,
      ])

      // Count overlap
      let score = 0
      for (const t of epTopics) {
        if (otherTopics.has(t)) score++
      }

      // Bonus for same emotional path
      if (ep.emotional_path === other.emotional_path) score += 2

      // Bonus for same mood
      if (ep.mood === other.mood) score += 1

      if (score > 0) {
        scored.push({ id: otherId, score })
      }
    }

    // Sort by score descending, take top 5
    scored.sort((a, b) => b.score - a.score)
    relationships[id] = scored.slice(0, 5).map((s) => s.id)
  }

  return relationships
}

/**
 * Build global topic taxonomy from all episode analyses.
 */
export function buildTopicTaxonomy(
  episodes: Record<string, EpisodeAnalysis>
): TopicEntry[] {
  const topicMap = new Map<string, { count: number; episode_ids: string[] }>()

  for (const [id, ep] of Object.entries(episodes)) {
    const allTopics = [ep.main_topic, ...ep.secondary_topics]

    for (const topic of allTopics) {
      const normalized = topic.trim()
      if (!normalized) continue

      const existing = topicMap.get(normalized)
      if (existing) {
        existing.count++
        if (!existing.episode_ids.includes(id)) {
          existing.episode_ids.push(id)
        }
      } else {
        topicMap.set(normalized, { count: 1, episode_ids: [id] })
      }
    }
  }

  return Array.from(topicMap.entries())
    .map(([name, data]) => ({
      name,
      slug: name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w\u0600-\u06FF-]/g, ""),
      count: data.count,
      episode_ids: data.episode_ids,
    }))
    .sort((a, b) => b.count - a.count)
}
