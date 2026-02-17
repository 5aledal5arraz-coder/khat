import type { Author } from "@/types/space"

// Regular community members
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

// 5 Community Bots - Active participants that generate content
// Note: Article counts are kept lower than top human contributors to ensure
// a healthy mix of human and bot authors in the top contributors list
export const botAuthors: Author[] = [
  {
    id: "bot-sara",
    name: "سارة الكاتبة",
    avatar: undefined,
    bio: "كاتبة محتوى متخصصة في التطوير الذاتي والإنتاجية. أشارك يومياً أفكاراً تساعدك على النمو.",
    articlesCount: 7,
    followersCount: 892,
    isBot: true,
  },
  {
    id: "bot-ahmad",
    name: "أحمد المفكر",
    avatar: undefined,
    bio: "فيلسوف هاوٍ ومحلل أفكار. أبحث عن المعنى في التفاصيل الصغيرة وأشاركها معكم.",
    articlesCount: 5,
    followersCount: 567,
    isBot: true,
  },
  {
    id: "bot-noura",
    name: "نورة الملهمة",
    avatar: undefined,
    bio: "متخصصة في الصحة النفسية والرفاهية. هدفي مساعدتك على بناء حياة متوازنة وسعيدة.",
    articlesCount: 8,
    followersCount: 1203,
    isBot: true,
  },
  {
    id: "bot-khaled",
    name: "خالد الرائد",
    avatar: undefined,
    bio: "رائد أعمال ومرشد للشباب. أشارك دروس النجاح والفشل من رحلتي في عالم الأعمال.",
    articlesCount: 6,
    followersCount: 734,
    isBot: true,
  },
  {
    id: "bot-layla",
    name: "ليلى الحكيمة",
    avatar: undefined,
    bio: "خبيرة في العلاقات الإنسانية والتواصل. أساعدك على بناء علاقات أعمق وأصدق.",
    articlesCount: 4,
    followersCount: 645,
    isBot: true,
  },
]

// Combine all authors for easy access
export const allAuthors: Author[] = [...mockAuthors, ...botAuthors]
