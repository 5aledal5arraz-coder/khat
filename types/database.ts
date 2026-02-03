export interface Topic {
  id: string
  name: string
  slug: string
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
  summary: string | null
  key_takeaways: string[] | null
  youtube_url: string
  duration_minutes: number
  release_date: string
  season: number | null
  mood: string | null
  guest_id: string | null
  created_at: string
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
