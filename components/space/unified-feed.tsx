"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FeedCard } from "./feed-card"
import { Loader2 } from "lucide-react"
import type { FeedItem } from "@/types/space"

interface UnifiedFeedProps {
  items: FeedItem[]
  pageSize?: number
}

export function UnifiedFeed({ items, pageSize = 6 }: UnifiedFeedProps) {
  const [displayCount, setDisplayCount] = useState(pageSize)
  const [isLoading, setIsLoading] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const visibleItems = items.slice(0, displayCount)
  const hasMore = displayCount < items.length

  // Find featured item for hero display
  const featuredItem = visibleItems.find((item) => item.featured)
  const regularItems = visibleItems.filter((item) => !item.featured)

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    // Simulate network delay
    setTimeout(() => {
      setDisplayCount((prev) => Math.min(prev + pageSize, items.length))
      setIsLoading(false)
    }, 300)
  }, [isLoading, hasMore, pageSize, items.length])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore()
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasMore, isLoading, loadMore])

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-muted-foreground">لا يوجد محتوى حتى الآن</p>
        <p className="mt-1 text-sm text-muted-foreground">
          كن أول من يشارك أفكاره مع المجتمع
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Featured Item - Hero */}
      {featuredItem && (
        <div className="mb-6">
          <FeedCard item={featuredItem} />
        </div>
      )}

      {/* Regular Items */}
      {regularItems.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}

      {/* Loading / Load More Trigger */}
      <div ref={loadMoreRef} className="py-4">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">جارٍ التحميل...</span>
          </div>
        )}
        {!hasMore && items.length > pageSize && (
          <p className="text-center text-sm text-muted-foreground">
            لقد وصلت لنهاية المحتوى
          </p>
        )}
      </div>
    </div>
  )
}
