export interface EpisodeOverride {
  id: string
  originalTitle: string
  customTitle: string
  customDescription?: string
}

export interface EpisodeEnrichment {
  episodeId: string
  hero_summary?: string
  full_summary?: string
  takeaways?: string[]
  resources?: { title: string; url: string; type: string | null }[]
  timestamps?: { time_seconds: number; title: string; description: string | null }[]
  why_this_conversation?: string
  before_you_watch?: {
    who_is_it_for?: string
    who_is_it_not_for?: string
    what_you_gain?: string
  }
  conversation_map?: {
    beginning?: { title: string; description: string }
    middle?: { title: string; description: string }
    conclusion?: { title: string; description: string }
  }
  central_question?: string
  exclusive_clip?: {
    youtube_url?: string
    message?: string
  }
  unsaid_reflections?: string[]
  /** Publish gate (P6). Defaults to 'published'. */
  publish_status?: string
  /** ISO date; when set and in the future, the enrichment is not yet public. */
  scheduled_for?: string | null
  updatedAt: string
}

export interface ConfigQuote {
  id: string
  text: string
  theme: string | null
  speaker: string | null  // "guest" | "host" | null
  hidden?: boolean
}

export interface EpisodeQuotesEntry {
  episodeId: string
  episodeTitle: string
  quotes: ConfigQuote[]
  transcript: string | null  // cached for regeneration
  status: "draft" | "published"
  generatedAt: string
  publishedAt: string | null
}

export type EpisodeQuotesConfig = Record<string, EpisodeQuotesEntry>
