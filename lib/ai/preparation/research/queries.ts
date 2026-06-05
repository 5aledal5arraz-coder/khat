/**
 * Query generation — Step 1 of the research pipeline.
 *
 * Produces a small, diverse set of search queries from the preparation inputs.
 * No LLM call here — deterministic so the pipeline is cheap and reproducible.
 */

import type { PreparationInputs } from "@/types/preparation"

export interface GeneratedQuery {
  /** Arabic-language search string (primary) */
  ar: string
  /** English transliteration / fallback (for reach into English sources) */
  en?: string
  /** Human-readable tag explaining why this query exists */
  purpose: string
}

export function buildResearchQueries(inputs: PreparationInputs): GeneratedQuery[] {
  const queries: GeneratedQuery[] = []
  const guest = inputs.guest_name?.trim()
  const description = inputs.guest_description?.trim()
  const topic = inputs.title?.trim()
  const goal = inputs.episode_goal?.trim()

  if (guest) {
    // The description anchors the base query on a real identity so Gemini
    // doesn't retrieve a homonym. Without it we'd be back to "guest name
    // alone" — the exact failure mode the identity gate exists to prevent.
    const anchor = description ? `${guest} ${description}` : guest
    queries.push({ ar: anchor, purpose: "guest_base" })
    queries.push({ ar: `${guest} مقابلة`, purpose: "guest_interviews" })
    queries.push({ ar: `${guest} آراء`, purpose: "guest_opinions" })
    queries.push({ ar: `${guest} جدل`, purpose: "guest_controversies" })
    if (topic) {
      queries.push({ ar: `${guest} ${topic}`, purpose: "guest_x_topic" })
    }
  }

  if (topic) {
    queries.push({ ar: topic, purpose: "topic_base" })
    if (!guest) {
      queries.push({ ar: `${topic} نقاش`, purpose: "topic_debate" })
    }
  }

  if (goal && queries.length < 8) {
    queries.push({ ar: goal, purpose: "goal_context" })
  }

  // Cap at 8 unique queries to keep retrieval cost bounded.
  const seen = new Set<string>()
  const unique: GeneratedQuery[] = []
  for (const q of queries) {
    const key = q.ar.toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(q)
    if (unique.length >= 8) break
  }
  return unique
}
