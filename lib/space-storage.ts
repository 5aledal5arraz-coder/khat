// Space storage management using localStorage

import type { Draft } from "@/types/space"

const DRAFTS_KEY = "khat-space-drafts"
const FOLLOWS_KEY = "khat-space-follows"
const LIKED_ARTICLES_KEY = "khat-space-liked"
const BOOKMARKED_ARTICLES_KEY = "khat-space-bookmarked"
const REACTIONS_KEY = "khat-space-reactions"

// Drafts
export function getDrafts(): Draft[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(DRAFTS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveDraft(draft: Draft): void {
  if (typeof window === "undefined") return
  const drafts = getDrafts()
  const existingIndex = drafts.findIndex((d) => d.id === draft.id)

  if (existingIndex >= 0) {
    drafts[existingIndex] = draft
  } else {
    drafts.unshift(draft)
  }

  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 10)))
}

export function deleteDraft(draftId: string): void {
  if (typeof window === "undefined") return
  const drafts = getDrafts().filter((d) => d.id !== draftId)
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

// Follows
export function getFollowedAuthors(): string[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(FOLLOWS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function followAuthor(authorId: string): void {
  if (typeof window === "undefined") return
  const follows = getFollowedAuthors()
  if (!follows.includes(authorId)) {
    follows.push(authorId)
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows))
  }
}

export function unfollowAuthor(authorId: string): void {
  if (typeof window === "undefined") return
  const follows = getFollowedAuthors().filter((id) => id !== authorId)
  localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows))
}

export function isFollowing(authorId: string): boolean {
  return getFollowedAuthors().includes(authorId)
}

// Likes
export function getLikedArticles(): string[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(LIKED_ARTICLES_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function toggleArticleLike(articleId: string): boolean {
  if (typeof window === "undefined") return false
  const liked = getLikedArticles()
  const isLiked = liked.includes(articleId)

  if (isLiked) {
    const filtered = liked.filter((id) => id !== articleId)
    localStorage.setItem(LIKED_ARTICLES_KEY, JSON.stringify(filtered))
    return false
  } else {
    liked.push(articleId)
    localStorage.setItem(LIKED_ARTICLES_KEY, JSON.stringify(liked))
    return true
  }
}

export function isArticleLiked(articleId: string): boolean {
  return getLikedArticles().includes(articleId)
}

// Bookmarks
export function getBookmarkedArticles(): string[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(BOOKMARKED_ARTICLES_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function toggleBookmark(articleId: string): boolean {
  if (typeof window === "undefined") return false
  const bookmarked = getBookmarkedArticles()
  const isBookmarked = bookmarked.includes(articleId)

  if (isBookmarked) {
    const filtered = bookmarked.filter((id) => id !== articleId)
    localStorage.setItem(BOOKMARKED_ARTICLES_KEY, JSON.stringify(filtered))
    return false
  } else {
    bookmarked.push(articleId)
    localStorage.setItem(BOOKMARKED_ARTICLES_KEY, JSON.stringify(bookmarked))
    return true
  }
}

export function isBookmarked(articleId: string): boolean {
  return getBookmarkedArticles().includes(articleId)
}

// Reactions (emoji reactions per article)
export type ReactionType = "clap" | "fire" | "bulb" | "heart"

export interface ArticleReactions {
  [articleId: string]: ReactionType[]
}

export function getReactions(): ArticleReactions {
  if (typeof window === "undefined") return {}
  try {
    const data = localStorage.getItem(REACTIONS_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

export function getArticleReactions(articleId: string): ReactionType[] {
  return getReactions()[articleId] || []
}

export function toggleReaction(articleId: string, reaction: ReactionType): ReactionType[] {
  if (typeof window === "undefined") return []
  const reactions = getReactions()
  const articleReactions = reactions[articleId] || []

  const hasReaction = articleReactions.includes(reaction)

  if (hasReaction) {
    reactions[articleId] = articleReactions.filter((r) => r !== reaction)
  } else {
    reactions[articleId] = [...articleReactions, reaction]
  }

  localStorage.setItem(REACTIONS_KEY, JSON.stringify(reactions))
  return reactions[articleId]
}

// Reading Progress
const READING_PROGRESS_KEY = "khat-space-reading-progress"

export interface ReadingProgress {
  [articleId: string]: number // 0-100 percentage
}

export function getReadingProgress(): ReadingProgress {
  if (typeof window === "undefined") return {}
  try {
    const data = localStorage.getItem(READING_PROGRESS_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

export function getArticleProgress(articleId: string): number {
  return getReadingProgress()[articleId] || 0
}

export function setArticleProgress(articleId: string, progress: number): void {
  if (typeof window === "undefined") return
  const allProgress = getReadingProgress()
  // Only update if new progress is higher (don't go backwards)
  const currentProgress = allProgress[articleId] || 0
  if (progress > currentProgress) {
    allProgress[articleId] = Math.min(100, Math.round(progress))
    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(allProgress))
  }
}

// Thought Likes
const THOUGHTS_LIKED_KEY = "khat-space-thoughts-liked"

export function getLikedThoughts(): string[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(THOUGHTS_LIKED_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function toggleThoughtLike(thoughtId: string): boolean {
  if (typeof window === "undefined") return false
  const liked = getLikedThoughts()
  const isLiked = liked.includes(thoughtId)

  if (isLiked) {
    const filtered = liked.filter((id) => id !== thoughtId)
    localStorage.setItem(THOUGHTS_LIKED_KEY, JSON.stringify(filtered))
    return false
  } else {
    liked.push(thoughtId)
    localStorage.setItem(THOUGHTS_LIKED_KEY, JSON.stringify(liked))
    return true
  }
}

export function isThoughtLiked(thoughtId: string): boolean {
  return getLikedThoughts().includes(thoughtId)
}
