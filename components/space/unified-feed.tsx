"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FeedCard } from "./feed-card"
import { Button } from "@/components/ui/button"
import { Loader2, ChevronDown } from "lucide-react"
import type { FeedItem } from "@/types/space"

interface UnifiedFeedProps {
  items: FeedItem[]
  pageSize?: number
  activeTag?: string // For contextual empty state
}

export function UnifiedFeed({ items, pageSize = 6, activeTag }: UnifiedFeedProps) {
  const [displayCount, setDisplayCount] = useState(pageSize)
  const [isLoading, setIsLoading] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const visibleItems = items.slice(0, displayCount)
  const hasMore = displayCount < items.length

  // Separate featured items from regular items
  // Show first featured as hero, next 2 as secondary featured, rest as regular
  const allFeaturedItems = visibleItems.filter((item) => item.featured)
  const heroItem = allFeaturedItems[0]
  const secondaryFeaturedItems = allFeaturedItems.slice(1, 3) // Up to 2 more featured
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
        {activeTag ? (
          // Contextual empty state for tag filtering
          <>
            <p className="text-muted-foreground">
              لا يوجد محتوى في موضوع &quot;{activeTag}&quot;
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              جرّب اختيار موضوع آخر أو كن أول من يكتب عن هذا الموضوع
            </p>
          </>
        ) : (
          // Generic empty state
          <>
            <p className="text-muted-foreground">لا يوجد محتوى حتى الآن</p>
            <p className="mt-1 text-sm text-muted-foreground">
              كن أول من يشارك أفكاره مع المجتمع
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hero Featured Item */}
      {heroItem && (
        <div className="mb-6">
          <FeedCard item={heroItem} />
        </div>
      )}

      {/* Secondary Featured Items - Grid of 2 */}
      {secondaryFeaturedItems.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {secondaryFeaturedItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Regular Items */}
      {regularItems.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}

      {/* Loading / Load More Trigger */}
      <div ref={loadMoreRef} className="py-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">جارٍ التحميل...</span>
          </div>
        ) : hasMore ? (
          /* Manual Load More Button - fallback for slow networks */
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              className="gap-2"
            >
              <ChevronDown className="h-4 w-4" />
              عرض المزيد
            </Button>
          </div>
        ) : items.length > pageSize ? (
          <p className="text-center text-sm text-muted-foreground">
            لقد وصلت لنهاية المحتوى
          </p>
        ) : null}
      </div>
    </div>
  )
}
