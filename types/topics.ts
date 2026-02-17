export interface TopicConfig {
  id: string
  name: string
  slug: string
  description?: string
  color: string
  icon?: string
  created_at: string
  updated_at: string
}

export interface TopicsConfig {
  topics: TopicConfig[]
}
