"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { ArrowUpDown, Tag } from "lucide-react"
import type { EpisodeCategory } from "@/types/database"

interface EpisodeFiltersProps {
  counts?: Record<string, number>
  categories?: EpisodeCategory[]
}

export function EpisodeFilters({ counts, categories }: EpisodeFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSort = searchParams.get("sort") || "newest"
  const currentCategory = searchParams.get("category") || null

  const totalCount = counts?.["all"]

  const toggleSort = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (currentSort === "newest") {
      params.set("sort", "oldest")
    } else {
      params.delete("sort")
    }
    router.push(`/episodes?${params.toString()}`)
  }

  const setCategory = (slug: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (slug) {
      params.set("category", slug)
    } else {
      params.delete("category")
    }
    // Reset sort when changing category
    params.delete("sort")
    router.push(`/episodes?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCategory(null)}
            className={`border px-4 py-2 text-[10px] font-bold tracking-[0.15em] transition-all duration-300 ${
              !currentCategory
                ? "border-primary bg-primary text-background"
                : "border-primary/20 text-primary/60 hover:border-primary/40 hover:text-primary"
            }`}
          >
            الكل
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.slug)}
              className={`border px-4 py-2 text-[10px] font-bold tracking-[0.15em] transition-all duration-300 ${
                currentCategory === cat.slug
                  ? "border-primary bg-primary text-background"
                  : "border-primary/20 text-primary/60 hover:border-primary/40 hover:text-primary"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Count + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-4" role="toolbar" aria-label="فلتر الحلقات">
        <div className="text-sm text-muted-foreground">
          {totalCount !== undefined && totalCount > 0 && (
            <span>{totalCount} حلقة</span>
          )}
        </div>

        <button
          onClick={toggleSort}
          aria-label={currentSort === "newest" ? "ترتيب من الأقدم" : "ترتيب من الأحدث"}
          className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          <ArrowUpDown className="h-4 w-4" />
          <span>{currentSort === "newest" ? "الأحدث" : "الأقدم"}</span>
        </button>
      </div>
    </div>
  )
}
