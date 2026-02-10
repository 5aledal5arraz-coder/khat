import Link from "next/link"
import { getAllPaths } from "@/lib/emotional-paths"
import { Card, CardContent } from "@/components/ui/card"
import { Users, Rocket, Heart, Eye, ArrowLeft } from "lucide-react"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  Rocket,
  Heart,
  Eye,
}

export default async function PathsIndexPage() {
  const paths = await getAllPaths()

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">مسارات الاستماع</h1>
          <p className="text-muted-foreground">
            اختر المسار اللي يناسب مزاجك واستكشف حلقات مختارة بعناية
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {paths.map((path) => {
            const Icon = iconMap[path.icon] || Heart

            return (
              <Link key={path.id} href={`/paths/${path.slug}`}>
                <Card className="group h-full transition-all hover:shadow-lg hover:border-primary/50">
                  <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${path.color}20` }}
                    >
                      <span style={{ color: path.color }}>
                        <Icon className="h-8 w-8" />
                      </span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
                        {path.title}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {path.subtitle}
                      </p>
                    </div>
                    {path.episode_ids.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {path.episode_ids.length} حلقة
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      استكشف
                      <ArrowLeft className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
