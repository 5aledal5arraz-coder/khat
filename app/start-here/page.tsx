import { Suspense } from "react"
import { Metadata } from "next"
import Link from "next/link"
import { getEpisodesByTopicPath } from "@/lib/supabase/queries"
import { EpisodeCard } from "@/components/episodes/episode-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "ابدأ من هنا",
  description: "اختر المسار المناسب لك واستكشف أفضل حلقات بودكاست خط",
}

const topicPaths = [
  {
    slug: "relationships",
    name: "العلاقات",
    description: "حلقات عن بناء علاقات صحية، التواصل الفعال، ومعالجة التحديات العاطفية في حياتنا",
    emoji: "❤️",
    color: "bg-red-50 border-red-200",
    topics: ["relationships", "communication", "family"],
  },
  {
    slug: "self-growth",
    name: "تطوير الذات",
    description: "رحلات نمو شخصي، قصص تحول ملهمة، وأدوات عملية لتطوير النفس",
    emoji: "🌱",
    color: "bg-green-50 border-green-200",
    topics: ["self-growth", "habits", "mindset"],
  },
  {
    slug: "meaning",
    name: "المعنى والهدف",
    description: "حوارات عميقة عن إيجاد معنى الحياة، الهدف، والقيم الشخصية",
    emoji: "✨",
    color: "bg-yellow-50 border-yellow-200",
    topics: ["meaning", "purpose", "spirituality"],
  },
  {
    slug: "career",
    name: "العمل والمهنة",
    description: "قصص نجاح مهني، تحديات العمل، وكيفية إيجاد التوازن",
    emoji: "💼",
    color: "bg-blue-50 border-blue-200",
    topics: ["career", "entrepreneurship", "leadership"],
  },
  {
    slug: "health",
    name: "الصحة النفسية",
    description: "حوارات عن الصحة النفسية، التعامل مع الضغوط، والعافية الشاملة",
    emoji: "🧠",
    color: "bg-purple-50 border-purple-200",
    topics: ["mental-health", "wellness", "psychology"],
  },
  {
    slug: "culture",
    name: "الثقافة والمجتمع",
    description: "نقاشات عن القضايا الاجتماعية والثقافية المعاصرة",
    emoji: "🌍",
    color: "bg-orange-50 border-orange-200",
    topics: ["culture", "society", "arts"],
  },
]

const topNewcomerEpisodes = [
  "اكتشاف-الذات",
  "رحلة-القيادة",
  "التواصل-الفعال",
  "بناء-العادات",
  "المعنى-في-الحياة",
]

interface StartHerePageProps {
  searchParams: Promise<{
    path?: string
  }>
}

async function PathEpisodes({ topicSlugs }: { topicSlugs: string[] }) {
  const episodes = await getEpisodesByTopicPath(topicSlugs)

  if (episodes.length === 0) {
    return (
      <p className="text-center text-muted-foreground">
        لا توجد حلقات في هذا المسار حالياً
      </p>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {episodes.map((episode) => (
        <EpisodeCard key={episode.id} episode={episode} />
      ))}
    </div>
  )
}

function EpisodesSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default async function StartHerePage({ searchParams }: StartHerePageProps) {
  const { path: selectedPath } = await searchParams
  const activePath = topicPaths.find((p) => p.slug === selectedPath)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">ابدأ من هنا</h1>
        <p className="mt-2 text-muted-foreground">
          اختر المسار الذي يناسب اهتماماتك واستكشف أفضل الحلقات
        </p>
      </div>

      {/* Topic Paths Grid */}
      <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topicPaths.map((path) => (
          <Link
            key={path.slug}
            href={`/start-here?path=${path.slug}`}
            scroll={false}
          >
            <Card
              className={`h-full cursor-pointer transition-all hover:shadow-lg ${
                selectedPath === path.slug
                  ? "ring-2 ring-primary"
                  : ""
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{path.emoji}</span>
                  <CardTitle className="text-lg">{path.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {path.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Selected Path Episodes */}
      {activePath && (
        <div className="mb-12">
          <div className="mb-6 flex items-center gap-3">
            <span className="text-3xl">{activePath.emoji}</span>
            <div>
              <h2 className="text-2xl font-bold">{activePath.name}</h2>
              <p className="text-muted-foreground">{activePath.description}</p>
            </div>
          </div>
          <Suspense fallback={<EpisodesSkeleton />}>
            <PathEpisodes topicSlugs={activePath.topics} />
          </Suspense>
        </div>
      )}

      {/* Top 10 for Newcomers */}
      <div className="rounded-xl border bg-muted/30 p-6">
        <div className="mb-6 text-center">
          <Badge variant="secondary" className="mb-2">
            للمستمعين الجدد
          </Badge>
          <h2 className="text-2xl font-bold">أفضل 10 حلقات للبدء</h2>
          <p className="mt-2 text-muted-foreground">
            إذا كنت جديداً على البودكاست، نوصي بهذه الحلقات المميزة
          </p>
        </div>
        <Suspense fallback={<EpisodesSkeleton />}>
          <PathEpisodes topicSlugs={topNewcomerEpisodes} />
        </Suspense>
        <div className="mt-6 text-center">
          <Link
            href="/episodes"
            className="text-sm font-medium text-primary hover:underline"
          >
            استعرض جميع الحلقات ←
          </Link>
        </div>
      </div>
    </div>
  )
}
