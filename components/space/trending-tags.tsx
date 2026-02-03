"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

interface TrendingTagsProps {
  tags: string[]
  allTags?: string[]
}

export function TrendingTags({ tags, allTags = [] }: TrendingTagsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTag = searchParams.get("tag")

  const handleTagClick = (tag: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tag) {
      params.set("tag", tag)
    } else {
      params.delete("tag")
    }
    router.push(`/space?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {/* All button */}
      <button
        onClick={() => handleTagClick(null)}
        className={cn(
          "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          !currentTag
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        )}
      >
        الكل
      </button>

      {/* Trending tags */}
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => handleTagClick(tag)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            currentTag === tag
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {tag}
        </button>
      ))}

      {/* More tags from allTags that aren't in trending */}
      {allTags
        .filter((t) => !tags.includes(t))
        .slice(0, 3)
        .map((tag) => (
          <button
            key={tag}
            onClick={() => handleTagClick(tag)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              currentTag === tag
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tag}
          </button>
        ))}
    </div>
  )
}
