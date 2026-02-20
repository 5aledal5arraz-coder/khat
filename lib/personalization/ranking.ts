import { db } from "@/lib/db"
import { visitorEvents } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { getKnowledgeMap } from "@/lib/episode-knowledge"
import type { EpisodeKnowledgeMap, EpisodeAnalysis } from "@/lib/episode-knowledge"
import type { Episode, HomeQuote, EmotionalPath } from "@/types/database"
import type { VisitorEvent, PersonalizedHome } from "@/types/personalization"
import { getSmartDefaultOrder, reorderByIdList } from "./smart-default"

// ---------------------------------------------------------------------------
// Signal extraction (enhanced with knowledge map)
// ---------------------------------------------------------------------------

interface Signals {
  watchedIds: Set<string>
  topicAffinity: Map<string, number>
  topicAffinityDetailed: Map<string, number>
  moodAffinity: Map<string, number>
  pathAffinity: Map<string, number>
  pathClicks: Map<string, number>
  guestIds: Set<string>
  lastWatchedEpisodeId: string | null
}

function extractSignals(
  events: VisitorEvent[],
  knowledgeMap: EpisodeKnowledgeMap | null
): Signals {
  const watchedIds = new Set<string>()
  const topicAffinity = new Map<string, number>()
  const topicAffinityDetailed = new Map<string, number>()
  const moodAffinity = new Map<string, number>()
  const pathAffinity = new Map<string, number>()
  const pathClicks = new Map<string, number>()
  const guestIds = new Set<string>()
  let lastWatchedEpisodeId: string | null = null

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const recencyWeight = 1 + (events.length - i) / events.length

    const isWatchEvent = ev.event_type === "episode_view" || ev.event_type === "episode_watch"
      || ev.event_type === "watch_25" || ev.event_type === "watch_50" || ev.event_type === "watch_90"

    if (isWatchEvent) {
      watchedIds.add(ev.target_id)

      if (ev.event_type !== "episode_view" && !lastWatchedEpisodeId) {
        lastWatchedEpisodeId = ev.target_id
      }

      // Stronger signal for deeper watch progress
      const completionBonus =
        ev.event_type === "watch_90" ? 5 :
        ev.event_type === "watch_50" ? 3 :
        ev.event_type === "watch_25" ? 1.5 :
        ev.event_type === "episode_watch" ? 2 : 1
      const weight = recencyWeight * completionBonus

      // Extract topics from event metadata (basic)
      const topics = ev.metadata?.topics as string[] | undefined
      if (topics) {
        for (const topic of topics) {
          topicAffinity.set(topic, (topicAffinity.get(topic) ?? 0) + weight)
        }
      }

      // Enhanced: look up episode in knowledge map for deeper signals
      const analysis = knowledgeMap?.episodes[ev.target_id]
      if (analysis) {
        // Main topic at 2x weight
        topicAffinityDetailed.set(
          analysis.main_topic,
          (topicAffinityDetailed.get(analysis.main_topic) ?? 0) + weight * 2
        )
        // Secondary topics at 1x
        for (const st of analysis.secondary_topics) {
          topicAffinityDetailed.set(
            st,
            (topicAffinityDetailed.get(st) ?? 0) + weight
          )
        }
        // Mood affinity
        moodAffinity.set(
          analysis.mood,
          (moodAffinity.get(analysis.mood) ?? 0) + weight
        )
        // Emotional path affinity
        pathAffinity.set(
          analysis.emotional_path,
          (pathAffinity.get(analysis.emotional_path) ?? 0) + weight
        )
      }

      // Guest extraction
      const guestId = ev.metadata?.guest_id as string | undefined
      if (guestId) {
        guestIds.add(guestId)
      }
    }

    if (ev.event_type === "path_click") {
      pathClicks.set(ev.target_id, (pathClicks.get(ev.target_id) ?? 0) + 1)
      // Also feed into pathAffinity
      pathAffinity.set(ev.target_id, (pathAffinity.get(ev.target_id) ?? 0) + recencyWeight)
    }
  }

  return {
    watchedIds,
    topicAffinity,
    topicAffinityDetailed,
    moodAffinity,
    pathAffinity,
    pathClicks,
    guestIds,
    lastWatchedEpisodeId,
  }
}

// ---------------------------------------------------------------------------
// Multi-factor episode ranking (knowledge-map-enhanced)
// ---------------------------------------------------------------------------

