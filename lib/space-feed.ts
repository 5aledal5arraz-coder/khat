import type { Article, Thought, WritingPrompt, FeedItem } from "@/types/space"
import { mockArticles } from "./space-articles"
import { mockThoughts } from "./space-thoughts"

export const allTags = [
  "علاقات",
  "تطوير ذات",
  "صحة نفسية",
  "ريادة أعمال",
  "تأمل",
  "إنتاجية",
  "قيادة",
  "نجاح",
  "حب",
  "تواصل",
  "عادات",
  "توازن",
  "امتنان",
  "سعادة",
  "حكمة",
  "راحة",
  "تعلم",
  "تحفيز",
]

export const trendingTags = ["صحة نفسية", "علاقات", "إنتاجية", "نجاح", "تطوير ذات"]

export const writingPrompts: WritingPrompt[] = [
  {
    id: "prompt-1",
    text: "شاركنا كيف أثرت حلقة هذا الأسبوع على حياتك",
    episodeTitle: "أسرار العلاقات الصحية",
    episodeSlug: "healthy-relationships",
  },
  {
    id: "prompt-2",
    text: "ما هي أهم ثلاث دروس تعلمتها من البودكاست؟",
  },
  {
    id: "prompt-3",
    text: "اكتب عن تجربة غيّرت نظرتك للحياة",
  },
  {
    id: "prompt-4",
    text: "كيف تطبق ما تسمعه في حياتك اليومية؟",
  },
]

// Unified Feed
export type FeedSortOption = "newest" | "popular" | "discussed"

export function getUnifiedFeed(options: {
  sort?: FeedSortOption
  tag?: string
  limit?: number
}): FeedItem[] {
  const { sort = "newest", tag, limit = 20 } = options

  // Convert articles to feed items
  const articleItems: FeedItem[] = mockArticles.map((article) => ({
    type: "article" as const,
    id: `article-${article.id}`,
    data: article,
    featured: article.featured,
    timestamp: article.date,
  }))

  // Convert thoughts to feed items
  const thoughtItems: FeedItem[] = mockThoughts.map((thought) => ({
    type: "thought" as const,
    id: `thought-${thought.id}`,
    data: thought,
    featured: false,
    timestamp: thought.date,
  }))

  // Combine all items
  let feedItems = [...articleItems, ...thoughtItems]

  // Filter by tag if provided
  if (tag) {
    feedItems = feedItems.filter((item) => {
      if (item.type === "article") {
        return (item.data as Article).tags.includes(tag)
      } else {
        return (item.data as Thought).tags?.includes(tag)
      }
    })
  }

  // Sort items
  switch (sort) {
    case "popular":
      feedItems.sort((a, b) => {
        const likesA = a.data.likes
        const likesB = b.data.likes
        return likesB - likesA
      })
      break
    case "discussed":
      feedItems.sort((a, b) => {
        const commentsA = a.type === "article"
          ? (a.data as Article).comments.length
          : (a.data as Thought).replies.length
        const commentsB = b.type === "article"
          ? (b.data as Article).comments.length
          : (b.data as Thought).replies.length
        return commentsB - commentsA
      })
      break
    case "newest":
    default:
      feedItems.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
  }

  return feedItems.slice(0, limit)
}
