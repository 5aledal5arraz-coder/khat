"use client"

import { useState } from "react"
import { EpisodesHeader } from "./components/episodes-header"
import { EpisodesToolbar } from "./components/episodes-toolbar"
import { EpisodesGrid } from "./components/episodes-grid"
import { CategoryManager } from "./components/category-manager"
import type { EpisodesPageData } from "./components/shared"

export function EpisodesListing({
  episodes,
  overrides,
  guests,
  categories,
  quotesConfig,
  youtubePackConfig,
  hiddenEpisodeIds,
  deletedEpisodeIds,
}: EpisodesPageData) {
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const hiddenSet = new Set(hiddenEpisodeIds)
  const hiddenCount = episodes.filter((ep) => hiddenSet.has(ep.id)).length
  const totalHours = Math.round(
    episodes.reduce((sum, ep) => sum + ep.duration_minutes, 0) / 60
  )

  // Filter by selected category
  const filteredByCategory = activeCategory === "__uncategorized"
    ? episodes.filter((ep) => !ep.category_id)
    : activeCategory
    ? episodes.filter((ep) => ep.category_id === activeCategory)
    : episodes

  return (
    <div className="space-y-6">
      <EpisodesHeader
        totalEpisodes={episodes.length}
        hiddenCount={hiddenCount}
        totalHours={totalHours}
      />

      {/* Category filter tabs + manager */}
      <CategoryManager
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        totalEpisodes={episodes.length}
        uncategorizedCount={episodes.filter((ep) => !ep.category_id).length}
      />

      <EpisodesToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <EpisodesGrid
        episodes={filteredByCategory}
        overrides={overrides}
        guests={guests}
        categories={categories}
        quotesConfig={quotesConfig}
        youtubePackConfig={youtubePackConfig}
        hiddenEpisodeIds={hiddenEpisodeIds}
        deletedEpisodeIds={deletedEpisodeIds}
        search={search}
        viewMode={viewMode}
      />
    </div>
  )
}
