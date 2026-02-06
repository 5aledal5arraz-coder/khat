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

export interface SponsorshipLead {
  id: string
  name: string
  email: string
  company: string | null
  message: string | null
  created_at: string
}

export interface GuestApplication {
  id: string
  name: string
  email: string
  topic: string | null
  links: string | null
  bio: string | null
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
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          bio?: string | null
          photo_url?: string | null
          external_links?: Record<string, string> | null
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
          name: string
          email: string
          company?: string | null
          message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          company?: string | null
          message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      guest_applications: {
        Row: GuestApplication
        Insert: {
          id?: string
          name: string
          email: string
          topic?: string | null
          links?: string | null
          bio?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          topic?: string | null
          links?: string | null
          bio?: string | null
          created_at?: string
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
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content: string
          tags?: string[]
          moderation_status?: string
        }
        Update: {
          content?: string
          tags?: string[]
          moderation_status?: string
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
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          article_id: string
          user_id: string
          content: string
          moderation_status?: string
        }
        Update: {
          content?: string
          moderation_status?: string
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
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thought_id: string
          user_id: string
          content: string
          moderation_status?: string
        }
        Update: {
          content?: string
          moderation_status?: string
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
