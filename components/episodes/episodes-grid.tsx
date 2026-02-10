"use client"

import { useState, useTransition } from "react"
import { EpisodeCard } from "./episode-card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { Episode, Guest } from "@/types/database"

interface EpisodesGridProps {
  initialEpisodes: (Episode & { guest?: Guest | null })[]
  totalCount: number
  category?: string
  sort?: string
  search?: string
}

const EPISODES_PER_PAGE = 9

export function EpisodesGrid({
  initialEpisodes,
  totalCount,
  category,
  sort,
  search,
}: EpisodesGridProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [page, setPage] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [loadError, setLoadError] = useState(false)

  const hasMore = episodes.length < totalCount

  const loadMore = async () => {
    setLoadError(false)
    startTransition(async () => {
      const nextPage = page + 1
      const offset = nextPage * EPISODES_PER_PAGE

      // Fetch more episodes
      const params = new URLSearchParams()
      params.set("offset", offset.toString())
      params.set("limit", EPISODES_PER_PAGE.toString())
      if (category) params.set("category", category)
      if (sort) params.set("sort", sort)
      if (search) params.set("search", search)

      try {
        const res = await fetch(`/api/episodes?${params.toString()}`)
        if (!res.ok) throw new Error("fetch failed")
        const newEpisodes = await res.json()

        if (Array.isArray(newEpisodes) && newEpisodes.length > 0) {
          setEpisodes((prev) => [...prev, ...newEpisodes])
          setPage(nextPage)
        }
      } catch (error) {
        console.error("Failed to load more episodes:", error)
        setLoadError(true)
      }
    })
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {episodes.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} />
        ))}
      </div>

      {hasMore && (
        <div className="flex flex-col items-center gap-2 pt-4">
          {loadError && (
            <p className="text-sm text-destructive">حدث خطأ أثناء التحميل. حاول مرة أخرى.</p>
          )}
          <Button
            variant="outline"
            size="lg"
            onClick={loadMore}
            disabled={isPending}
            className="min-w-[200px]"
          >
            {isPending ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                جاري التحميل...
              </>
            ) : loadError ? (
              "إعادة المحاولة"
            ) : (
              <>
                تحميل المزيد
                <span className="ms-2 text-muted-foreground">
                  ({episodes.length} / {totalCount})
                </span>
              </>
            )}
          </Button>
        </div>
      )}

      {!hasMore && episodes.length > EPISODES_PER_PAGE && (
        <p className="text-center text-sm text-muted-foreground">
          تم عرض جميع الحلقات ({totalCount})
        </p>
      )}
    </div>
  )
}
