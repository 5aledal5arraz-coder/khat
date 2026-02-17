import { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Headphones } from "lucide-react"
import { formatArabicCount } from "@/lib/utils"

export const metadata: Metadata = {
  title: "المجموعات",
  description: "حلقات مجمعة حسب الموضوع",
}

const collections = [
  {
    slug: "relationships",
    title: "العلاقات والحب",
    description: "حلقات تتناول بناء العلاقات الصحية، التواصل الفعال، والتعامل مع التحديات العاطفية",
    episodeCount: 12,
    color: "bg-red-500/20 text-red-400",
    emoji: "❤️",
  },
  {
    slug: "self-growth",
    title: "تطوير الذات",
    description: "رحلات نمو شخصي، قصص تحول، وأدوات عملية لتطوير النفس",
    episodeCount: 15,
    color: "bg-green-500/20 text-green-400",
    emoji: "🌱",
  },
  {
    slug: "meaning",
    title: "المعنى والهوية",
    description: "حوارات عميقة عن إيجاد معنى الحياة، الهدف، والقيم الشخصية",
    episodeCount: 8,
    color: "bg-purple-500/20 text-purple-400",
    emoji: "✨",
  },
  {
    slug: "mental-health",
    title: "الصحة النفسية",
    description: "حوارات عن الصحة النفسية، التعامل مع القلق والضغوط، والعافية الشاملة",
    episodeCount: 10,
    color: "bg-blue-500/20 text-blue-400",
    emoji: "🧠",
  },
  {
    slug: "career",
    title: "العمل والمهنة",
    description: "قصص نجاح مهني، ريادة الأعمال، القيادة، والتوازن بين العمل والحياة",
    episodeCount: 9,
    color: "bg-amber-500/20 text-amber-400",
    emoji: "💼",
  },
  {
    slug: "emotional-void",
    title: "الفراغ العاطفي",
    description: "فهم الفراغ العاطفي، أسبابه، وكيفية التعامل معه بطرق صحية",
    episodeCount: 6,
    color: "bg-indigo-500/20 text-indigo-400",
    emoji: "🕳️",
  },
]

export default function SeriesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">المجموعات</h1>
        <p className="mt-2 text-muted-foreground">
          حلقات مجمعة حسب الموضوع لتسهيل استكشاف المحتوى
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <Link key={collection.slug} href={`/episodes?category=${collection.slug}`}>
            <Card className="h-full transition-all hover:border-primary/50 hover:shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-4xl">{collection.emoji}</span>
                  <Badge variant="secondary" className={collection.color}>
                    <Headphones className="me-1 h-3 w-3" />
                    {formatArabicCount(collection.episodeCount, "حلقة")}
                  </Badge>
                </div>
                <CardTitle className="mt-4">{collection.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {collection.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
