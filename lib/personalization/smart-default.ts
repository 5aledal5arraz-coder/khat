import type { Episode } from "@/types/database"
import type { EpisodeKnowledgeMap, EmotionalPathSlug } from "@/lib/episode-knowledge"

// ---------------------------------------------------------------------------
// In-memory cache — recomputed only when knowledge map changes
// ---------------------------------------------------------------------------

let cachedOrder: string[] | null = null
let cachedAnalyzedAt: string | null = null

// ---------------------------------------------------------------------------
// Smart default order (Tier 1 & 2: new / light visitors)
// ---------------------------------------------------------------------------

/**
 * Computes a curated episode order for new visitors using knowledge map
 * quality signals: season boost, relationship density, topic popularity,
 * and recency tiebreaker. Post-sort diversity reranking ensures at least
 * 3 different moods and all 4 emotional paths in the top 6.
 */
export function getSmartDefaultOrder(knowledgeMap: EpisodeKnowledgeMap): string[] {
  // Return cached if knowledge map hasn't changed
  if (cachedOrder && cachedAnalyzedAt === knowledgeMap.analyzed_at) {
    return cachedOrder
  }

  const episodes = Object.values(knowledgeMap.episodes)
  const topicCountMap = new Map<string, number>()
  for (const entry of knowledgeMap.topic_taxonomy) {
    topicCountMap.set(entry.name, entry.count)
  }

  // Score each episode
  const scored = episodes.map((ep) => {
    let score = 0

    // Season 2 boost
    if (ep.season === 2) score += 15

    // Relationship density — how many other episodes it connects to
    const relatedCount = (knowledgeMap.relationships[ep.episode_id] ?? []).length
    score += Math.min(relatedCount * 4, 20)

    // Topic popularity — sum of taxonomy counts for main + secondary topics
    const allTopics = [ep.main_topic, ...ep.secondary_topics]
    for (const topic of allTopics) {
      score += topicCountMap.get(topic) ?? 0
    }

    // Recency tiebreaker — index-based (episodes are unordered in the map)
    // We'll use the episode_id as a stable sort key for determinism
    return { id: ep.episode_id, score, mood: ep.mood, path: ep.emotional_path }
  })

  // Sort by score descending, stable tiebreak by id
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  // Diversity reranking for the top slots
  const reranked = diversityRerank(scored, 6)

  const orderedIds = reranked.map((s) => s.id)

  // Cache
  cachedOrder = orderedIds
  cachedAnalyzedAt = knowledgeMap.analyzed_at

  return orderedIds
}

// ---------------------------------------------------------------------------
// Diversity reranking
// ---------------------------------------------------------------------------

interface ScoredEntry {
  id: string
  score: number
  mood: string
  path: EmotionalPathSlug
}

const ALL_PATHS: EmotionalPathSlug[] = [
  "understanding-people",
  "motivation-work",
  "faith-meaning",
  "self-awareness",
]

/**
 * Greedily selects top N entries ensuring at least 3 different moods and
 * all 4 emotional paths are represented (when possible).
 */
function diversityRerank(sorted: ScoredEntry[], topN: number): ScoredEntry[] {
  if (sorted.length <= topN) return sorted

  const candidates = sorted.slice(0, Math.min(sorted.length, topN * 3))
  const rest = sorted.slice(topN * 3)

  const selected: ScoredEntry[] = []
  const usedIds = new Set<string>()
  const moodsSeen = new Set<string>()
  const pathsSeen = new Set<EmotionalPathSlug>()

  // Pass 1: greedily fill slots, preferring diversity
  for (const entry of candidates) {
    if (selected.length >= topN) break
    if (usedIds.has(entry.id)) continue

    // Accept if we need diversity and this adds it
    const addsMood = !moodsSeen.has(entry.mood)
    const addsPath = !pathsSeen.has(entry.path)
    const needsMoodDiversity = moodsSeen.size < 3
    const needsPathDiversity = pathsSeen.size < ALL_PATHS.length

    if (selected.length < 2 || !needsMoodDiversity && !needsPathDiversity || addsMood || addsPath) {
      selected.push(entry)
      usedIds.add(entry.id)
      moodsSeen.add(entry.mood)
      pathsSeen.add(entry.path)
    }
  }

  // Pass 2: fill remaining slots from candidates we skipped
  if (selected.length < topN) {
    for (const entry of candidates) {
      if (selected.length >= topN) break
      if (usedIds.has(entry.id)) continue
      selected.push(entry)
      usedIds.add(entry.id)
    }
  }

  // Append the rest after the reranked top
  const tail = [...candidates, ...rest].filter((e) => !usedIds.has(e.id))
  return [...selected, ...tail]
}

// ---------------------------------------------------------------------------
// Helper: reorder episodes to match an ID list
// ---------------------------------------------------------------------------

/**
 * Reorders episodes array to match the given ID ordering.
 * Episodes not in orderedIds are appended at the end in their original order.
 */
export function reorderByIdList(episodes: Episode[], orderedIds: string[]): Episode[] {
  const episodeMap = new Map<string, Episode>()
  for (const ep of episodes) {
    episodeMap.set(ep.id, ep)
  }

  const result: Episode[] = []
  const usedIds = new Set<string>()

  // First: episodes in the smart order
  for (const id of orderedIds) {
    const ep = episodeMap.get(id)
    if (ep) {
      result.push(ep)
      usedIds.add(id)
    }
  }

  // Then: remaining episodes in original order
  for (const ep of episodes) {
    if (!usedIds.has(ep.id)) {
      result.push(ep)
    }
  }

  return result
}
