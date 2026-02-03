export interface Author {
  id: string
  name: string
  avatar?: string
  bio?: string
  articlesCount: number
  followersCount: number
}

export interface Article {
  id: string
  title: string
  excerpt: string
  content?: string
  coverImage?: string
  author: Author
  date: string
  readTime: string
  readTimeMinutes: number
  likes: number
  comments: Comment[]
  tags: string[]
  featured: boolean
  episodeId?: string
  episodeTitle?: string
  episodeSlug?: string
}

export interface Comment {
  id: string
  authorName: string
  authorAvatar?: string
  text: string
  date: string
  likes: number
}

export interface Draft {
  id: string
  title: string
  content: string
  tags: string[]
  episodeId?: string
  episodeSlug?: string
  episodeTitle?: string
  lastSaved: string
}

export interface WritingPrompt {
  id: string
  text: string
  episodeTitle?: string
  episodeSlug?: string
}

export interface ThoughtReply {
  id: string
  authorName: string
  authorAvatar?: string
  content: string
  date: string
  likes: number
}

export interface Thought {
  id: string
  content: string
  author: Author
  date: string
  likes: number
  replies: ThoughtReply[]
  tags?: string[]
}

export interface FeedItem {
  type: "article" | "thought"
  id: string
  data: Article | Thought
  featured: boolean
  timestamp: string
}
