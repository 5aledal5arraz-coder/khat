import type { Article, Author, WritingPrompt, Thought, FeedItem } from "@/types/space"

export const mockAuthors: Author[] = [
  {
    id: "author-1",
    name: "محمد أحمد",
    avatar: "https://i.pravatar.cc/150?u=author1",
    bio: "كاتب ومهتم بالتطوير الذاتي",
    articlesCount: 12,
    followersCount: 234,
  },
  {
    id: "author-2",
    name: "فاطمة علي",
    avatar: "https://i.pravatar.cc/150?u=author2",
    bio: "مدونة في مجال العلاقات والصحة النفسية",
    articlesCount: 8,
    followersCount: 189,
  },
  {
    id: "author-3",
    name: "خالد السعيد",
    avatar: "https://i.pravatar.cc/150?u=author3",
    bio: "رائد أعمال ومستثمر",
    articlesCount: 15,
    followersCount: 456,
  },
  {
    id: "author-4",
    name: "نورة الشمري",
    avatar: "https://i.pravatar.cc/150?u=author4",
    bio: "مهتمة بالتأمل والوعي الذاتي",
    articlesCount: 6,
    followersCount: 123,
  },
  {
    id: "author-5",
    name: "أحمد العتيبي",
    avatar: "https://i.pravatar.cc/150?u=author5",
    bio: "كاتب محتوى ومصمم",
    articlesCount: 9,
    followersCount: 167,
  },
]

