import { createClient } from "@/lib/supabase/server"
import { getKnowledgeMap } from "@/lib/episode-knowledge"
import type { EpisodeAnalysis } from "@/lib/episode-knowledge"
import type {
  VisitorEvent,
  InterestCategory,
  InterestVector,
  VisitorProfile,
} from "@/types/personalization"

// ---------------------------------------------------------------------------
// Topic → Interest Category mapping
// Arabic and English topic keywords mapped to the 6 interest pillars
// ---------------------------------------------------------------------------

const TOPIC_CATEGORY_MAP: Record<string, InterestCategory> = {
  // Philosophy
  "فلسفة": "philosophy",
  "تفكير": "philosophy",
  "وجودية": "philosophy",
  "أخلاق": "philosophy",
  "منطق": "philosophy",
  "philosophy": "philosophy",
  "thinking": "philosophy",
  "ethics": "philosophy",
  "meaning": "philosophy",
  "معنى": "philosophy",
  "حكمة": "philosophy",
  "تأمل": "philosophy",
  "وعي": "philosophy",

  // Psychology
  "نفس": "psychology",
  "علم النفس": "psychology",
  "سلوك": "psychology",
  "عقل": "psychology",
  "مشاعر": "psychology",
  "psychology": "psychology",
  "behavior": "psychology",
  "mental": "psychology",
  "emotions": "psychology",
  "ذات": "psychology",
  "شخصية": "psychology",
  "وعي ذاتي": "psychology",
  "قلق": "psychology",
  "اكتئاب": "psychology",
  "صحة نفسية": "psychology",

  // Relationships
  "علاقات": "relationships",
  "زواج": "relationships",
  "أسرة": "relationships",
  "حب": "relationships",
  "تواصل": "relationships",
  "relationships": "relationships",
  "family": "relationships",
  "love": "relationships",
  "communication": "relationships",
  "تربية": "relationships",
  "صداقة": "relationships",
  "مجتمع": "relationships",

  // Success
  "نجاح": "success",
  "ريادة": "success",
  "عمل": "success",
  "إنتاجية": "success",
  "قيادة": "success",
  "success": "success",
  "business": "success",
  "leadership": "success",
  "productivity": "success",
  "مال": "success",
  "مهنة": "success",
  "إبداع": "success",
  "تحفيز": "success",
  "طموح": "success",

  // Spirituality
  "روحانية": "spirituality",
  "إيمان": "spirituality",
  "دين": "spirituality",
  "إسلام": "spirituality",
  "صلاة": "spirituality",
  "spirituality": "spirituality",
  "faith": "spirituality",
  "religion": "spirituality",
  "prayer": "spirituality",
  "قرآن": "spirituality",
  "سنة": "spirituality",
  "تزكية": "spirituality",
  "يقين": "spirituality",

  // History
  "تاريخ": "history",
  "حضارة": "history",
  "ثقافة": "history",
  "تراث": "history",
  "history": "history",
  "civilization": "history",
  "culture": "history",
  "heritage": "history",
  "عرب": "history",
  "هوية": "history",
  "أدب": "history",
}

// Emotional path → interest category mapping
const PATH_CATEGORY_MAP: Record<string, InterestCategory> = {
  "understanding-people": "psychology",
  "motivation-work": "success",
  "faith-meaning": "spirituality",
  "self-awareness": "philosophy",
}

// ---------------------------------------------------------------------------
// Signal weights by event type
// ---------------------------------------------------------------------------

const EVENT_WEIGHTS: Record<string, number> = {
  watch_90: 5,      // strong signal
  watch_50: 3,      // medium signal
  episode_watch: 3,  // medium (legacy)
  watch_25: 1.5,    // weak-medium
  episode_view: 1,   // weak (just clicked)
  quote_open: 1.5,
  guest_open: 1,
  path_click: 2,
  search_used: 2,
  episode_saved: 4,
  save_item: 4,     // legacy
  quote_view: 1.5,  // legacy
  search: 2,        // legacy
}

// ---------------------------------------------------------------------------
// Profile computation
// ---------------------------------------------------------------------------

function emptyVector(): InterestVector {
  return {
    philosophy: 0,
    psychology: 0,
    relationships: 0,
    success: 0,
    spirituality: 0,
    history: 0,
  }
}

function classifyTopics(topics: string[]): InterestCategory[] {
  const categories: InterestCategory[] = []
  for (const topic of topics) {
    const normalized = topic.trim().toLowerCase()
    // Exact match
    if (TOPIC_CATEGORY_MAP[normalized]) {
      categories.push(TOPIC_CATEGORY_MAP[normalized])
      continue
    }
    // Substring match
    for (const [keyword, category] of Object.entries(TOPIC_CATEGORY_MAP)) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        categories.push(category)
        break
      }
    }
  }
  return categories
}

