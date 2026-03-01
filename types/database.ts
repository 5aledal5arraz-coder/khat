export interface Topic {
  id: string
  name: string
  slug: string
  description?: string | null
  created_at: string
}

export interface Guest {
  id: string
  name: string
  slug: string
  bio: string | null
  photo_url: string | null
  external_links: Record<string, string> | null
  testimonial: string | null
  created_at: string
}

export interface Episode {
  id: string
  title: string
  slug: string
  description?: string | null
  summary?: string | null
  key_takeaways?: string[] | null
  youtube_url: string
  duration_minutes: number
  release_date: string
  episode_number?: number | null
  season?: number | null
  mood?: string | null
  thumbnail_url?: string | null
  status?: string
  featured?: boolean
  view_count?: number | null
  guest_id?: string | null
  guest?: Guest | null
  guest_testimonial?: string | null
  guest_video_url?: string | null
  topics?: Topic[]
  created_at: string
  updated_at?: string
}

export interface EpisodeTopic {
  episode_id: string
  topic_id: string
}

export interface Timestamp {
  id: string
  episode_id: string
  time_seconds: number
  title: string
  description: string | null
}

export interface Quote {
  id: string
  episode_id: string
  guest_id: string | null
  text: string
  theme: string | null
  created_at: string
}

export interface Resource {
  id: string
  episode_id: string
  title: string
  url: string
  type: string | null
}

export interface NewsletterSubscriber {
  id: string
  email: string
  created_at: string
}

export type EpisodeVersionChangeType =
  | "title_override"
  | "description_override"
  | "enrichment"
  | "quotes"
  | "section_assignment"
  | "visibility"
  | "guest_assignment"
  | "youtube_pack"
  | "conversation"
  | "full_snapshot"

export interface EpisodeVersion {
  id: string
  episode_id: string
  version_number: number
  change_type: EpisodeVersionChangeType
  change_summary: string | null
  snapshot: Record<string, unknown>
  created_by: string
  created_at: string
}

export type SponsorshipStatus =
  | "new"
  | "reviewing"
  | "proposal_sent"
  | "negotiation"
  | "confirmed"
  | "declined"

export interface SponsorshipLead {
  id: string
  // Company Info
  company_name: string
  industry: string
  contact_name: string
  job_title: string
  email: string
  phone: string
  // Campaign Details
  collaboration_types: string[]
  collaboration_other: string | null
  // Objectives
  main_goal: string
  target_audience: string
  preferred_timeline: string | null
  // Budget
  budget_range: string
  // Additional
  additional_info: string | null
  // Meta
  status: SponsorshipStatus
  created_at: string
}

export type GuestApplicationStatus =
  | "new"
  | "under_review"
  | "accepted"
  | "rejected"
  | "consider_later"

export interface GuestApplication {
  id: string
  // Step 1 — Basic Info
  name: string
  email: string
  phone: string
  country: string
  can_travel_to_kuwait: string | null
  // Step 2 — Your Story
  story_idea: string
  beyond_job_title: string
  life_changing_moment: string
  hope_people_understand: string
  unasked_question: string
  why_khat: string
  // Step 3 — Recording & Appearance
  previous_podcast: boolean
  previous_podcast_info: string | null
  prefer_dialogue_or_story: string
  topics_to_avoid: string | null
  filming_concern: string
  agrees_to_publish: boolean
  social_links: string | null
  // Meta
  status: GuestApplicationStatus
  created_at: string
}

export interface EpisodeWithRelations extends Episode {
  guest: Guest | null
  topics: Topic[]
  timestamps: Timestamp[]
  quotes: Quote[]
  resources: Resource[]
}

export interface GuestWithRelations extends Guest {
  episodes: Episode[]
  quotes: Quote[]
}

export type StudioSessionStatus = 'draft' | 'fetched' | 'error'
export type StudioSessionSource = 'youtube' | 'audio'

export interface StudioSession {
  id: string
  youtube_url: string | null
  video_id: string | null
  source: StudioSessionSource
  status: StudioSessionStatus
  video_title: string | null
  channel_title: string | null
  published_at: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  raw_youtube_response: Record<string, unknown> | null
  audio_filename: string | null
  audio_file_size: number | null
  audio_start_seconds: number | null
  audio_end_seconds: number | null
  audio_best_intro: string | null
  audio_edit_suggestions: AudioEditSuggestion[] | null
  created_at: string
  updated_at: string
}

