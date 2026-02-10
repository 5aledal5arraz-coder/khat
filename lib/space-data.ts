/**
 * Barrel re-export for backward compatibility.
 *
 * This file used to contain all mock data and query functions (~1077 lines).
 * It has been split into domain-specific modules:
 *
 *   - space-authors.ts   — Author data + author queries
 *   - space-articles.ts  — Article data + article queries
 *   - space-thoughts.ts  — Thought data
 *   - space-feed.ts      — Tags, prompts, feed sort, unified feed
 *
 * New code should import from the specific module directly.
 */

// Authors
export {
  mockAuthors,
  botAuthors,
  allAuthors,
  getTopContributors,
  getAuthorById,
} from "./space-authors"

// Articles
export {
  mockArticles,
  getWeeklyHighlights,
  getArticleById,
  getRelatedArticles,
  getArticlesByAuthor,
} from "./space-articles"

// Thoughts
export { mockThoughts } from "./space-thoughts"

// Feed, tags, prompts
export {
  allTags,
  trendingTags,
  writingPrompts,
  getUnifiedFeed,
} from "./space-feed"
export type { FeedSortOption } from "./space-feed"
