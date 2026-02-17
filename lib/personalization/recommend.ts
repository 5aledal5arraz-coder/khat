import { getKnowledgeMap } from "@/lib/episode-knowledge"
import { getVisitorProfile } from "./profile-builder"
import { getPublishedHomeQuotes } from "@/lib/home-quotes"
import { getAllReflections } from "@/lib/daily-reflections"
import type { EpisodeAnalysis, EpisodeKnowledgeMap } from "@/lib/episode-knowledge"
import type { Episode, HomeQuote, DailyReflection } from "@/types/database"
import type { InterestCategory, InterestVector, PersonalizedContent } from "@/types/personalization"

// ---------------------------------------------------------------------------
// Topic → category matching (reuses the same mapping logic as profile-builder)
// ---------------------------------------------------------------------------

const PATH_CATEGORY_MAP: Record<string, InterestCategory> = {
  "understanding-people": "psychology",
  "motivation-work": "success",
  "faith-meaning": "spirituality",
  "self-awareness": "philosophy",
}

// ---------------------------------------------------------------------------
// Recommendation logic
// ---------------------------------------------------------------------------

function getTopInterests(vector: InterestVector, count: number): InterestCategory[] {
  return (Object.entries(vector) as [InterestCategory, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([cat]) => cat)
}

function scoreEpisodeForProfile(
  analysis: EpisodeAnalysis,
  topInterests: InterestCategory[],
  vector: InterestVector,
  knowledgeMap: EpisodeKnowledgeMap
): number {
  let score = 0

  // Score by emotional path matching top interests
  const pathCategory = PATH_CATEGORY_MAP[analysis.emotional_path]
  if (pathCategory && topInterests.includes(pathCategory)) {
    score += vector[pathCategory] * 2
  }

  // Score by main topic category
  // (simplified — check if any top interest matches the path/mood)
  if (pathCategory) {
    score += vector[pathCategory]
  }

  // Relationship density bonus
  const relatedCount = (knowledgeMap.relationships[analysis.episode_id] ?? []).length
  score += relatedCount * 2

  // Season 2 recency boost
  if (analysis.season === 2) score += 10

  return score
}

function selectQuoteForProfile(
  quotes: HomeQuote[],
  topInterests: InterestCategory[],
  knowledgeMap: EpisodeKnowledgeMap | null,
): HomeQuote | null {
  if (quotes.length === 0) return null
  if (!knowledgeMap || topInterests.length === 0) return quotes[0]

  const topCategory = topInterests[0]
  // Find the emotional path that maps to the top interest
  const targetPath = Object.entries(PATH_CATEGORY_MAP)
    .find(([, cat]) => cat === topCategory)?.[0]

  if (targetPath) {
    const pathEpisodeIds = new Set(
      Object.values(knowledgeMap.episodes)
        .filter((ep) => ep.emotional_path === targetPath)
        .map((ep) => ep.episode_id)
    )
    const matched = quotes.find((q) => q.episode_id && pathEpisodeIds.has(q.episode_id))
    if (matched) return matched
  }

  return quotes[0]
}

function selectReflectionForProfile(
  reflections: DailyReflection[],
  topInterests: InterestCategory[],
  knowledgeMap: EpisodeKnowledgeMap | null,
): DailyReflection | null {
  const published = reflections.filter((r) => r.status === "published")
  if (published.length === 0) return null
  if (!knowledgeMap || topInterests.length === 0) return published[0]

  const topCategory = topInterests[0]
  const targetPath = Object.entries(PATH_CATEGORY_MAP)
    .find(([, cat]) => cat === topCategory)?.[0]

  if (targetPath) {
    // Match reflections that have a path_slug matching the top interest
    const matched = published.find((r) => r.path_slug === targetPath)
    if (matched) return matched
  }

  // Fallback: today's reflection or most recent
  const today = new Date().toISOString().split("T")[0]
  const todayReflection = published.find((r) => r.date === today)
  if (todayReflection) return todayReflection

  return published[0]
}

// ---------------------------------------------------------------------------
// Trending fallback: most recent episodes
// ---------------------------------------------------------------------------

function getTrendingEpisodes(episodes: Episode[]): Episode[] {
  return [...episodes]
    .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
    .slice(0, 6)
}

// ---------------------------------------------------------------------------
// Category display names (Arabic)
// ---------------------------------------------------------------------------

const CATEGORY_NAMES: Record<InterestCategory, string> = {
  philosophy: "الفلسفة والتأمل",
  psychology: "علم النفس",
  relationships: "العلاقات",
  success: "النجاح والعمل",
  spirituality: "الإيمان والروحانية",
  history: "التاريخ والثقافة",
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getPersonalizedContent(
  visitorId: string | null,
  allEpisodes: Episode[],
): Promise<PersonalizedContent> {
  // No visitor → trending fallback
  if (!visitorId) {
    return fallbackContent(allEpisodes)
  }

  // Get profile (cached, max 5-min recalculation)
  const profile = await getVisitorProfile(visitorId)

  // Profile not ready (< 3 events) → trending fallback
  if (!profile) {
    return fallbackContent(allEpisodes)
  }

  const topInterests = getTopInterests(profile.interest_vector, 2)
  if (topInterests.length === 0) {
    return fallbackContent(allEpisodes)
  }

  // Load knowledge map, quotes, reflections in parallel
  const [knowledgeMap, quotes, reflections] = await Promise.all([
    getKnowledgeMap(),
    getPublishedHomeQuotes(),
    getAllReflections(),
  ])

  if (!knowledgeMap) {
    return fallbackContent(allEpisodes)
  }

  // Score and rank episodes
  const episodeMap = new Map(allEpisodes.map((ep) => [ep.id, ep]))
  const scored: { episode: Episode; score: number }[] = []

  for (const [id, analysis] of Object.entries(knowledgeMap.episodes)) {
    const episode = episodeMap.get(id)
    if (!episode) continue

    const score = scoreEpisodeForProfile(analysis, topInterests, profile.interest_vector, knowledgeMap)
    scored.push({ episode, score })
  }

  // Also include episodes not in knowledge map with score 0
  for (const ep of allEpisodes) {
    if (!knowledgeMap.episodes[ep.id]) {
      scored.push({ episode: ep, score: 0 })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const recommendedEpisodes = scored.slice(0, 6).map((s) => s.episode)

  // Select personalized quote and reflection
  const quote = selectQuoteForProfile(quotes, topInterests, knowledgeMap)
  const reflection = selectReflectionForProfile(reflections, topInterests, knowledgeMap)

  // Build reason string
  const topCategoryName = CATEGORY_NAMES[topInterests[0]]
  const reason = `بناءً على اهتمامك بـ ${topCategoryName}`

  return {
    episodes: recommendedEpisodes,
    quote,
    reflection,
    reason,
  }
}

async function fallbackContent(allEpisodes: Episode[]): Promise<PersonalizedContent> {
  const [quotes, reflections] = await Promise.all([
    getPublishedHomeQuotes(),
    getAllReflections(),
  ])

  const published = reflections.filter((r) => r.status === "published")
  const today = new Date().toISOString().split("T")[0]
  const todayReflection = published.find((r) => r.date === today) ?? published[0] ?? null

  return {
    episodes: getTrendingEpisodes(allEpisodes),
    quote: quotes[0] ?? null,
    reflection: todayReflection,
    reason: null,
  }
}
