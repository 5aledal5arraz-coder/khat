import type { Episode, HomeQuote, EmotionalPath } from "./database"

export interface VisitorEvent {
  id: string
  visitor_id: string
  event_type: string
  target_id: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface PersonalizedHome {
  episodes: Episode[]
  quote: HomeQuote | null
  paths: EmotionalPath[]
  becauseYouWatched: { sourceTitle: string; episodes: Episode[]; reason?: string } | null
  reason: string | null
}

export const ALLOWED_EVENT_TYPES = [
  "episode_view",
  "episode_watch",
  "watch_25",
  "watch_50",
  "watch_90",
  "quote_open",
  "guest_open",
  "path_click",
  "search_used",
  "episode_saved",
  // Legacy (keep for backward compat with existing data)
  "save_item",
  "quote_view",
  "search",
] as const

export type EventType = (typeof ALLOWED_EVENT_TYPES)[number]

// Interest categories for visitor profiles
export const INTEREST_CATEGORIES = [
  "philosophy",
  "psychology",
  "relationships",
  "success",
  "spirituality",
  "history",
] as const

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number]

export type InterestVector = Record<InterestCategory, number>

export interface VisitorProfile {
  visitor_id: string
  interest_vector: InterestVector
  last_updated: string
  event_count_at_build: number
}

export interface PersonalizedContent {
  episodes: import("./database").Episode[]
  quote: import("./database").HomeQuote | null
  reflection: import("./database").DailyReflection | null
  reason: string | null
}
