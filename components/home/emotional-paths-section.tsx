"use client"

import Link from "next/link"
import type { EmotionalPath } from "@/types/database"
import { Card, CardContent } from "@/components/ui/card"
import { Users, Rocket, Heart, Eye } from "lucide-react"
import { trackEvent } from "@/lib/personalization/tracker"
import { formatArabicCount } from "@/lib/utils"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  Rocket,
  Heart,
  Eye,
}

interface Props {
  paths: EmotionalPath[]
}

export function EmotionalPathsSection({ paths }: Props) {
  if (paths.length === 0) return null

  return (
    <section className="py-12">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold md:text-3xl">ايش تبي تسمع اليوم؟</h2>
        <p className="mt-2 text-muted-foreground">اختر المسار اللي يناسب مزاجك</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {paths.map((path) => {
          const Icon = iconMap[path.icon] || Heart
          const hasEpisodes = path.episode_ids.length > 0

          return (
            <Link
              key={path.id}
              href={hasEpisodes ? `/paths/${path.slug}` : "#"}
              onClick={(e) => {
                if (!hasEpisodes) {
                  e.preventDefault()
                  return
                }
                trackEvent("path_click", path.slug, { mood: path.title })
              }}
              aria-disabled={!hasEpisodes}
            >
              <Card className={`group h-full transition-all ${hasEpisodes ? "hover:shadow-lg hover:border-primary/50 cursor-pointer" : "opacity-60 cursor-default"}`}>
                <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${path.color}20` }}
                  >
                    <span style={{ color: path.color }}>
                      <Icon className="h-7 w-7" />
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {path.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {path.subtitle}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {hasEpisodes
                      ? formatArabicCount(path.episode_ids.length, "حلقة")
                      : "قريباً"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