export const mockArticles: Article[] = [
  {
    id: "1",
    title: "كيف غيّرت حلقة العلاقات نظرتي للحب",
    excerpt: "بعد سماع حلقة د. سارة عن العلاقات الصحية، بدأت أفهم أن الحب ليس فقط شعوراً بل هو قرار يومي نتخذه لنبني علاقة متينة...",
    coverImage: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&q=80",
    author: mockAuthors[0],
    date: "2024-12-10",
    readTime: "5 دقائق",
    readTimeMinutes: 5,
    likes: 42,
    comments: [
      {
        id: "c1",
        authorName: "سارة محمد",
        authorAvatar: "https://i.pravatar.cc/150?u=commenter1",
        text: "مقال رائع! شكراً على مشاركة تجربتك",
        date: "2024-12-11",
        likes: 5,
      },
      {
        id: "c2",
        authorName: "علي أحمد",
        text: "أتفق معك تماماً، الحب قرار وليس مجرد شعور",
        date: "2024-12-11",
        likes: 3,
      },
    ],
    tags: ["علاقات", "حب", "تأملات"],
    featured: true,
    episodeId: "ep-1",
    episodeTitle: "أسرار العلاقات الصحية",
    episodeSlug: "healthy-relationships",
  },
  {
    id: "2",
    title: "رحلتي مع التأمل بعد حلقة الوعي الذاتي",
    excerpt: "منذ أن استمعت لحلقة نورة عن اكتشاف الذات، بدأت ممارسة التأمل يومياً لمدة 10 دقائق. إليكم ما تعلمته خلال 30 يوماً...",
    coverImage: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80",
    author: mockAuthors[1],
    date: "2024-12-08",
    readTime: "7 دقائق",
    readTimeMinutes: 7,
    likes: 35,
    comments: [
      {
        id: "c3",
        authorName: "منى الحربي",
        authorAvatar: "https://i.pravatar.cc/150?u=commenter2",
        text: "ألهمتيني لأبدأ رحلة التأمل أيضاً!",
        date: "2024-12-09",
        likes: 8,
      },
    ],
    tags: ["تأمل", "تطوير ذات", "وعي"],
    featured: false,
    episodeId: "ep-2",
    episodeTitle: "رحلة اكتشاف الذات",
    episodeSlug: "self-discovery",
  },
  {
    id: "3",
    title: "دروس من رحلة ريادة الأعمال",
    excerpt: "ملخص لأهم الدروس التي استخلصتها من حلقة أحمد العلي وكيف طبقتها في مشروعي الخاص. تعلمت أن الفشل جزء أساسي من النجاح...",
    coverImage: "https://images.unsplash.com/photo-1553484771-371a605b060b?w=800&q=80",
    author: mockAuthors[2],
    date: "2024-12-05",
    readTime: "10 دقائق",
    readTimeMinutes: 10,
    likes: 58,
    comments: [
      {
        id: "c4",
        authorName: "فهد الدوسري",
        text: "شكراً على هذا الملخص القيّم",
        date: "2024-12-06",
        likes: 4,
      },
      {
        id: "c5",
        authorName: "ريم السالم",
        authorAvatar: "https://i.pravatar.cc/150?u=commenter3",
        text: "أحتاج أسمع هذه الحلقة!",
        date: "2024-12-06",
        likes: 2,
      },
    ],
    tags: ["ريادة أعمال", "دروس", "نجاح"],
    featured: true,
    episodeId: "ep-3",
    episodeTitle: "قصة نجاح رائد أعمال",
    episodeSlug: "entrepreneur-story",
  },
  {
    id: "4",
    title: "كيف تتعامل مع القلق اليومي",
    excerpt: "نصائح عملية من حلقة الصحة النفسية ساعدتني في التعامل مع قلقي اليومي والتخفيف من التوتر...",
    coverImage: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=800&q=80",
    author: mockAuthors[3],
    date: "2024-12-03",
    readTime: "6 دقائق",
    readTimeMinutes: 6,
    likes: 67,
    comments: [],
    tags: ["صحة نفسية", "قلق", "نصائح"],
    featured: false,
    episodeId: "ep-4",
    episodeTitle: "التعامل مع القلق",
    episodeSlug: "dealing-with-anxiety",
  },
  {
    id: "5",
    title: "فن التواصل الفعال في العمل",
    excerpt: "تطبيقات عملية من حلقة القيادة على بيئة العمل. كيف تبني علاقات مهنية قوية وتتواصل بفعالية مع زملائك...",
    coverImage: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80",
    author: mockAuthors[4],
    date: "2024-12-01",
    readTime: "8 دقائق",
    readTimeMinutes: 8,
    likes: 45,
    comments: [
      {
        id: "c6",
        authorName: "عبدالله الغامدي",
        text: "نصائح قيمة جداً، شكراً!",
        date: "2024-12-02",
        likes: 6,
      },
    ],
    tags: ["عمل", "تواصل", "قيادة"],
    featured: false,
  },
  {
    id: "6",
    title: "أهمية الروتين الصباحي",
    excerpt: "بعد تجربة الروتين الصباحي الذي اقترحه الضيف في حلقة الإنتاجية، لاحظت تغييراً كبيراً في يومي...",
    coverImage: "https://images.unsplash.com/photo-1484627147104-f5197bcd6651?w=800&q=80",
    author: mockAuthors[0],
    date: "2024-11-28",
    readTime: "4 دقائق",
    readTimeMinutes: 4,
    likes: 89,
    comments: [],
    tags: ["إنتاجية", "روتين", "صباح"],
    featured: true,
  },
]

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
]

export const trendingTags = ["صحة نفسية", "علاقات", "تطوير ذات", "إنتاجية"]

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

export function getTopContributors(): Author[] {
  return [...mockAuthors].sort((a, b) => b.articlesCount - a.articlesCount).slice(0, 5)
}

export function getWeeklyHighlights(): Article[] {
  return mockArticles.filter((a) => a.likes > 50).slice(0, 3)
}

export function searchArticles(query: string): Article[] {
  const q = query.toLowerCase()
  return mockArticles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
  )
}

export function filterByTag(tag: string): Article[] {
  return mockArticles.filter((a) => a.tags.includes(tag))
}

