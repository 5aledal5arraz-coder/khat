"use client"

import { useState, useTransition } from "react"
import { EpisodeCard } from "./episode-card"
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
    <div className="space-y-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 sm:gap-12">
        {episodes.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} />
        ))}
      </div>

      {hasMore && (
        <div className="flex flex-col items-center gap-3 pt-4">
          {loadError && (
            <p className="text-xs text-destructive">صار خطأ بالتحميل، حاول مرة ثانية</p>
          )}
          <button
            onClick={loadMore}
            disabled={isPending}
            className="border border-primary/20 px-10 py-4 text-[10px] font-bold tracking-[0.3em] text-primary transition-all duration-500 hover:bg-primary hover:text-background disabled:opacity-50"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                جارٍ التحميل...
              </span>
            ) : loadError ? (
              "حاول مرة ثانية"
            ) : (
              <>
                تحميل المزيد
                <span className="ms-2 text-primary/40">
                  ({episodes.length} / {totalCount})
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {!hasMore && episodes.length > EPISODES_PER_PAGE && (
        <p role="status" aria-live="polite" className="text-center text-[10px] tracking-[0.2em] text-muted-foreground/40">
          هذي كل الحلقات ({totalCount})
        </p>
      )}
    </div>
  )
}