export function computeVectorFromEvents(
  events: VisitorEvent[],
  episodeAnalyses: Record<string, EpisodeAnalysis> | null
): InterestVector {
  const vector = emptyVector()

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const baseWeight = EVENT_WEIGHTS[ev.event_type] ?? 1
    // Recency: newer events weighted higher
    const recencyMultiplier = 1 + (events.length - i) / events.length

    const weight = baseWeight * recencyMultiplier

    // 1. Map episode topics to categories (from knowledge map)
    const analysis = episodeAnalyses?.[ev.target_id]
    if (analysis) {
      const allTopics = [analysis.main_topic, ...analysis.secondary_topics]
      const categories = classifyTopics(allTopics)

      // Main topic gets 2x
      const mainCategories = classifyTopics([analysis.main_topic])
      for (const cat of mainCategories) {
        vector[cat] += weight * 2
      }
      // Secondary topics get 1x
      const secondaryCategories = classifyTopics(analysis.secondary_topics)
      for (const cat of secondaryCategories) {
        vector[cat] += weight
      }

      // Emotional path → category
      const pathCategory = PATH_CATEGORY_MAP[analysis.emotional_path]
      if (pathCategory) {
        vector[pathCategory] += weight * 0.5
      }
    }

    // 2. Map event metadata topics to categories
    const metaTopics = ev.metadata?.topics as string[] | undefined
    if (metaTopics) {
      const categories = classifyTopics(metaTopics)
      for (const cat of categories) {
        vector[cat] += weight
      }
    }

    // 3. Path clicks → category
    if (ev.event_type === "path_click") {
      const pathCategory = PATH_CATEGORY_MAP[ev.target_id]
      if (pathCategory) {
        vector[pathCategory] += weight
      }
    }

    // 4. Search terms → categories
    if (ev.event_type === "search_used" || ev.event_type === "search") {
      const query = (ev.metadata?.query as string) || ev.target_id
      const searchCategories = classifyTopics([query])
      for (const cat of searchCategories) {
        vector[cat] += weight
      }
    }
  }

  // Normalize: scale to 0-100
  const max = Math.max(...Object.values(vector), 1)
  if (max > 0) {
    for (const key of Object.keys(vector) as InterestCategory[]) {
      vector[key] = Math.round((vector[key] / max) * 100)
    }
  }

  return vector
}

// ---------------------------------------------------------------------------
// Profile cache — recompute max once every 5 minutes per visitor
// ---------------------------------------------------------------------------

const PROFILE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const profileCache = new Map<string, { profile: VisitorProfile; cachedAt: number }>()

// Cleanup stale entries periodically
let lastProfileCleanup = Date.now()
function cleanupProfileCache() {
  const now = Date.now()
  if (now - lastProfileCleanup < 60_000) return
  lastProfileCleanup = now
  for (const [key, entry] of profileCache) {
    if (now - entry.cachedAt > PROFILE_TTL_MS * 2) {
      profileCache.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getVisitorProfile(visitorId: string): Promise<VisitorProfile | null> {
  cleanupProfileCache()

  // 1. Check memory cache
  const cached = profileCache.get(visitorId)
  if (cached && Date.now() - cached.cachedAt < PROFILE_TTL_MS) {
    return cached.profile
  }

  // 2. Check DB cache
  const supabase = await createClient()
  const { data: dbProfile } = await supabase
    .from("visitor_profiles")
    .select("*")
    .eq("visitor_id", visitorId)
    .single()

  // 3. Get current event count
  const { count: eventCount } = await supabase
    .from("visitor_events")
    .select("*", { count: "exact", head: true })
    .eq("visitor_id", visitorId)

  const currentEventCount = eventCount ?? 0

  // If DB profile exists and no new events, return it
  if (dbProfile && dbProfile.event_count_at_build >= currentEventCount) {
    const profile: VisitorProfile = {
      visitor_id: dbProfile.visitor_id,
      interest_vector: dbProfile.interest_vector as InterestVector,
      last_updated: dbProfile.last_updated,
      event_count_at_build: dbProfile.event_count_at_build,
    }
    profileCache.set(visitorId, { profile, cachedAt: Date.now() })
    return profile
  }

  // If DB profile exists and within TTL, still return it (avoid recompute)
  if (dbProfile) {
    const age = Date.now() - new Date(dbProfile.last_updated).getTime()
    if (age < PROFILE_TTL_MS) {
      const profile: VisitorProfile = {
        visitor_id: dbProfile.visitor_id,
        interest_vector: dbProfile.interest_vector as InterestVector,
        last_updated: dbProfile.last_updated,
        event_count_at_build: dbProfile.event_count_at_build,
      }
      profileCache.set(visitorId, { profile, cachedAt: Date.now() })
      return profile
    }
  }

  // 4. Need to recompute — too few events means no profile yet
  if (currentEventCount < 3) return null

  return rebuildProfile(visitorId, currentEventCount)
}

async function rebuildProfile(
  visitorId: string,
  eventCount: number
): Promise<VisitorProfile> {
  const supabase = await createClient()

  // Fetch events + knowledge map in parallel
  const [{ data: events }, knowledgeMap] = await Promise.all([
    supabase
      .from("visitor_events")
      .select("*")
      .eq("visitor_id", visitorId)
      .order("created_at", { ascending: false })
      .limit(200),
    getKnowledgeMap(),
  ])

  const vector = computeVectorFromEvents(
    (events ?? []) as VisitorEvent[],
    knowledgeMap?.episodes ?? null
  )

  const now = new Date().toISOString()
  const profile: VisitorProfile = {
    visitor_id: visitorId,
    interest_vector: vector,
    last_updated: now,
    event_count_at_build: eventCount,
  }

  // Upsert to DB (fire and forget — don't block response)
  supabase
    .from("visitor_profiles")
    .upsert({
      visitor_id: visitorId,
      interest_vector: vector,
      last_updated: now,
      event_count_at_build: eventCount,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to save visitor profile:", error)
    })

  // Cache in memory
  profileCache.set(visitorId, { profile, cachedAt: Date.now() })

  return profile
}
