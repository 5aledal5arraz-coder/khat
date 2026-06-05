export interface VisitorEvent {
  id: string
  visitor_id: string
  event_type: string
  target_id: string
  metadata: Record<string, unknown>
  created_at: string
}

export const ALLOWED_EVENT_TYPES = [
  "episode_view",
  "episode_watch",
  "watch_25",
  "watch_50",
  "watch_90",
  "quote_open",
  "guest_open",
  "search_used",
  "episode_saved",
  // Legacy (keep for backward compat with existing data)
  "save_item",
  "quote_view",
  "search",
] as const

export type EventType = (typeof ALLOWED_EVENT_TYPES)[number]
