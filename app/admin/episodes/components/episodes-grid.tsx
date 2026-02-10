"use client"

import { useState, useCallback } from "react"
import {
  CheckSquare,
  Square,
  MinusSquare,
  Trash2,
  ChevronLeft,
  Eye,
  EyeOff,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatArabicCount } from "@/lib/utils"
import { normalizeArabic } from "@/lib/search"
import {
  bulkAssignSection,
  bulkDeleteEpisodes,
  toggleSectionVisibility,
} from "../actions"
import { EpisodeCard } from "./episode-card"
import type { Episode, AdminGuest } from "./shared"
import type {
  EpisodeOverride,
  EpisodeSection,
  EpisodeSectionsConfig,
  EpisodeQuotesConfig,
  YouTubePackConfig,
} from "@/types/ads"

interface EpisodesGridProps {
  episodes: Episode[]
  overrides: EpisodeOverride[]
  sectionsConfig: EpisodeSectionsConfig
  guestAssignments: Record<string, string>
  guests: AdminGuest[]
  quotesConfig: EpisodeQuotesConfig
  youtubePackConfig: YouTubePackConfig
  search: string
  activeFilter: string | null
}

export function EpisodesGrid({
  episodes,
  overrides,
  sectionsConfig,
  guestAssignments,
  guests,
  quotesConfig,
  youtubePackConfig,
  search,
  activeFilter,
}: EpisodesGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [togglingSection, setTogglingSection] = useState<string | null>(null)

  const overrideMap = new Map(overrides.map((o) => [o.id, o]))
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

  // Filtered episodes (Arabic-aware search)
  const normalizedSearch = normalizeArabic(search)
  const filteredEpisodes = !normalizedSearch
    ? episodes
    : episodes.filter(
        (ep) =>
          normalizeArabic(ep.title).includes(normalizedSearch) ||
          (overrideMap.get(ep.id)?.customTitle &&
            normalizeArabic(overrideMap.get(ep.id)!.customTitle).includes(
              normalizedSearch
            ))
      )

  const activeEpisodes = filteredEpisodes.filter((ep) => !deletedSet.has(ep.id))
  const deletedFilteredEpisodes = filteredEpisodes.filter((ep) =>
    deletedSet.has(ep.id)
  )

  // Section-filtered episodes
  const sectionFilteredEpisodes = activeFilter
    ? activeFilter === "__deleted"
      ? deletedFilteredEpisodes
      : activeFilter === "__uncategorized"
      ? activeEpisodes.filter((ep) => !assignments[ep.id])
      : activeEpisodes.filter((ep) => assignments[ep.id] === activeFilter)
    : filteredEpisodes

  // Grouped view for "all" tab
  const groupedEpisodes =
    activeFilter === null
      ? (() => {
          const groups: {
            id: string
            section: EpisodeSection | null
            episodes: Episode[]
            isDeletedGroup?: boolean
          }[] = []
          const sortedSections = [...sections].sort((a, b) => a.order - b.order)
          for (const section of sortedSections) {
            const sectionEps = activeEpisodes.filter(
              (ep) => assignments[ep.id] === section.id
            )
            if (sectionEps.length > 0) {
              groups.push({ id: section.id, section, episodes: sectionEps })
            }
          }
          const uncategorized = activeEpisodes.filter((ep) => !assignments[ep.id])
          if (uncategorized.length > 0) {
            groups.push({
              id: "__uncategorized",
              section: null,
              episodes: uncategorized,
            })
          }
          if (deletedFilteredEpisodes.length > 0) {
            groups.push({
              id: "__deleted",
              section: null,
              episodes: deletedFilteredEpisodes,
              isDeletedGroup: true,
            })
          }
          return groups
        })()
      : null

  // Select helpers
  const visibleEpisodes =
    activeFilter !== null ? sectionFilteredEpisodes : filteredEpisodes
  const allSelected =
    visibleEpisodes.length > 0 &&
    visibleEpisodes.every((ep) => selectedIds.has(ep.id))
  const someSelected = visibleEpisodes.some((ep) => selectedIds.has(ep.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection()
    } else {
      setSelectedIds(new Set(visibleEpisodes.map((ep) => ep.id)))
    }
  }

  const handleBulkMove = async (sectionId: string) => {
    setBulkActing(true)
    await bulkAssignSection(Array.from(selectedIds), sectionId || null)
    clearSelection()
    setBulkActing(false)
  }

  const handleBulkDelete = async () => {
    setBulkActing(true)
    await bulkDeleteEpisodes(Array.from(selectedIds))
    clearSelection()
    setBulkActing(false)
  }

  const toggleCollapse = (groupId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleToggleSectionVisibility = async (sectionId: string) => {
    setTogglingSection(sectionId)
    await toggleSectionVisibility(sectionId)
    setTogglingSection(null)
  }

  const renderEpisodeCard = (episode: Episode) => (
    <EpisodeCard
      key={episode.id}
      episode={episode}
      override={overrideMap.get(episode.id) || null}
      sections={sections}
      currentSectionId={assignments[episode.id] || null}
      isHidden={isEpisodeHidden(episode.id)}
      isDeleted={deletedSet.has(episode.id)}
      isSelected={selectedIds.has(episode.id)}
      onToggleSelect={() => toggleSelect(episode.id)}
      guests={guests}
      currentGuestId={
        guestAssignments[episode.id] || episode.guestId || null
      }
      quotesEntry={quotesConfig[episode.id] || null}
      youtubePackEntry={youtubePackConfig[episode.id] || null}
    />
  )

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center gap-4 rounded-2xl border border-border/30 bg-card/50 px-5 py-3 backdrop-blur-sm">
        <button
          onClick={handleSelectAll}
          aria-label={allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
          className="shrink-0 text-muted-foreground transition-all hover:text-foreground"
        >
          {allSelected ? (
            <CheckSquare className="h-[18px] w-[18px] text-primary" />
          ) : someSelected ? (
            <MinusSquare className="h-[18px] w-[18px] text-primary" />
          ) : (
            <Square className="h-[18px] w-[18px]" />
          )}
        </button>
        <span className="text-xs font-medium text-muted-foreground">
          {selectedIds.size > 0
            ? `${selectedIds.size} محدد`
            : formatArabicCount(
                activeFilter !== null
                  ? sectionFilteredEpisodes.length
                  : filteredEpisodes.length,
                "حلقة"
              )}
        </span>

        {/* Inline bulk actions */}
        {selectedIds.size > 0 && (
          <>
            <div className="h-4 w-px bg-border/50" />
            <select
              onChange={(e) => {
                if (e.target.value === "__none") handleBulkMove("")
                else if (e.target.value) handleBulkMove(e.target.value)
              }}
              disabled={bulkActing}
              className="h-8 rounded-xl border border-border/50 bg-white/[0.02] px-3 text-xs"
              value=""
            >
              <option value="" disabled>
                نقل إلى...
              </option>
              <option value="__none">غير مصنّف</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkActing}
              className="h-8 gap-1.5 rounded-xl text-xs"
            >
              <Trash2 className="h-3 w-3" />
              حذف
            </Button>
            <button
              onClick={clearSelection}
              disabled={bulkActing}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              إلغاء
            </button>
          </>
        )}
      </div>

      {/* Grid Content */}
      {groupedEpisodes ? (
        // Grouped view (All tab)
        groupedEpisodes.length > 0 ? (
          <div className="space-y-6">
            {groupedEpisodes.map((group) => {
              const isCollapsed = collapsedSections.has(group.id)
              return (
                <div key={group.id}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleCollapse(group.id)}
                    className={`mb-3 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors ${
                      group.isDeletedGroup
                        ? "bg-destructive/[0.03] hover:bg-destructive/[0.06]"
                        : "bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <ChevronLeft
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        isCollapsed ? "" : "-rotate-90"
                      } ${
                        group.isDeletedGroup
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    />
                    {group.isDeletedGroup ? (
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      group.section?.color && (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10"
                          style={{ backgroundColor: group.section.color }}
                        />
                      )
                    )}
                    <span
                      className={`font-semibold ${
                        group.isDeletedGroup ? "text-destructive" : ""
                      }`}
                    >
                      {group.isDeletedGroup
                        ? "محذوف"
                        : group.section?.label || "غير مصنّف"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        group.isDeletedGroup
                          ? "bg-destructive/10 text-destructive"
                          : "bg-white/5 text-muted-foreground"
                      }`}
                    >
                      {group.episodes.length}
                    </span>
                    {group.section?.hidden && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        مخفي
                      </span>
                    )}
                    {group.section && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleSectionVisibility(group.section!.id)
                        }}
                        className={`ms-auto flex h-7 w-7 items-center justify-center rounded-xl transition-all ${
                          group.section.hidden
                            ? "text-destructive hover:bg-destructive/10"
                            : "text-muted-foreground hover:bg-white/5"
                        }`}
                      >
                        {group.section.hidden ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                  </button>

                  {/* Group Grid */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.episodes.map(renderEpisodeCard)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState search={search} />
        )
      ) : // Filtered view
      sectionFilteredEpisodes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sectionFilteredEpisodes.map(renderEpisodeCard)}
        </div>
      ) : (
        <EmptyState search={search} />
      )}
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-border/30 bg-card/50 py-20 text-center backdrop-blur-sm">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-muted-foreground">
        {search ? "لا توجد نتائج" : "لا توجد حلقات"}
      </p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
        {search
          ? `لم يتم العثور على حلقات تطابق "${search}"`
          : "لم يتم إضافة أي حلقات بعد"}
      </p>
    </div>
  )
}
