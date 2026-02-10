"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface EpisodeFiltersProps {
  counts?: Record<string, number>
  sections?: { id: string; label: string }[]
}

export function EpisodeFilters({ counts, sections }: EpisodeFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get("category") || "all"
  const currentSort = searchParams.get("sort") || "newest"

  // Build categories from admin sections, with "الكل" always first
  const categories = [
    { id: "all", label: "الكل" },
    ...(sections || []),
  ]

  const updateParams = (key: string, value: string, defaultValue: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== defaultValue) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/episodes?${params.toString()}`)
  }

  const updateCategory = (category: string) => {
    updateParams("category", category, "all")
  }

  const toggleSort = () => {
    updateParams("sort", currentSort === "newest" ? "oldest" : "newest", "newest")
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4" role="toolbar" aria-label="تصفية الحلقات">
      <div className="flex flex-wrap gap-2" role="group" aria-label="التصنيفات">
        {categories.map((category) => {
          const count = counts?.[category.id]
          const isSelected = currentCategory === category.id
          return (
            <button
              key={category.id}
              onClick={() => updateCategory(category.id)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {category.label}
              {count !== undefined && count > 0 && (
                <span className="ms-1.5 text-xs opacity-70">({count})</span>
              )}
            </button>
          )
        })}
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
  )
}