function rankEpisodes(
  allEpisodes: Episode[],
  signals: Signals,
  knowledgeMap: EpisodeKnowledgeMap | null
): Episode[] {
  // Build a set of episodes related to watched episodes (from knowledge graph)
  const relatedToWatched = new Map<string, number>() // episodeId → bonus
  if (knowledgeMap) {
    for (const watchedId of signals.watchedIds) {
      const relatedIds = knowledgeMap.relationships[watchedId]
      if (relatedIds) {
        for (let idx = 0; idx < relatedIds.length; idx++) {
          const relId = relatedIds[idx]
          const bonus = Math.max(5 - idx, 1) * 3 // (5-0)*3=15, (5-1)*3=12, ...
          const current = relatedToWatched.get(relId) ?? 0
          relatedToWatched.set(relId, Math.max(current, Math.min(bonus, 15)))
        }
      }
    }
  }

  const scored = allEpisodes.map((ep) => {
    let score = 0

    // Already watched → push to end
    if (signals.watchedIds.has(ep.id)) {
      score -= 1000
      return { episode: ep, score }
    }

    const analysis = knowledgeMap?.episodes[ep.id] as EpisodeAnalysis | undefined

    if (analysis) {
      // Main topic match (knowledge map + visitor affinity)
      const mainTopicScore = signals.topicAffinityDetailed.get(analysis.main_topic) ?? 0
      score += mainTopicScore * 3

      // Secondary topic match
      for (const st of analysis.secondary_topics) {
        const stScore = signals.topicAffinityDetailed.get(st) ?? 0
        score += stScore * 1.5
      }

      // Mood match
      const moodScore = signals.moodAffinity.get(analysis.mood) ?? 0
      score += moodScore * 2

      // Emotional path match
      const pathScore = signals.pathAffinity.get(analysis.emotional_path) ?? 0
      score += pathScore * 2.5

      // In related_episode_ids of a watched episode (knowledge graph bonus)
      const relBonus = relatedToWatched.get(ep.id) ?? 0
      score += relBonus
    } else {
      // Fallback: basic topic affinity from event metadata
      if (ep.topics) {
        for (const topic of ep.topics) {
          const affinity =
            signals.topicAffinity.get(topic.name) ??
            signals.topicAffinity.get(topic.slug) ??
            0
          score += affinity > 0 ? 10 : 0
        }
      }
      // Basic mood match from path clicks
      if (ep.mood && signals.pathClicks.size > 0) {
        for (const [, count] of signals.pathClicks) {
          if (count > 0) {
            score += 5
            break
          }
        }
      }
    }

    // Same guest as a completed episode
    if (ep.guest_id && signals.guestIds.has(ep.guest_id)) {
      score += 12
    }

    // Recency boost
    const daysSinceRelease =
      (Date.now() - new Date(ep.release_date).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceRelease < 14) {
      score += 8
    } else if (daysSinceRelease < 30) {
      score += 4
    }

    return { episode: ep, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.episode)
}

// ---------------------------------------------------------------------------
// "Because you watched" — knowledge-graph-powered
// ---------------------------------------------------------------------------

function buildBecauseYouWatched(
  allEpisodes: Episode[],
  signals: Signals,
  knowledgeMap: EpisodeKnowledgeMap | null
): { sourceTitle: string; episodes: Episode[]; reason?: string } | null {
  if (!signals.lastWatchedEpisodeId) return null

  const sourceEp = allEpisodes.find((ep) => ep.id === signals.lastWatchedEpisodeId)
  if (!sourceEp) return null

  const analysis = knowledgeMap?.episodes[signals.lastWatchedEpisodeId]

  // Prefer knowledge graph relationships
  if (analysis && knowledgeMap) {
    const relatedIds = knowledgeMap.relationships[signals.lastWatchedEpisodeId] ?? []
    const episodeMap = new Map(allEpisodes.map((ep) => [ep.id, ep]))

    const related = relatedIds
      .filter((id) => !signals.watchedIds.has(id) && episodeMap.has(id))
      .slice(0, 3)
      .map((id) => episodeMap.get(id)!)

    if (related.length > 0) {
      return {
        sourceTitle: sourceEp.title,
        episodes: related,
        reason: `حلقات مشابهة في موضوع ${analysis.main_topic}`,
      }
    }
  }

  // Fallback: topic-based matching (original behavior)
  if (!sourceEp.topics || sourceEp.topics.length === 0) return null

  const sourceTopicNames = new Set(sourceEp.topics.map((t) => t.name))
  const related = allEpisodes
    .filter((ep) => {
      if (ep.id === sourceEp.id) return false
      if (signals.watchedIds.has(ep.id)) return false
      if (!ep.topics) return false
      return ep.topics.some((t) => sourceTopicNames.has(t.name))
    })
    .slice(0, 3)

  if (related.length === 0) return null
  return { sourceTitle: sourceEp.title, episodes: related }
}

// ---------------------------------------------------------------------------
// Path-aware quote selection
// ---------------------------------------------------------------------------

function selectQuote(
  allQuotes: HomeQuote[],
  signals: Signals,
  defaultQuote: HomeQuote | null,
  knowledgeMap: EpisodeKnowledgeMap | null
): HomeQuote | null {
  if (allQuotes.length === 0) return defaultQuote

  // Try path-aware matching: find the visitor's top emotional path,
  // then match quotes from episodes on that path
  if (knowledgeMap && signals.pathAffinity.size > 0) {
    const topPath = [...signals.pathAffinity.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0]

    if (topPath) {
      // Find episode IDs on this path
      const pathEpisodeIds = new Set(
        Object.values(knowledgeMap.episodes)
          .filter((ep) => ep.emotional_path === topPath)
          .map((ep) => ep.episode_id)
      )

      const pathMatched = allQuotes.find(
        (q) => q.episode_id && pathEpisodeIds.has(q.episode_id)
      )
      if (pathMatched) return pathMatched
    }
  }

  // Fallback: topic-based matching
  if (signals.topicAffinityDetailed.size > 0) {
    const topTopics = [...signals.topicAffinityDetailed.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic.toLowerCase())

    const matched = allQuotes.find(
      (q) =>
        q.theme && topTopics.some((t) => q.theme!.toLowerCase().includes(t))
    )
    if (matched) return matched
  }

  // Original fallback: basic topic affinity
  if (signals.topicAffinity.size > 0) {
    const topTopics = [...signals.topicAffinity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic.toLowerCase())

    const matched = allQuotes.find(
      (q) =>
        q.theme && topTopics.some((t) => q.theme!.toLowerCase().includes(t))
    )
    if (matched) return matched
  }

  return defaultQuote
}

// ---------------------------------------------------------------------------
// Path reordering
// ---------------------------------------------------------------------------

function reorderPaths(paths: EmotionalPath[], signals: Signals): EmotionalPath[] {
  if (signals.pathAffinity.size === 0 && signals.pathClicks.size === 0) return paths

  return [...paths].sort((a, b) => {
    const aScore = (signals.pathAffinity.get(a.slug) ?? 0) + (signals.pathClicks.get(a.slug) ?? 0)
    const bScore = (signals.pathAffinity.get(b.slug) ?? 0) + (signals.pathClicks.get(b.slug) ?? 0)
    return bScore - aScore
  })
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getVisitorEvents(visitorId: string): Promise<VisitorEvent[]> {
  if (!db) return []
  try {
    const rows = await db.select().from(visitorEvents)
      .where(eq(visitorEvents.visitor_id, visitorId))
      .orderBy(desc(visitorEvents.created_at))
      .limit(200)
    return (rows ?? []) as unknown as VisitorEvent[]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Determine top topic for reason string
// ---------------------------------------------------------------------------

function getTopTopic(signals: Signals): string | null {
  const source =
    signals.topicAffinityDetailed.size > 0
      ? signals.topicAffinityDetailed
      : signals.topicAffinity

  if (source.size === 0) return null

  return [...source.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

interface PersonalizeInput {
  episodes: Episode[]
  allQuotes: HomeQuote[]
  paths: EmotionalPath[]
  defaultQuote: HomeQuote | null
}

export async function personalizeHome(
  visitorId: string | null,
  content: PersonalizeInput
): Promise<PersonalizedHome | null> {
  // Load knowledge map and visitor events in parallel
  const [knowledgeMap, events] = await Promise.all([
    getKnowledgeMap(),
    visitorId ? getVisitorEvents(visitorId) : Promise.resolve([]),
  ])

  // Tier 1 & 2: fewer than 3 events → smart default order
  if (events.length < 3) {
    // If no knowledge map, fall back to current behavior (return null)
    if (!knowledgeMap) return null

    const orderedIds = getSmartDefaultOrder(knowledgeMap)
    const episodes = reorderByIdList(content.episodes, orderedIds)

    return {
      episodes,
      quote: content.defaultQuote,
      paths: content.paths,
      becauseYouWatched: null,
      reason: null,
    }
  }

  // Tier 3: full personalization
  const signals = extractSignals(events, knowledgeMap)

  const episodes = rankEpisodes(content.episodes, signals, knowledgeMap)
  const quote = selectQuote(content.allQuotes, signals, content.defaultQuote, knowledgeMap)
  const paths = reorderPaths(content.paths, signals)
  const becauseYouWatched = buildBecauseYouWatched(content.episodes, signals, knowledgeMap)

  const topTopic = getTopTopic(signals)
  const reason = topTopic ? `بناءً على اهتمامك بـ ${topTopic}` : "بناءً على اهتماماتك"

  return {
    episodes,
    quote,
    paths,
    becauseYouWatched,
    reason,
  }
}
