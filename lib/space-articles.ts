import type { Article } from "@/types/space"
import { mockArticles } from "./mocks/space-articles"

export { mockArticles }

export function getWeeklyHighlights(): Article[] {
  return mockArticles.filter((a) => a.likes > 50).slice(0, 3)
}

export function getArticleById(id: string): Article | undefined {
  return mockArticles.find((a) => a.id === id)
}

export function getRelatedArticles(currentId: string, tags: string[], limit: number = 3): Article[] {
  return mockArticles
    .filter((a) => a.id !== currentId && a.tags.some((t) => tags.includes(t)))
    .slice(0, limit)
}

export function getArticlesByAuthor(authorId: string): Article[] {
  return mockArticles.filter((a) => a.author.id === authorId)
}
