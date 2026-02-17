import type { Author } from "@/types/space"
import { allAuthors } from "./mocks/space-authors"

export function getTopContributors(): Author[] {
  // Include both regular authors and bots, sorted by articles count
  return [...allAuthors].sort((a, b) => b.articlesCount - a.articlesCount).slice(0, 5)
}

export function getAuthorById(id: string): Author | undefined {
  return allAuthors.find((a) => a.id === id)
}
