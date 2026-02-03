import { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PenSquare, Heart, Share2, MessageCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "مساحة خط",
  description: "مقالات وأفكار من مجتمع خط",
}

// Mock articles data
const mockArticles = [
  {
    id: "1",
    title: "كيف غيّرت حلقة العلاقات نظرتي للحب",
    excerpt: "بعد سماع حلقة د. سارة عن العلاقات الصحية، بدأت أفهم أن الحب ليس فقط شعوراً بل هو قرار يومي...",
    author: "محمد أحمد",
    date: "2024-12-10",
    readTime: "5 دقائق",
    likes: 42,
    comments: 8,
    tags: ["علاقات", "تأملات"],
    featured: true,
  },
  {
    id: "2",
    title: "رحلتي مع التأمل بعد حلقة الوعي الذاتي",
    excerpt: "منذ أن استمعت لحلقة نورة عن اكتشاف الذات، بدأت ممارسة التأمل يومياً. إليكم ما تعلمته...",
    author: "فاطمة علي",
    date: "2024-12-08",
    readTime: "7 دقائق",
    likes: 35,
    comments: 12,
    tags: ["تأمل", "تطوير ذات"],
    featured: false,
  },
  {
    id: "3",
    title: "دروس من رحلة ريادة الأعمال",
    excerpt: "ملخص لأهم الدروس التي استخلصتها من حلقة أحمد العلي وكيف طبقتها في مشروعي الخاص...",
    author: "خالد السعيد",
    date: "2024-12-05",
    readTime: "10 دقائق",
    likes: 58,
    comments: 15,
    tags: ["ريادة أعمال", "دروس"],
    featured: true,
  },
]

export default function SpacePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">مساحة خط</h1>
          <p className="mt-2 text-muted-foreground">
            مقالات وأفكار من مجتمع خط
          </p>
        </div>
        <Link href="/space/write">
          <Button className="gap-2">
            <PenSquare className="h-4 w-4" />
            اكتب مقالاً
          </Button>
        </Link>
      </div>

      {/* Featured Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">مقالات مميزة</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {mockArticles
            .filter((a) => a.featured)
            .map((article) => (
              <Link key={article.id} href={`/space/${article.id}`}>
                <Card className="h-full transition-all hover:border-primary/50 hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Badge variant="secondary" className="bg-primary/20 text-primary">
                        مميز
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {article.readTime}
                      </span>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold">{article.title}</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-muted-foreground">
                      {article.excerpt}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{article.author}</span>
                        <span>•</span>
                        <span>{article.date}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1 text-sm">
                          <Heart className="h-4 w-4" />
                          {article.likes}
                        </span>
                        <span className="flex items-center gap-1 text-sm">
                          <MessageCircle className="h-4 w-4" />
                          {article.comments}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {article.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
      </div>

      {/* All Articles */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">جميع المقالات</h2>
        <div className="space-y-4">
          {mockArticles.map((article) => (
            <Link key={article.id} href={`/space/${article.id}`}>
              <Card className="transition-all hover:border-primary/50">
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex-1">
                    <h3 className="font-semibold">{article.title}</h3>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {article.excerpt}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{article.author}</span>
                      <span>{article.date}</span>
                      <span>{article.readTime}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1 text-sm">
                      <Heart className="h-4 w-4" />
                      {article.likes}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
