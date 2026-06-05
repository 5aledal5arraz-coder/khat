"use client"

import { useState, useRef, useEffect } from "react"
import { MoreVertical } from "lucide-react"
import type { AdminEpisodeView, AdminGuestView, EpisodeCategory } from "@/types/database"
import type { EpisodeOverride, EpisodeQuotesConfig } from "@/types/episodes"
import type { YouTubePackConfig } from "@/types/youtube-pack"

/* ─── Types (re-exported from canonical types/database.ts) ─── */

export type { AdminEpisodeView, AdminGuestView, EpisodeCategory } from "@/types/database"

export interface CategoryWithCount extends EpisodeCategory {
  episodeCount: number
}

export interface EpisodesPageData {
  episodes: AdminEpisodeView[]
  overrides: EpisodeOverride[]
  guests: AdminGuestView[]
  categories: CategoryWithCount[]
  quotesConfig: EpisodeQuotesConfig
  youtubePackConfig: YouTubePackConfig
  hiddenEpisodeIds: string[]
  deletedEpisodeIds: string[]
}

/* ─── Formatters (re-exported from shared module) ─── */

export { formatDuration, formatDate } from "@/lib/shared/formatters"

/* ─── Action Menu (three-dot dropdown) ─── */

export function ActionMenu({
  children,
}: {
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="خيارات"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-border/30 bg-card/95 py-1 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/* ─── Menu Item ─── */

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: "default" | "danger"
}) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-all duration-200 disabled:opacity-50 ${
        variant === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted/40"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {label}
    </button>
  )
}
