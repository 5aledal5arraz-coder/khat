"use client"

import { useState, useEffect, useTransition } from "react"
import {
  Search,
  X,
  EyeOff,
  Trash2,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { deleteSection, invalidateEpisodeCacheAction, getEpisodeCacheStatusAction } from "../actions"
import { SectionDialog } from "./section-dialog"
import type { EpisodeSection } from "@/types/episodes"

interface EpisodesToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  activeFilter: string | null
  onFilterChange: (filter: string | null) => void
  sections: EpisodeSection[]
  sectionCounts: Map<string, number>
  totalCount: number
  uncategorizedCount: number
  deletedCount: number
  viewMode: "grid" | "list"
  onViewModeChange: (mode: "grid" | "list") => void
}

export function EpisodesToolbar({
  search,
  onSearchChange,
  activeFilter,
  onFilterChange,
  sections,
  sectionCounts,
  totalCount,
  uncategorizedCount,
  deletedCount,
  viewMode,
  onViewModeChange,
}: EpisodesToolbarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null)
  const [deletingSection, setDeletingSection] = useState<string | null>(null)
  const [cacheInfo, setCacheInfo] = useState<{ fetchedAt: string | null; isStale: boolean } | null>(null)
  const [isRefreshing, startRefresh] = useTransition()

  useEffect(() => {
    getEpisodeCacheStatusAction().then((status) => setCacheInfo(status)).catch(() => {})
  }, [])

  const handleRefreshCache = () => {
    startRefresh(async () => {
      await invalidateEpisodeCacheAction()
      const status = await getEpisodeCacheStatusAction()
      setCacheInfo(status)
    })
  }

  const handleDeleteSection = async (sectionId: string) => {
    if (confirmDeleteSection !== sectionId) {
      setConfirmDeleteSection(sectionId)
      return
    }
    setDeletingSection(sectionId)
    setConfirmDeleteSection(null)
    await deleteSection(sectionId)
    if (activeFilter === sectionId) onFilterChange(null)
    setDeletingSection(null)
  }

  return (
    <div className="space-y-3">
      {/* Row 1: Search + View toggle + Refresh + New section */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="ابحث عن حلقة..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 rounded-xl border-border/50 bg-card/80 ps-10 text-sm backdrop-blur-sm transition-all focus:border-primary/50 focus:bg-card"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex overflow-hidden rounded-xl border border-border/50">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`flex h-10 w-10 items-center justify-center transition-colors ${
              viewMode === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
            }`}
            aria-label="عرض شبكي"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={`flex h-10 w-10 items-center justify-center border-s border-border/50 transition-colors ${
              viewMode === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
            }`}
            aria-label="عرض قائمة"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <Button
          variant="outline"
          onClick={handleRefreshCache}
          disabled={isRefreshing}
          className="h-10 gap-2 rounded-xl px-3"
          title={cacheInfo?.fetchedAt ? `آخر تحديث: ${new Date(cacheInfo.fetchedAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : "لم يتم التحديث بعد"}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">تحديث</span>
        </Button>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="h-10 gap-2 rounded-xl bg-primary/90 px-4 shadow-lg shadow-primary/20 transition-all hover:bg-primary hover:shadow-primary/30"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">تصنيف جديد</span>
        </Button>
      </div>

      {/* Section Tabs */}
      <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {/* All tab */}
        <button
          onClick={() => onFilterChange(null)}
          className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
            activeFilter === null
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "bg-white/[0.03] text-muted-foreground ring-1 ring-border/50 hover:bg-white/[0.06] hover:text-foreground"
          }`}
        >
          الكل
          <span className="ms-2 text-xs opacity-70">{totalCount}</span>
        </button>

        {/* Section tabs */}
        {sections
          .sort((a, b) => a.order - b.order)
          .map((section) => {
            const count = sectionCounts.get(section.id) || 0
            const isActive = activeFilter === section.id
            return (
              <div key={section.id} className="group/tab relative flex shrink-0">
                <button
                  onClick={() => onFilterChange(section.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "text-white shadow-lg"
                      : "bg-white/[0.03] text-muted-foreground ring-1 ring-border/50 hover:bg-white/[0.06] hover:text-foreground"
                  } ${section.hidden ? "opacity-60" : ""}`}
                  style={
                    isActive && section.color
                      ? {
                          backgroundColor: section.color,
                          boxShadow: `0 8px 24px ${section.color}30`,
                        }
                      : undefined
                  }
                >
                  {!isActive && section.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                      style={{ backgroundColor: section.color }}
                    />
                  )}
                  {section.hidden && <EyeOff className="h-3 w-3 opacity-60" />}
                  {section.label}
                  <span className="text-xs opacity-70">{count}</span>
                </button>
                {/* Delete section on hover */}
                <button
                  onClick={() => handleDeleteSection(section.id)}
                  onMouseLeave={() => {
                    if (confirmDeleteSection === section.id)
                      setConfirmDeleteSection(null)
                  }}
                  disabled={deletingSection === section.id}
                  className={`absolute -end-1 -top-1 z-10 flex items-center justify-center rounded-full text-white shadow-sm transition-all group-hover/tab:opacity-100 ${
                    confirmDeleteSection === section.id
                      ? "h-5 w-5 bg-red-600 opacity-100 animate-pulse"
                      : "h-4 w-4 bg-destructive opacity-0"
                  }`}
                  title={
                    confirmDeleteSection === section.id
                      ? "اضغط مرة أخرى للتأكيد"
                      : "حذف التصنيف"
                  }
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )
          })}

        {/* Uncategorized tab */}
        <button
          onClick={() => onFilterChange("__uncategorized")}
          className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
            activeFilter === "__uncategorized"
              ? "bg-muted text-foreground shadow-lg"
              : "bg-white/[0.03] text-muted-foreground ring-1 ring-border/50 hover:bg-white/[0.06] hover:text-foreground"
          }`}
        >
          غير مصنّف
          <span className="ms-2 text-xs opacity-70">{uncategorizedCount}</span>
        </button>

        {/* Deleted tab */}
        {deletedCount > 0 && (
          <button
            onClick={() => onFilterChange("__deleted")}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
              activeFilter === "__deleted"
                ? "bg-destructive/15 text-destructive shadow-lg shadow-destructive/10 ring-1 ring-destructive/30"
                : "text-destructive/60 ring-1 ring-destructive/20 hover:bg-destructive/5 hover:text-destructive"
            }`}
          >
            <Trash2 className="h-3 w-3" />
            محذوف
            <span className="text-xs opacity-70">{deletedCount}</span>
          </button>
        )}
      </div>

      {showCreateDialog && (
        <SectionDialog onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  )
}