export interface AudioEditSuggestion {
  start_seconds: number
  end_seconds: number
  category: 'long_pause' | 'repetitive' | 'off_topic' | 'filler' | 'other'
  reason: string
}

export type StudioTranscriptSource = 'youtube_captions' | 'upload' | 'whisper'
export type StudioTranscriptStatus = 'ready' | 'error'
export type StudioTranscriptProcessingStatus = 'idle' | 'processing' | 'ready' | 'error'

export interface StudioTranscriptSummary {
  overview: string
  key_ideas: string[]
  lessons: string[]
}

export interface StudioTranscriptQuote {
  text: string
  theme: string
}

export interface StudioTranscript {
  id: string
  session_id: string
  source: StudioTranscriptSource
  language: string
  transcript_raw: string
  transcript_clean: string
  word_count: number
  char_count: number
  status: StudioTranscriptStatus
  error_message: string | null
  // AI-processed outputs
  transcript_article: string | null
  summary: StudioTranscriptSummary | null
  quotes_extracted: StudioTranscriptQuote[] | null
  processing_status: StudioTranscriptProcessingStatus
  created_at: string
  updated_at: string
}

export type StudioAiOutputStatus = 'generating' | 'ready' | 'error'

export interface StudioAiOutput {
  id: string
  session_id: string
  model: string
  prompt_version: string
  status: StudioAiOutputStatus
  title_best: string
  title_alternatives: string[]
  thumbnail_text_options: string[]
  youtube_description: string
  seo_keywords: string[]
  hashtags: string[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type StudioChaptersStatus = 'generating' | 'ready' | 'error'

export interface StudioChapterItem {
  start_time: string // HH:MM:SS
  title: string
}

export interface StudioChapters {
  id: string
  session_id: string
  status: StudioChaptersStatus
  chapters: StudioChapterItem[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type StudioClipsStatus = 'generating' | 'ready' | 'error'

export interface StudioClipItem {
  start_time: string // HH:MM:SS
  end_time: string   // HH:MM:SS
  platform: string   // YouTube Shorts / IG Reels / TikTok / X
  hook_text: string
  caption: string
  why_it_works: string
  used?: boolean
}

export interface StudioClips {
  id: string
  session_id: string
  status: StudioClipsStatus
  clips: StudioClipItem[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type StudioWebsitePackageStatus = 'generating' | 'ready' | 'error'

export interface WebsiteQuoteItem { text: string; theme: string | null; speaker: string | null }
export interface WebsiteResourceItem { title: string; url: string; type: string | null }
export interface WebsiteTimestampItem { time_seconds: number; title: string; description: string | null }
export interface GuestPackageData { guest_name: string; guest_bio: string; guest_photo_url: string | null; guest_external_links: Record<string, string> }

export interface StudioWebsitePackage {
  id: string
  session_id: string
  status: StudioWebsitePackageStatus
  hero_summary: string | null
  full_summary: string | null
  takeaways: string[]
  quotes: WebsiteQuoteItem[]
  topics: string[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  custom_title: string | null
  selected_quote_indices: number[] | null
  selected_takeaway_indices: number[] | null
  linked_episode_id: string | null
  guest_package: GuestPackageData | null
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Studio Analyzer (post-publish YouTube performance analysis)
// ---------------------------------------------------------------------------

export type StudioAnalyzerStatus = 'idle' | 'generating' | 'ready' | 'error'

export interface StudioAnalyzerDiagnosis {
  classification: string
  reasoning: string
  key_metrics_summary: string
}

export interface StudioAnalyzerImprovements {
  alt_titles: string[]
  optimized_description: string
  chapters: string
  pinned_comment: string
  thumbnail_concepts: string[]
}

export interface StudioAnalyzerRevivalStep {
  order: number
  action: string
  detail: string
}

export interface StudioAnalyzerData {
  diagnosis: StudioAnalyzerDiagnosis
  improvements: StudioAnalyzerImprovements
  revival: { steps: StudioAnalyzerRevivalStep[] }
  clips: StudioClipItem[]
}

export interface StudioAnalyzer {
  id: string
  session_id: string
  status: StudioAnalyzerStatus
  data: StudioAnalyzerData | null
  prompt_version: string
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Home Page Content Models
// ---------------------------------------------------------------------------

export interface HomeQuote {
  id: string
  text: string
  attribution: string
  episode_id?: string
  episode_slug?: string
  episode_title?: string
  theme?: string
  scheduled_date?: string // YYYY-MM-DD
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export type PathSlug = 'understanding-people' | 'motivation-work' | 'faith-meaning' | 'self-awareness'

export interface EmotionalPath {
  id: string
  slug: PathSlug
  title: string
  subtitle: string
  icon: string
  color: string
  episode_ids: string[]
  quote_ids: string[]
  order: number
}

export interface DailyReflection {
  id: string
  date: string // YYYY-MM-DD
  short_quote: string
  reflection: string
  thinking_question: string
  attribution?: string
  episode_id?: string
  episode_slug?: string
  episode_title?: string
  quote_id?: string
  quote_text?: string
  path_slug?: PathSlug
  path_title?: string
  status: 'draft' | 'scheduled' | 'published'
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      topics: {
        Row: Topic
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
        }
        Relationships: []
      }
      guests: {
        Row: Guest
        Insert: {
          id?: string
          name: string
          slug: string
          bio?: string | null
          photo_url?: string | null
          external_links?: Record<string, string> | null
          testimonial?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          bio?: string | null
          photo_url?: string | null
          external_links?: Record<string, string> | null
          testimonial?: string | null
          created_at?: string
        }
        Relationships: []
      }
      episodes: {
        Row: Episode
        Insert: {
          id?: string
          title: string
          slug: string
          summary?: string | null
          key_takeaways?: string[] | null
          youtube_url: string
          duration_minutes: number
          release_date: string
          season?: number | null
          mood?: string | null
          guest_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          summary?: string | null
          key_takeaways?: string[] | null
          youtube_url?: string
          duration_minutes?: number
          release_date?: string
          season?: number | null
          mood?: string | null
          guest_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      episode_topics: {
        Row: EpisodeTopic
        Insert: {
          episode_id: string
          topic_id: string
        }
        Update: {
          episode_id?: string
          topic_id?: string
        }
        Relationships: []
      }
      timestamps: {
        Row: Timestamp
        Insert: {
          id?: string
          episode_id: string
          time_seconds: number
          title: string
          description?: string | null
        }
        Update: {
          id?: string
          episode_id?: string
          time_seconds?: number
          title?: string
          description?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: Quote
        Insert: {
          id?: string
          episode_id: string
          guest_id?: string | null
          text: string
          theme?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          episode_id?: string
          guest_id?: string | null
          text?: string
          theme?: string | null
          created_at?: string
        }
        Relationships: []
      }
      resources: {
        Row: Resource
        Insert: {
          id?: string
          episode_id: string
          title: string
          url: string
          type?: string | null
        }
        Update: {
          id?: string
          episode_id?: string
          title?: string
          url?: string
          type?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: NewsletterSubscriber
        Insert: {
          id?: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
        }
        Relationships: []
      }
      sponsorship_leads: {
        Row: SponsorshipLead
        Insert: {
          id?: string
          company_name: string
          industry: string
          contact_name: string
          job_title: string
          email: string
          phone: string
          collaboration_types: string[]
          collaboration_other?: string | null
          main_goal: string
          target_audience: string
          preferred_timeline?: string | null
          budget_range: string
          additional_info?: string | null
          status?: SponsorshipStatus
          created_at?: string
        }
        Update: {
          company_name?: string
          industry?: string
          contact_name?: string
          job_title?: string
          email?: string
          phone?: string
          collaboration_types?: string[]
          collaboration_other?: string | null
          main_goal?: string
          target_audience?: string
          preferred_timeline?: string | null
          budget_range?: string
          additional_info?: string | null
          status?: SponsorshipStatus
        }
        Relationships: []
      }
      guest_applications: {
        Row: GuestApplication
        Insert: {
          id?: string
          name: string
          email: string
          phone: string
          country: string
          can_travel_to_kuwait?: string | null
          story_idea: string
          beyond_job_title: string
          life_changing_moment: string
          hope_people_understand: string
          unasked_question: string
          why_khat: string
          previous_podcast: boolean
          previous_podcast_info?: string | null
          prefer_dialogue_or_story: string
          topics_to_avoid?: string | null
          filming_concern: string
          agrees_to_publish: boolean
          social_links?: string | null
          status?: GuestApplicationStatus
          created_at?: string
        }
        Update: {
          name?: string
          email?: string
          phone?: string
          country?: string
          can_travel_to_kuwait?: string | null
          story_idea?: string
          beyond_job_title?: string
          life_changing_moment?: string
          hope_people_understand?: string
          unasked_question?: string
          why_khat?: string
          previous_podcast?: boolean
          previous_podcast_info?: string | null
          prefer_dialogue_or_story?: string
          topics_to_avoid?: string | null
          filming_concern?: string
          agrees_to_publish?: boolean
          social_links?: string | null
          status?: GuestApplicationStatus
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          is_admin: boolean
          is_banned: boolean
          ban_reason: string | null
          articles_count: number
          followers_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          is_admin?: boolean
          is_banned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          is_admin?: boolean
          is_banned?: boolean
          ban_reason?: string | null
          articles_count?: number
          followers_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      hibr_articles: {
        Row: {
          id: string
          user_id: string
          title: string
          excerpt: string | null
          content: string
          cover_image: string | null
          tags: string[]
          episode_id: string | null
          episode_title: string | null
          episode_slug: string | null
          read_time_minutes: number
          likes_count: number
          comments_count: number
          status: string
          moderation_status: string
          moderation_reason: string | null
          featured: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          excerpt?: string | null
          cover_image?: string | null
          tags?: string[]
          episode_id?: string | null
          episode_title?: string | null
          episode_slug?: string | null
          read_time_minutes?: number
          status?: string
          moderation_status?: string
          moderation_reason?: string | null
          featured?: boolean
        }
        Update: {
          title?: string
          content?: string
          excerpt?: string | null
          tags?: string[]
          read_time_minutes?: number
          status?: string
          moderation_status?: string
          moderation_reason?: string | null
          featured?: boolean
          deleted_at?: string | null
        }
        Relationships: []
      }
      hibr_thoughts: {
        Row: {
          id: string
          user_id: string
          content: string
          tags: string[]
          likes_count: number
          replies_count: number
          moderation_status: string
          moderation_reason: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content: string
          tags?: string[]
          moderation_status?: string
          moderation_reason?: string | null
        }
        Update: {
          content?: string
          tags?: string[]
          moderation_status?: string
          moderation_reason?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      hibr_comments: {
        Row: {
          id: string
          article_id: string
          user_id: string
          content: string
          likes_count: number
          moderation_status: string
          moderation_reason: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          article_id: string
          user_id: string
          content: string
          moderation_status?: string
          moderation_reason?: string | null
        }
        Update: {
          content?: string
          moderation_status?: string
          moderation_reason?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      hibr_replies: {
        Row: {
          id: string
          thought_id: string
          user_id: string
          content: string
          likes_count: number
          moderation_status: string
          moderation_reason: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thought_id: string
          user_id: string
          content: string
          moderation_status?: string
          moderation_reason?: string | null
        }
        Update: {
          content?: string
          moderation_status?: string
          moderation_reason?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      hibr_drafts: {
        Row: {
          id: string
          user_id: string
          title: string
          content: string
          tags: string[]
          episode_id: string | null
          episode_slug: string | null
          episode_title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          content?: string
          tags?: string[]
          episode_id?: string | null
          episode_slug?: string | null
          episode_title?: string | null
        }
        Update: {
          title?: string
          content?: string
          tags?: string[]
          episode_id?: string | null
          episode_slug?: string | null
          episode_title?: string | null
        }
        Relationships: []
      }
      hibr_likes: {
        Row: {
          id: string
          user_id: string
          target_type: string
          target_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          target_type: string
          target_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      hibr_follows: {
        Row: {
          id: string
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: {
          id?: string
          follower_id: string
          following_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      hibr_bookmarks: {
        Row: {
          id: string
          user_id: string
          article_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          article_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      hibr_reactions: {
        Row: {
          id: string
          user_id: string
          article_id: string
          reaction_type: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          article_id: string
          reaction_type: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      hibr_reports: {
        Row: {
          id: string
          reporter_id: string
          target_type: string
          target_id: string
          reason: string
          details: string | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          reporter_id: string
          target_type: string
          target_id: string
          reason: string
          details?: string | null
        }
        Update: {
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      hibr_moderation_log: {
        Row: {
          id: string
          moderator_id: string
          action: string
          target_type: string
          target_id: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          moderator_id: string
          action: string
          target_type: string
          target_id: string
          reason?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      rate_limits: {
        Row: {
          id: string
          user_id: string
          action: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      studio_sessions: {
        Row: StudioSession
        Insert: {
          id?: string
          youtube_url?: string | null
          video_id?: string | null
          source?: string
          status?: string
          video_title?: string | null
          channel_title?: string | null
          published_at?: string | null
          duration_seconds?: number | null
          thumbnail_url?: string | null
          raw_youtube_response?: Record<string, unknown> | null
          audio_filename?: string | null
          audio_file_size?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          video_title?: string | null
          channel_title?: string | null
          published_at?: string | null
          duration_seconds?: number | null
          thumbnail_url?: string | null
          raw_youtube_response?: Record<string, unknown> | null
          audio_filename?: string | null
          audio_file_size?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      studio_transcripts: {
        Row: StudioTranscript
        Insert: {
          id?: string
          session_id: string
          source?: string
          language?: string
          transcript_raw: string
          transcript_clean: string
          word_count?: number
          char_count?: number
          status?: string
          error_message?: string | null
          transcript_article?: string | null
          summary?: StudioTranscriptSummary | null
          quotes_extracted?: StudioTranscriptQuote[] | null
          processing_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          transcript_raw?: string
          transcript_clean?: string
          word_count?: number
          char_count?: number
          status?: string
          error_message?: string | null
          transcript_article?: string | null
          summary?: StudioTranscriptSummary | null
          quotes_extracted?: StudioTranscriptQuote[] | null
          processing_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_transcripts_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      studio_ai_outputs: {
        Row: StudioAiOutput
        Insert: {
          id?: string
          session_id: string
          model?: string
          prompt_version?: string
          status?: string
          title_best?: string
          title_alternatives?: string[]
          thumbnail_text_options?: string[]
          youtube_description?: string
          seo_keywords?: string[]
          hashtags?: string[]
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          title_best?: string
          title_alternatives?: string[]
          thumbnail_text_options?: string[]
          youtube_description?: string
          seo_keywords?: string[]
          hashtags?: string[]
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_ai_outputs_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      studio_chapters: {
        Row: StudioChapters
        Insert: {
          id?: string
          session_id: string
          status?: string
          chapters?: StudioChapterItem[]
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          chapters?: StudioChapterItem[]
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_chapters_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      studio_clips: {
        Row: StudioClips
        Insert: {
          id?: string
          session_id: string
          status?: string
          clips?: StudioClipItem[]
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          clips?: StudioClipItem[]
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_clips_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      studio_website_packages: {
        Row: StudioWebsitePackage
        Insert: {
          id?: string
          session_id: string
          status?: string
          hero_summary?: string | null
          full_summary?: string | null
          takeaways?: string[]
          quotes?: WebsiteQuoteItem[]
          topics?: string[]
          resources?: WebsiteResourceItem[]
          timestamps?: WebsiteTimestampItem[]
          linked_episode_id?: string | null
          guest_package?: GuestPackageData | null
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          hero_summary?: string | null
          full_summary?: string | null
          takeaways?: string[]
          quotes?: WebsiteQuoteItem[]
          topics?: string[]
          resources?: WebsiteResourceItem[]
          timestamps?: WebsiteTimestampItem[]
          linked_episode_id?: string | null
          guest_package?: GuestPackageData | null
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_website_packages_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      studio_analyzers: {
        Row: StudioAnalyzer
        Insert: {
          id?: string
          session_id: string
          status?: string
          data?: StudioAnalyzerData | null
          prompt_version?: string
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          data?: StudioAnalyzerData | null
          prompt_version?: string
          raw_openai_response?: Record<string, unknown> | null
          error_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_analyzers_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
