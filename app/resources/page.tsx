import { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { BookOpen, Link as LinkIcon, ExternalLink, Search } from "lucide-react"

export const metadata: Metadata = {
  title: "الموارد",
  description: "كتب وروابط مذكورة في حلقات خط",
}

const mockResources = [
  {
    id: "1",
    title: "لغات الحب الخمس",
    author: "غاري تشابمان",
    type: "book",
    url: "https://example.com/book1",
    episodes: ["كيف نبني علاقات صحية ومستدامة؟"],
    topics: ["علاقات"],
  },
  {
    id: "2",
    title: "من الصفر إلى الواحد",
    author: "بيتر ثيل",
    type: "book",
    url: "https://example.com/book2",
    episodes: ["رحلة ريادة الأعمال"],
    topics: ["ريادة أعمال"],
  },
  {
    id: "3",
    title: "قوة الآن",
    author: "إيكهارت تول",
    type: "book",
    url: "https://example.com/book3",
    episodes: ["اكتشاف الذات", "التعامل مع القلق"],
    topics: ["تطوير ذات", "صحة نفسية"],
  },
  {
    id: "4",
    title: "العادات الذرية",
    author: "جيمس كلير",
    type: "book",
    url: "https://example.com/book4",
    episodes: ["بناء العادات الإيجابية"],
    topics: ["تطوير ذات"],
  },
  {
    id: "5",
    title: "مقال: فن الاستماع الفعال",
    author: "Harvard Business Review",
    type: "article",
    url: "https://example.com/article1",
    episodes: ["التواصل في العلاقات"],
    topics: ["علاقات", "تواصل"],
  },
  {
    id: "6",
    title: "فكر ببطء، قرر بسرعة",
    author: "دانيال كانمان",
    type: "book",
    url: "https://example.com/book5",
    episodes: ["اتخاذ القرارات"],
    topics: ["تفكير", "قرارات"],
  },
]

export default function ResourcesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">الموارد</h1>
        <p className="mt-2 text-muted-foreground">
          كتب وروابط مذكورة في حلقات البودكاست
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث عن كتاب أو مقال..." className="ps-10" />
        </div>
        <Select defaultValue="">
          <option value="">جميع الأنواع</option>
          <option value="book">كتب</option>
          <option value="article">مقالات</option>
          <option value="link">روابط</option>
        </Select>
        <Select defaultValue="">
          <option value="">جميع المواضيع</option>
          <option value="relationships">علاقات</option>
          <option value="self-growth">تطوير ذات</option>
          <option value="career">ريادة أعمال</option>
        </Select>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">24</p>
              <p className="text-xs text-muted-foreground">كتاب</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20">
              <LinkIcon className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">18</p>
              <p className="text-xs text-muted-foreground">مقال</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-xs text-muted-foreground">رابط</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resources Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockResources.map((resource) => (
          <Card key={resource.id} className="transition-all hover:border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  {resource.type === "book" ? (
                    <BookOpen className="h-5 w-5 text-primary" />
                  ) : (
                    <LinkIcon className="h-5 w-5 text-accent" />
                  )}
                </div>
                <Badge variant="outline">
                  {resource.type === "book" ? "كتاب" : "مقال"}
                </Badge>
              </div>
              <h3 className="mt-3 font-semibold">{resource.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{resource.author}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {resource.topics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="text-xs">
                    {topic}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">ذُكر في:</p>
                <ul className="mt-1 space-y-1">
                  {resource.episodes.map((ep) => (
                    <li key={ep} className="text-xs text-primary hover:underline">
                      <Link href="/episodes">{ep}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                زيارة المصدر
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