export function sortArticles(articles: Article[], sort: string): Article[] {
  const sorted = [...articles]
  switch (sort) {
    case "likes":
      return sorted.sort((a, b) => b.likes - a.likes)
    case "comments":
      return sorted.sort((a, b) => b.comments.length - a.comments.length)
    case "oldest":
      return sorted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }
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

export function getAuthorById(id: string): Author | undefined {
  return mockAuthors.find((a) => a.id === id)
}

// Quick Thoughts (خواطر سريعة)
export const mockThoughts: Thought[] = [
  {
    id: "thought-1",
    content: "أحياناً أفضل قرار تتخذه هو أن لا تتخذ أي قرار. امنح نفسك وقتاً للتفكير.",
    author: mockAuthors[0],
    date: "2024-01-15T14:30:00Z",
    likes: 45,
    replies: [
      {
        id: "reply-1",
        authorName: "سارة محمد",
        authorAvatar: "https://i.pravatar.cc/150?u=reply1",
        content: "كلام جميل! أحتاج أطبق هذا في حياتي",
        date: "2024-01-15T15:00:00Z",
        likes: 8,
      },
    ],
    tags: ["تأمل", "قرارات"],
  },
  {
    id: "thought-2",
    content: "الاستماع الجيد هو نصف الحوار الناجح. أحياناً الصمت أبلغ من الكلام.",
    author: mockAuthors[1],
    date: "2024-01-15T12:00:00Z",
    likes: 67,
    replies: [],
    tags: ["تواصل", "علاقات"],
  },
  {
    id: "thought-3",
    content: "لا تقارن بدايتك بنهاية غيرك. كل شخص له مسيرته الخاصة.",
    author: mockAuthors[2],
    date: "2024-01-15T10:00:00Z",
    likes: 89,
    replies: [
      {
        id: "reply-2",
        authorName: "فهد الدوسري",
        content: "هذا بالضبط ما أحتاج أسمعه اليوم 🙏",
        date: "2024-01-15T10:30:00Z",
        likes: 12,
      },
      {
        id: "reply-3",
        authorName: "منى الحربي",
        authorAvatar: "https://i.pravatar.cc/150?u=reply3",
        content: "المقارنة سارقة للسعادة فعلاً",
        date: "2024-01-15T11:00:00Z",
        likes: 5,
      },
    ],
    tags: ["تحفيز", "نجاح"],
  },
  {
    id: "thought-4",
    content: "القراءة يومياً ولو لعشر دقائق تُحدث فرقاً كبيراً على المدى البعيد.",
    author: mockAuthors[3],
    date: "2024-01-14T20:00:00Z",
    likes: 56,
    replies: [],
    tags: ["قراءة", "عادات"],
  },
  {
    id: "thought-5",
    content: "الامتنان ليس فقط شعوراً، بل هو ممارسة يومية تغير نظرتك للحياة.",
    author: mockAuthors[4],
    date: "2024-01-14T18:00:00Z",
    likes: 78,
    replies: [
      {
        id: "reply-4",
        authorName: "ريم السالم",
        authorAvatar: "https://i.pravatar.cc/150?u=reply4",
        content: "بدأت أكتب ثلاث أشياء أمتن لها كل يوم",
        date: "2024-01-14T18:30:00Z",
        likes: 9,
      },
    ],
    tags: ["امتنان", "صحة نفسية"],
  },
  {
    id: "thought-6",
    content: "أفضل استثمار تقوم به هو في نفسك. تعلّم مهارة جديدة كل شهر.",
    author: mockAuthors[0],
    date: "2024-01-14T15:00:00Z",
    likes: 92,
    replies: [],
    tags: ["تطوير ذات", "استثمار"],
  },
  {
    id: "thought-7",
    content: "الفشل ليس عكس النجاح، بل هو جزء منه. كل محاولة فاشلة تقربك من هدفك.",
    author: mockAuthors[1],
    date: "2024-01-14T12:00:00Z",
    likes: 104,
    replies: [
      {
        id: "reply-5",
        authorName: "عبدالله الغامدي",
        content: "فشلت ثلاث مرات قبل ما أنجح في مشروعي",
        date: "2024-01-14T12:30:00Z",
        likes: 15,
      },
    ],
    tags: ["فشل", "نجاح"],
  },
  {
    id: "thought-8",
    content: "خذ استراحة. ذهنك يحتاج للراحة ليعمل بكفاءة. لا تشعر بالذنب.",
    author: mockAuthors[2],
    date: "2024-01-14T09:00:00Z",
    likes: 63,
    replies: [],
    tags: ["صحة نفسية", "إنتاجية"],
  },
  {
    id: "thought-9",
    content: "العلاقات الصحية تحتاج جهداً من الطرفين. لا تكن الوحيد الذي يحاول.",
    author: mockAuthors[3],
    date: "2024-01-13T22:00:00Z",
    likes: 81,
    replies: [
      {
        id: "reply-6",
        authorName: "نوف الشمري",
        authorAvatar: "https://i.pravatar.cc/150?u=reply6",
        content: "درس تعلمته بالطريقة الصعبة",
        date: "2024-01-13T22:30:00Z",
        likes: 7,
      },
    ],
    tags: ["علاقات"],
  },
  {
    id: "thought-10",
    content: "التغيير يبدأ بقرار صغير تتخذه اليوم. لا تنتظر الغد.",
    author: mockAuthors[4],
    date: "2024-01-13T18:00:00Z",
    likes: 72,
    replies: [],
    tags: ["تغيير", "تحفيز"],
  },
  {
    id: "thought-11",
    content: "اسأل نفسك: هل هذا الأمر سيهمني بعد خمس سنوات؟ إذا لا، لا تضيع وقتك عليه.",
    author: mockAuthors[0],
    date: "2024-01-13T14:00:00Z",
    likes: 95,
    replies: [
      {
        id: "reply-7",
        authorName: "أحمد العتيبي",
        content: "قاعدة الخمس سنوات غيرت طريقة تفكيري",
        date: "2024-01-13T14:30:00Z",
        likes: 11,
      },
    ],
    tags: ["حكمة", "قرارات"],
  },
  {
    id: "thought-12",
    content: "كن لطيفاً مع نفسك. أنت تفعل أفضل ما تستطيع بما لديك من معرفة وموارد.",
    author: mockAuthors[1],
    date: "2024-01-13T10:00:00Z",
    likes: 88,
    replies: [],
    tags: ["تقبل الذات", "صحة نفسية"],
  },
  {
    id: "thought-13",
    content: "الوقت الذي تقضيه مع من تحب ليس وقتاً ضائعاً، بل هو أفضل استثمار.",
    author: mockAuthors[2],
    date: "2024-01-12T20:00:00Z",
    likes: 76,
    replies: [
      {
        id: "reply-8",
        authorName: "سلمى أحمد",
        authorAvatar: "https://i.pravatar.cc/150?u=reply8",
        content: "العائلة أولاً دائماً ❤️",
        date: "2024-01-12T20:30:00Z",
        likes: 6,
      },
    ],
    tags: ["عائلة", "علاقات"],
  },
  {
    id: "thought-14",
    content: "لا تخف من البدء من جديد. هذه المرة لست مبتدئاً، بل لديك خبرة.",
    author: mockAuthors[3],
    date: "2024-01-12T16:00:00Z",
    likes: 69,
    replies: [],
    tags: ["بدايات", "تحفيز"],
  },
  {
    id: "thought-15",
    content: "أكثر الناس نجاحاً هم من يسألون أكثر الأسئلة. لا تخجل من عدم المعرفة.",
    author: mockAuthors[4],
    date: "2024-01-12T12:00:00Z",
    likes: 84,
    replies: [
      {
        id: "reply-9",
        authorName: "خالد السعيد",
        content: "السؤال مفتاح العلم",
        date: "2024-01-12T12:30:00Z",
        likes: 4,
      },
    ],
    tags: ["تعلم", "نجاح"],
  },
]

export function getLatestThoughts(limit: number = 10): Thought[] {
  return [...mockThoughts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)
}

export function getTrendingThoughts(limit: number = 10): Thought[] {
  return [...mockThoughts]
    .sort((a, b) => {
      const engagementA = a.likes + a.replies.length * 2
      const engagementB = b.likes + b.replies.length * 2
      return engagementB - engagementA
    })
    .slice(0, limit)
}

export function getThoughtsByAuthor(authorId: string): Thought[] {
  return mockThoughts.filter((t) => t.author.id === authorId)
}

export function getThoughtById(id: string): Thought | undefined {
  return mockThoughts.find((t) => t.id === id)
}

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

export function getFeaturedFeedItem(): FeedItem | undefined {
  const featured = mockArticles.find((a) => a.featured)
  if (!featured) return undefined
  return {
    type: "article",
    id: `article-${featured.id}`,
    data: featured,
    featured: true,
    timestamp: featured.date,
  }
}
