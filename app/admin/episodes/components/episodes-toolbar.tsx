"use client"

import { useState, useEffect, useTransition } from "react"
import {
  Search,
  X,
  RefreshCw,
  LayoutGrid,
  List,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/shared/formatters"
import { invalidateEpisodeCacheAction, getEpisodeCacheStatusAction } from "../actions"
import { ImportFromYoutubeButton } from "./import-dialog"

interface EpisodesToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  viewMode: "grid" | "list"
  onViewModeChange: (mode: "grid" | "list") => void
}

export function EpisodesToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: EpisodesToolbarProps) {
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

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث عن حلقة..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 rounded-lg border-border/40 bg-card/60 ps-10 text-[13px] backdrop-blur-sm transition-all focus:border-primary/50 focus:bg-card"
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
      <div className="flex overflow-hidden rounded-lg border border-border/40">
        <button
          onClick={() => onViewModeChange("grid")}
          className={`flex h-9 w-9 items-center justify-center transition-all ${
            viewMode === "grid"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground"
          }`}
          aria-label="عرض شبكي"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={`flex h-9 w-9 items-center justify-center border-s border-border/40 transition-all ${
            viewMode === "list"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground"
          }`}
          aria-label="عرض قائمة"
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Primary action: safe, date-scoped import */}
      <ImportFromYoutubeButton />

      {/* Secondary: manual cache refresh (a.k.a "Full Sync"). Not used in the
          normal workflow — only for admins who want to force-refresh the
          YouTube cache. Deleted episodes remain blocked by tombstones. */}
      <Button
        variant="ghost"
        onClick={handleRefreshCache}
        disabled={isRefreshing}
        className="h-9 gap-2 rounded-lg px-3 text-[11px] text-muted-foreground/70 hover:text-foreground"
        title={
          cacheInfo?.fetchedAt
            ? `مزامنة كاملة (تحديث الذاكرة المؤقتة). آخر تحديث: ${formatDateTime(cacheInfo.fetchedAt)}`
            : "مزامنة كاملة (تحديث الذاكرة المؤقتة). الحلقات المحذوفة تبقى محجوبة."
        }
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        <span className="hidden lg:inline">مزامنة كاملة</span>
      </Button>
    </div>
  )
}
