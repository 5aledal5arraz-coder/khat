import { Metadata } from "next"
import { SpaceHeroComposer } from "@/components/space/space-hero-composer"
import { UnifiedFeed } from "@/components/space/unified-feed"
import { TrendingTags } from "@/components/space/trending-tags"
import { SortDropdown } from "@/components/space/sort-dropdown"
import { ContextualSidebar } from "@/components/space/contextual-sidebar"
import { DraftIndicator } from "@/components/space/draft-indicator"
import {
  trendingTags,
  allTags,
  writingPrompts,
} from "@/lib/space-data"
import {
  getTopContributors,
  getWeeklyHighlights,
  getUnifiedFeed,
  type FeedSortOption,
} from "@/lib/space-queries"

export const metadata: Metadata = {
  title: "حبر",
  description: "شارك أفكارك وخواطرك مع مجتمع خط",
}

interface SpacePageProps {
  searchParams: Promise<{
    tag?: string
    sort?: string
  }>
}

export default async function SpacePage({ searchParams }: SpacePageProps) {
  const params = await searchParams
  const sort = (params.sort || "newest") as FeedSortOption
  const tag = params.tag

  // Get data
  const [feedItems, topContributors, weeklyHighlights] = await Promise.all([
    getUnifiedFeed({ sort, tag, limit: 30 }),
    getTopContributors(),
    getWeeklyHighlights(),
  ])

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Draft Indicator - Shows only if user has drafts */}
      <div className="mb-6">
        <DraftIndicator />
      </div>

      {/* Hero Composer */}
      <SpaceHeroComposer />

      {/* Main Content Area */}
      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        {/* Main Feed */}
        <main className="flex-1 min-w-0">
          {/* Filter Bar */}
          <div className="mb-6 flex items-center justify-between gap-4">
            <TrendingTags tags={trendingTags} allTags={allTags} />
            <SortDropdown />
          </div>

          {/* Active Tag Indicator */}
          {tag && (
            <div className="mb-4 text-sm text-muted-foreground">
              عرض المحتوى في موضوع: <span className="font-medium text-foreground">{tag}</span>
            </div>
          )}

          {/* Unified Feed */}
          <UnifiedFeed items={feedItems} pageSize={6} activeTag={tag} />
        </main>

        {/* Sidebar - Desktop Only */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-24">
            <ContextualSidebar
              weeklyHighlights={weeklyHighlights}
              topContributors={topContributors}
              writingPrompts={writingPrompts}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
