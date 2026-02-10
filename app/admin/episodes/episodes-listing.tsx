"use client"

import { useState, useCallback } from "react"
import { EpisodesHeader } from "./components/episodes-header"
import { EpisodesToolbar } from "./components/episodes-toolbar"
import { EpisodesGrid } from "./components/episodes-grid"
import type { EpisodesPageData } from "./components/shared"

export function EpisodesListing({
  episodes,
  overrides,
  sectionsConfig,
  guestAssignments,
  guests,
  quotesConfig,
  youtubePackConfig,
}: EpisodesPageData) {
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const { sections, assignments, hiddenEpisodes, deletedEpisodes } = sectionsConfig
  const hiddenSet = new Set(hiddenEpisodes)
  const deletedSet = new Set(deletedEpisodes)

  const isEpisodeHidden = useCallback(
    (epId: string) => {
      if (hiddenSet.has(epId)) return true
      const secId = assignments[epId]
      if (secId) {
        const section = sections.find((s) => s.id === secId)
        if (section?.hidden) return true
      }
      return false
    },
    [hiddenSet, assignments, sections]
  )

  // Compute stats
  const activeEpisodes = episodes.filter((ep) => !deletedSet.has(ep.id))
  const hiddenCount = episodes.filter(
    (ep) => isEpisodeHidden(ep.id) && !deletedSet.has(ep.id)
  ).length
  const totalHours = Math.round(
    episodes.reduce((sum, ep) => sum + ep.duration_minutes, 0) / 60
  )
  const deletedCount = episodes.filter((ep) => deletedSet.has(ep.id)).length

  // Section counts
  const sectionCounts = new Map<string, number>()
  for (const section of sections) {
    sectionCounts.set(
      section.id,
      activeEpisodes.filter((ep) => assignments[ep.id] === section.id).length
    )
  }
  const uncategorizedCount = activeEpisodes.filter(
    (ep) => !assignments[ep.id]
  ).length

  return (
    <div className="space-y-8">
      <EpisodesHeader
        totalEpisodes={episodes.length}
        totalSections={sections.length}
        hiddenCount={hiddenCount}
        totalHours={totalHours}
      />

      <EpisodesToolbar
        search={search}
        onSearchChange={setSearch}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        sections={sections}
        sectionCounts={sectionCounts}
        totalCount={episodes.length}
        uncategorizedCount={uncategorizedCount}
        deletedCount={deletedCount}
      />

      <EpisodesGrid
        episodes={episodes}
        overrides={overrides}
        sectionsConfig={sectionsConfig}
        guestAssignments={guestAssignments}
        guests={guests}
        quotesConfig={quotesConfig}
        youtubePackConfig={youtubePackConfig}
        search={search}
        activeFilter={activeFilter}
      />
    </div>
  )
}
